import { randomBytes } from "node:crypto";
import { Router } from "express";
import { z } from "zod";
import { CURRENCY_CODES, parseAmount } from "@expense/shared/money";
import { prisma } from "../db.js";
import { env } from "../env.js";
import { getAuth, getCtx, requireAuth, requireLedger } from "../middleware/context.js";
import { getLedgerDetails } from "../services/data.js";
import { emails, sendEmail } from "../services/email.js";
import { LedgerError, createSharedLedger, deleteLedgerAndFiles, getLedgerBalances, leaveSharedLedger } from "../services/ledgers.js";
import { badRequest, firstErrors, forbidden, invalid, notFound, text } from "../http.js";
import { bodyOf, param, str } from "./body.js";

const INVITE_DAYS = 7;

export const ledgerRouter = Router();

/** GET /api/context: who you are and the ledger you're in. The web app's session check. */
ledgerRouter.get("/context", requireLedger, (req, res) => {
  res.json(getCtx(req));
});

/** GET /api/ledger: details for settings (members, and pending invites for owners) */
ledgerRouter.get("/ledger", requireLedger, async (req, res) => {
  res.json(await getLedgerDetails(getCtx(req)));
});

const settingsSchema = z.object({
  name: text(60).min(1, "Give it a name."),
  currency: z.enum(CURRENCY_CODES, { error: "Pick a currency." }),
  monthlyBudget: z.string().optional(),
});

ledgerRouter.patch("/ledger", requireLedger, async (req, res) => {
  const ctx = getCtx(req);
  if (!ctx.isOwner) throw forbidden("Only the owner can change these settings.");
  const body = bodyOf(req);
  const parsed = settingsSchema.safeParse({ name: str(body, "name"), currency: str(body, "currency"), monthlyBudget: str(body, "monthlyBudget") });
  if (!parsed.success) throw invalid(firstErrors(parsed.error));

  const raw = parsed.data.monthlyBudget?.trim();
  const monthlyBudget = raw ? parseAmount(raw, parsed.data.currency) : null;
  if (raw && monthlyBudget === null) throw invalid({ monthlyBudget: "Enter a budget greater than zero, or leave it empty." });

  await prisma.ledger.update({
    where: { id: ctx.ledger.id },
    // The personal ledger keeps its name
    data: { name: ctx.isShared ? parsed.data.name : ctx.ledger.name, currency: parsed.data.currency, monthlyBudget },
  });
  res.json({ ok: true });
});

/** DELETE /api/ledger: owner deletes the current household. */
ledgerRouter.delete("/ledger", requireLedger, async (req, res) => {
  const ctx = getCtx(req);
  if (!ctx.isShared) throw badRequest("Your personal ledger can't be deleted.");
  if (!ctx.isOwner) throw forbidden("Only the owner can delete the household.");
  await deleteLedgerAndFiles(ctx.ledger.id);
  res.json({ ok: true });
});

/** POST /api/ledger/leave */
ledgerRouter.post("/ledger/leave", requireLedger, async (req, res) => {
  const ctx = getCtx(req);
  try {
    await leaveSharedLedger(ctx.member.id);
  } catch (error) {
    if (error instanceof LedgerError) throw badRequest(error.message);
    throw error;
  }
  res.json({ ok: true });
});

const householdSchema = z.object({
  name: text(60).min(1, "Name your household."),
  currency: z.enum(CURRENCY_CODES, { error: "Pick a currency." }),
});

/** POST /api/households -> { id }. The web app then makes it the active ledger. */
ledgerRouter.post("/households", requireAuth, async (req, res) => {
  const { user } = getAuth(req);
  const body = bodyOf(req);
  const parsed = householdSchema.safeParse({ name: str(body, "name"), currency: str(body, "currency") });
  if (!parsed.success) throw invalid(firstErrors(parsed.error));
  const ledger = await createSharedLedger(user.id, user.name, parsed.data.name, parsed.data.currency);
  res.status(201).json({ ok: true, id: ledger.id });
});

// ─── Members & invites ───────────────────────────────────────────────────────

