"use server";

import { randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { LEDGER_COOKIE, requireLedger, requireUser } from "@/lib/session";
import { LedgerError, createSharedLedger, deleteLedgerAndFiles, getLedgerBalances, leaveSharedLedger } from "@/lib/ledgers";
import { emails, sendEmail } from "@/lib/email";
import { CURRENCY_CODES, parseAmount } from "@/lib/money";
import { fail, failMessage, firstErrors, text, type ActionResult } from "@/lib/action-utils";

const INVITE_DAYS = 7;

async function setActiveLedger(id: string) {
  (await cookies()).set(LEDGER_COOKIE, id, { httpOnly: true, sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 365 });
}

export async function switchLedger(id: string) {
  const user = await requireUser();
  const member = await prisma.ledgerMember.findFirst({ where: { ledgerId: id, userId: user.id, leftAt: null }, select: { id: true } });
  if (member) await setActiveLedger(id);
  redirect("/dashboard");
}

const householdSchema = z.object({
  name: text(60).min(1, "Name your household."),
  currency: z.enum(CURRENCY_CODES, { error: "Pick a currency." }),
});

export async function createHousehold(formData: FormData): Promise<ActionResult> {
  const user = await requireUser();
  const parsed = householdSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return fail(firstErrors(parsed.error));
  const ledger = await createSharedLedger(user.id, user.name, parsed.data.name, parsed.data.currency);
  await setActiveLedger(ledger.id);
  redirect("/dashboard/settings");
}

const settingsSchema = z.object({
  name: text(60).min(1, "Give it a name."),
  currency: z.enum(CURRENCY_CODES, { error: "Pick a currency." }),
  monthlyBudget: z.string().optional(),
});

export async function updateLedgerSettings(formData: FormData): Promise<ActionResult> {
  const ctx = await requireLedger();
  if (!ctx.isOwner) return failMessage("Only the owner can change these settings.");
  const parsed = settingsSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return fail(firstErrors(parsed.error));

  const raw = parsed.data.monthlyBudget?.trim();
  const monthlyBudget = raw ? parseAmount(raw, parsed.data.currency) : null;
  if (raw && monthlyBudget === null) return fail({ monthlyBudget: "Enter a budget greater than zero, or leave it empty." });

  await prisma.ledger.update({
    where: { id: ctx.ledger.id },
    // The personal ledger keeps its name
    data: { name: ctx.isShared ? parsed.data.name : ctx.ledger.name, currency: parsed.data.currency, monthlyBudget },
  });
  refresh();
  return { ok: true };
}

export async function inviteMember(formData: FormData): Promise<ActionResult> {
  const ctx = await requireLedger();
  if (!ctx.isShared) return failMessage("Create a household to invite people.");
  if (!ctx.isOwner) return failMessage("Only the owner can invite people.");

  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  if (!z.email().safeParse(email).success) return fail({ email: "Enter a valid email address." });

  const alreadyMember = await prisma.ledgerMember.findFirst({
    where: { ledgerId: ctx.ledger.id, leftAt: null, user: { email: { equals: email, mode: "insensitive" } } },
    select: { id: true },
  });
  if (alreadyMember) return fail({ email: "They're already in this household." });

  // Replace any pending invite to the same address
  await prisma.ledgerInvite.deleteMany({ where: { ledgerId: ctx.ledger.id, email, acceptedAt: null } });
  const token = randomBytes(24).toString("base64url");
  await prisma.ledgerInvite.create({
    data: {
      ledgerId: ctx.ledger.id,
      email,
      token,
      invitedById: ctx.member.id,
      expiresAt: new Date(Date.now() + INVITE_DAYS * 86_400_000),
    },
  });

  const url = `${process.env.BETTER_AUTH_URL ?? "http://localhost:3000"}/invite/${token}`;
  await sendEmail(emails.invite(email, url, ctx.user.name, ctx.ledger.name));
  refresh();
  return { ok: true };
}

export async function revokeInvite(id: string): Promise<ActionResult> {
  const ctx = await requireLedger();
  if (!ctx.isOwner) return failMessage("Only the owner can manage invites.");
  await prisma.ledgerInvite.deleteMany({ where: { id, ledgerId: ctx.ledger.id } });
  refresh();
  return { ok: true };
}

/** Accept from /invite/[token]. The signed-in account's email must match the invite. */
export async function acceptInvite(token: string): Promise<ActionResult> {
  const user = await requireUser();
  const invite = await prisma.ledgerInvite.findUnique({
    where: { token },
    select: { id: true, email: true, ledgerId: true, expiresAt: true, acceptedAt: true },
  });
  if (!invite || invite.acceptedAt || invite.expiresAt < new Date()) return failMessage("This invite is no longer valid.");
  if (invite.email.toLowerCase() !== user.email.toLowerCase()) {
    return failMessage(`This invite was sent to ${invite.email}. Sign in with that email to accept it.`);
  }

  const existing = await prisma.ledgerMember.findUnique({
    where: { ledgerId_userId: { ledgerId: invite.ledgerId, userId: user.id } },
    select: { id: true, leftAt: true },
  });
  await prisma.$transaction([
    existing
      ? prisma.ledgerMember.update({ where: { id: existing.id }, data: { leftAt: null, name: user.name, joinedAt: new Date() } })
      : prisma.ledgerMember.create({ data: { ledgerId: invite.ledgerId, userId: user.id, name: user.name } }),
    prisma.ledgerInvite.update({ where: { id: invite.id }, data: { acceptedAt: new Date() } }),
  ]);
  await setActiveLedger(invite.ledgerId);
  redirect("/dashboard");
}

export async function removeMember(memberId: string): Promise<ActionResult> {
  const ctx = await requireLedger();
  if (!ctx.isOwner) return failMessage("Only the owner can remove people.");
  if (memberId === ctx.member.id) return failMessage("Use “Leave household” to remove yourself.");
  const target = ctx.members.find((m) => m.id === memberId);
  if (!target) return failMessage("They're not in this household.");

  const balance = (await getLedgerBalances(ctx.ledger.id)).get(memberId) ?? 0;
  if (balance !== 0) return failMessage(`${target.name} has an unsettled balance. Record a settlement first.`);
  await prisma.ledgerMember.update({ where: { id: memberId }, data: { leftAt: new Date(), role: "MEMBER" } });
  refresh();
  return { ok: true };
}

export async function leaveLedger(): Promise<ActionResult> {
  const ctx = await requireLedger();
  try {
    await leaveSharedLedger(ctx.member.id);
  } catch (error) {
    if (error instanceof LedgerError) return failMessage(error.message);
    throw error;
  }
  (await cookies()).delete(LEDGER_COOKIE);
  redirect("/dashboard");
}

export async function deleteLedger(): Promise<ActionResult> {
  const ctx = await requireLedger();
  if (!ctx.isShared) return failMessage("Your personal ledger can't be deleted.");
  if (!ctx.isOwner) return failMessage("Only the owner can delete the household.");
  await deleteLedgerAndFiles(ctx.ledger.id);
  (await cookies()).delete(LEDGER_COOKIE);
  redirect("/dashboard");
}
