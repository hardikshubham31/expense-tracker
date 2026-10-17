"use server";

import { refresh } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireLedger } from "@/lib/session";
import { parseDateInput } from "@/lib/dates";
import { parseAmount } from "@/lib/money";
import { fail, failMessage, type ActionResult } from "@/lib/action-utils";

export async function recordSettlement(formData: FormData): Promise<ActionResult> {
  const ctx = await requireLedger();
  if (!ctx.isShared) return failMessage("Settlements are only for shared households.");

  const ids = new Set(ctx.members.map((m) => m.id));
  const from = String(formData.get("fromMemberId") ?? "");
  const to = String(formData.get("toMemberId") ?? "");
  const errors: Record<string, string> = {};
  if (!ids.has(from)) errors.fromMemberId = "Pick who paid.";
  if (!ids.has(to)) errors.toMemberId = "Pick who was paid.";
  if (from && from === to) errors.toMemberId = "Pick two different people.";
  const amount = parseAmount(String(formData.get("amount") ?? ""), ctx.ledger.currency);
  if (amount === null) errors.amount = "Enter an amount greater than zero.";
  const date = parseDateInput(String(formData.get("date") ?? "")) ?? ctx.today.date;
  const note = String(formData.get("note") ?? "").trim().slice(0, 200) || null;
  if (Object.keys(errors).length || amount === null) return fail(errors);

  await prisma.settlement.create({ data: { ledgerId: ctx.ledger.id, fromMemberId: from, toMemberId: to, amount, date, note } });
  refresh();
  return { ok: true };
}

export async function deleteSettlement(id: string): Promise<ActionResult> {
  const ctx = await requireLedger();
  await prisma.settlement.deleteMany({ where: { id, ledgerId: ctx.ledger.id } });
  refresh();
  return { ok: true };
}