ledgerRouter.delete("/ledger/members/:id", requireLedger, async (req, res) => {
  const ctx = getCtx(req);
  const memberId = param(req, "id");
  if (!ctx.isOwner) throw forbidden("Only the owner can remove people.");
  if (memberId === ctx.member.id) throw badRequest("Use “Leave household” to remove yourself.");
  const target = ctx.members.find((m) => m.id === memberId);
  if (!target) throw notFound("They're not in this household.");

  const balance = (await getLedgerBalances(ctx.ledger.id)).get(memberId) ?? 0;
  if (balance !== 0) throw badRequest(`${target.name} has an unsettled balance. Record a settlement first.`);
  await prisma.ledgerMember.update({ where: { id: memberId }, data: { leftAt: new Date(), role: "MEMBER" } });
  res.json({ ok: true });
});

ledgerRouter.post("/ledger/invites", requireLedger, async (req, res) => {
  const ctx = getCtx(req);
  if (!ctx.isShared) throw badRequest("Create a household to invite people.");
  if (!ctx.isOwner) throw forbidden("Only the owner can invite people.");

  const email = str(bodyOf(req), "email").trim().toLowerCase();
  if (!z.email().safeParse(email).success) throw invalid({ email: "Enter a valid email address." });

  const alreadyMember = await prisma.ledgerMember.findFirst({
    where: { ledgerId: ctx.ledger.id, leftAt: null, user: { email: { equals: email, mode: "insensitive" } } },
    select: { id: true },
  });
  if (alreadyMember) throw invalid({ email: "They're already in this household." });

  // Replace any pending invite to the same address
  await prisma.ledgerInvite.deleteMany({ where: { ledgerId: ctx.ledger.id, email, acceptedAt: null } });
  const token = randomBytes(24).toString("base64url");
  await prisma.ledgerInvite.create({
    data: { ledgerId: ctx.ledger.id, email, token, invitedById: ctx.member.id, expiresAt: new Date(Date.now() + INVITE_DAYS * 86_400_000) },
  });
  await sendEmail(emails.invite(email, `${env.APP_URL}/invite/${token}`, ctx.user.name, ctx.ledger.name));
  res.status(201).json({ ok: true });
});

ledgerRouter.delete("/ledger/invites/:id", requireLedger, async (req, res) => {
  const ctx = getCtx(req);
  if (!ctx.isOwner) throw forbidden("Only the owner can manage invites.");
  await prisma.ledgerInvite.deleteMany({ where: { id: param(req, "id"), ledgerId: ctx.ledger.id } });
  res.json({ ok: true });
});

/** GET /api/invites/:token: what the invite is for (for the accept page). */
ledgerRouter.get("/invites/:token", requireAuth, async (req, res) => {
  const invite = await prisma.ledgerInvite.findUnique({
    where: { token: param(req, "token") },
    select: {
      email: true,
      expiresAt: true,
      acceptedAt: true,
      ledger: { select: { name: true, _count: { select: { members: { where: { leftAt: null } } } } } },
      invitedBy: { select: { name: true } },
    },
  });
  if (!invite || invite.acceptedAt || invite.expiresAt < new Date()) throw notFound("This invite is no longer valid.");
  res.json({ email: invite.email, ledgerName: invite.ledger.name, members: invite.ledger._count.members, invitedBy: invite.invitedBy.name });
});

/** POST /api/invites/:token/accept -> { ledgerId }. The signed-in email must match the invite. */
ledgerRouter.post("/invites/:token/accept", requireAuth, async (req, res) => {
  const { user } = getAuth(req);
  const invite = await prisma.ledgerInvite.findUnique({
    where: { token: param(req, "token") },
    select: { id: true, email: true, ledgerId: true, expiresAt: true, acceptedAt: true },
  });
  if (!invite || invite.acceptedAt || invite.expiresAt < new Date()) throw badRequest("This invite is no longer valid.");
  if (invite.email.toLowerCase() !== user.email.toLowerCase()) {
    throw forbidden(`This invite was sent to ${invite.email}. Sign in with that email to accept it.`);
  }

  const existing = await prisma.ledgerMember.findUnique({
    where: { ledgerId_userId: { ledgerId: invite.ledgerId, userId: user.id } },
    select: { id: true },
  });
  await prisma.$transaction([
    existing
      ? prisma.ledgerMember.update({ where: { id: existing.id }, data: { leftAt: null, name: user.name, joinedAt: new Date() } })
      : prisma.ledgerMember.create({ data: { ledgerId: invite.ledgerId, userId: user.id, name: user.name } }),
    prisma.ledgerInvite.update({ where: { id: invite.id }, data: { acceptedAt: new Date() } }),
  ]);
  res.json({ ok: true, ledgerId: invite.ledgerId });
});
