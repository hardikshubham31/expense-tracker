"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireLedger } from "@/lib/session";
import { parseDateInput } from "@/lib/dates";
import { parseAmount } from "@/lib/money";
import { fail, failMessage, firstErrors, text, type ActionResult } from "@/lib/action-utils";

const incomeSchema = z.object({
  source: text(120).min(1, "Where did it come from?"),
  notes: text(500).optional(),
});

function parseIncome(formData: FormData, currency: string) {
  const parsed = incomeSchema.safeParse(Object.fromEntries(formData));
  const errors: Record<string, string> = parsed.success ? {} : firstErrors(parsed.error);
  const amount = parseAmount(String(formData.get("amount") ?? ""), currency);
  if (amount === null) errors.amount = "Enter an amount greater than zero.";
  const date = parseDateInput(String(formData.get("date") ?? ""));
  if (!date) errors.date = "Pick a valid date.";
  if (!parsed.success || amount === null || !date) return { errors };
  return { data: { amount, date, source: parsed.data.source, notes: parsed.data.notes || null } };
}

export async function createIncome(formData: FormData): Promise<ActionResult> {
  const { ledger } = await requireLedger();
  const { data, errors } = parseIncome(formData, ledger.currency);
  if (!data) return fail(errors!);
  const income = await prisma.income.create({ data: { ...data, ledgerId: ledger.id }, select: { id: true } });
  refresh();
  return { ok: true, id: income.id };
}

export async function updateIncome(id: string, formData: FormData): Promise<ActionResult> {
  const { ledger } = await requireLedger();
  const { data, errors } = parseIncome(formData, ledger.currency);
  if (!data) return fail(errors!);
  const { count } = await prisma.income.updateMany({ where: { id, ledgerId: ledger.id }, data });
  if (!count) return failMessage("That entry no longer exists.");
  refresh();
  return { ok: true, id };
}

export async function deleteIncome(id: string): Promise<ActionResult> {
  const { ledger } = await requireLedger();
  await prisma.income.deleteMany({ where: { id, ledgerId: ledger.id } });
  refresh();
  return { ok: true };
}
