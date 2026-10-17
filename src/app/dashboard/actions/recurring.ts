"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireLedger, type LedgerContext } from "@/lib/session";
import { parseDateInput } from "@/lib/dates";
import { parseAmount } from "@/lib/money";
import { fail, failMessage, firstErrors, text, type ActionResult } from "@/lib/action-utils";

const ruleSchema = z.object({
  type: z.enum(["EXPENSE", "INCOME"]),
  description: text(120).min(1, "Add a description."),
  frequency: z.enum(["WEEKLY", "MONTHLY", "YEARLY"], { error: "Pick how often it repeats." }),
  categoryId: z.string().optional(),
  paidById: z.string().optional(),
});

async function parseRule(formData: FormData, ctx: LedgerContext) {
  const parsed = ruleSchema.safeParse(Object.fromEntries(formData));
  const errors: Record<string, string> = parsed.success ? {} : firstErrors(parsed.error);
  const amount = parseAmount(String(formData.get("amount") ?? ""), ctx.ledger.currency);
  if (amount === null) errors.amount = "Enter an amount greater than zero.";
  const startDate = parseDateInput(String(formData.get("startDate") ?? ""));
  if (!startDate) errors.startDate = "Pick the first date.";
  const rawEnd = String(formData.get("endDate") ?? "");
  const endDate = rawEnd ? parseDateInput(rawEnd) : null;
  if (rawEnd && !endDate) errors.endDate = "Pick a valid end date.";
  if (startDate && endDate && endDate < startDate) errors.endDate = "The end date must be after the start date.";
  if (!parsed.success || amount === null || !startDate || Object.keys(errors).length) return { errors };

  let categoryId: string | null = null;
  if (parsed.data.type === "EXPENSE" && parsed.data.categoryId) {
    const owned = await prisma.category.count({ where: { id: parsed.data.categoryId, ledgerId: ctx.ledger.id } });
    if (owned) categoryId = parsed.data.categoryId;
  }
  const paidById =
    parsed.data.type === "EXPENSE" && ctx.isShared && ctx.members.some((m) => m.id === parsed.data.paidById)
      ? parsed.data.paidById!
      : parsed.data.type === "EXPENSE"
        ? ctx.member.id
        : null;

  return {
    data: { type: parsed.data.type, description: parsed.data.description, frequency: parsed.data.frequency, amount, startDate, endDate, categoryId, paidById },
  };
}

export async function createRecurring(formData: FormData): Promise<ActionResult> {
  const ctx = await requireLedger();
  const { data, errors } = await parseRule(formData, ctx);
  if (!data) return fail(errors!);
  // Occurrences on or before today are filled in on the next page load.
  const rule = await prisma.recurringRule.create({
    data: { ...data, nextDate: data.startDate, ledgerId: ctx.ledger.id },
    select: { id: true },
  });
  refresh();
  return { ok: true, id: rule.id };
}

export async function updateRecurring(id: string, formData: FormData): Promise<ActionResult> {
  const ctx = await requireLedger();
  const existing = await prisma.recurringRule.findFirst({ where: { id, ledgerId: ctx.ledger.id }, select: { startDate: true, nextDate: true } });
  if (!existing) return failMessage("That rule no longer exists.");
  const { data, errors } = await parseRule(formData, ctx);
  if (!data) return fail(errors!);

  // Changing the schedule restarts it from the new start date (already-created entries stay).
  const scheduleChanged = data.startDate.getTime() !== existing.startDate.getTime();
  await prisma.recurringRule.update({
    where: { id },
    data: { ...data, ...(scheduleChanged ? { nextDate: data.startDate } : {}), active: true },
  });
  refresh();
  return { ok: true, id };
}

export async function setRecurringActive(id: string, active: boolean): Promise<ActionResult> {
  const ctx = await requireLedger();
  const rule = await prisma.recurringRule.findFirst({ where: { id, ledgerId: ctx.ledger.id }, select: { nextDate: true } });
  if (!rule) return failMessage("That rule no longer exists.");
  // Resuming skips the paused period instead of back-filling it.
  let nextDate = rule.nextDate;
  if (active && nextDate < ctx.today.date) nextDate = ctx.today.date;
  await prisma.recurringRule.update({ where: { id }, data: { active, nextDate } });
  refresh();
  return { ok: true };
}

/** Deleting a rule keeps the entries it already created. */
export async function deleteRecurring(id: string): Promise<ActionResult> {
  const ctx = await requireLedger();
  await prisma.recurringRule.deleteMany({ where: { id, ledgerId: ctx.ledger.id } });
  refresh();
  return { ok: true };
}
