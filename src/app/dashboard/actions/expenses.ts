"use server";

import { refresh } from "next/cache";
import { after } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireLedger, type LedgerContext } from "@/lib/session";
import { checkBudgetAlerts } from "@/lib/budget-alerts";
import { deleteReceiptFile } from "@/lib/receipts";
import { monthOf, monthKey, parseDateInput } from "@/lib/dates";
import { parseAmount } from "@/lib/money";
import { equalSplit } from "@/lib/splits";
import { firstErrors, fail, failMessage, text, type ActionResult } from "@/lib/action-utils";

const expenseSchema = z.object({
  description: text(120).min(1, "Add a short description."),
  notes: text(500).optional(),
  categoryId: z.string().optional(),
  paidById: z.string().optional(),
  splitMode: z.enum(["equal", "custom"]).optional(),
});

type ParsedExpense = {
  amount: number;
  date: Date;
  description: string;
  notes: string | null;
  categoryId: string | null;
  paidById: string;
  splits: { memberId: string; amount: number }[];
};

/** Validate the form, including payer and splits in shared ledgers. Collects every field's error. */
async function parseExpense(formData: FormData, ctx: LedgerContext): Promise<{ data?: ParsedExpense; errors?: Record<string, string> }> {
  const parsed = expenseSchema.safeParse(Object.fromEntries(formData));
  const errors: Record<string, string> = parsed.success ? {} : firstErrors(parsed.error);
  const amount = parseAmount(String(formData.get("amount") ?? ""), ctx.ledger.currency);
  if (amount === null) errors.amount = "Enter an amount greater than zero.";
  const date = parseDateInput(String(formData.get("date") ?? ""));
  if (!date) errors.date = "Pick a valid date.";
  if (!parsed.success || amount === null || !date) return { errors };

  const activeIds = new Set(ctx.members.map((m) => m.id));
  let paidById = ctx.member.id;
  let splits: ParsedExpense["splits"] = [];

  if (ctx.isShared) {
    paidById = parsed.data.paidById && activeIds.has(parsed.data.paidById) ? parsed.data.paidById : ctx.member.id;

    if (parsed.data.splitMode === "custom") {
      let sum = 0;
      for (const m of ctx.members) {
        const raw = String(formData.get(`split_${m.id}`) ?? "").trim();
        if (!raw || raw === "0") continue;
        const share = parseAmount(raw, ctx.ledger.currency);
        if (share === null) {
          errors.splits = `Enter a valid amount for ${m.name}.`;
          break;
        }
        splits.push({ memberId: m.id, amount: share });
        sum += share;
      }
      if (!errors.splits && sum !== amount) errors.splits = "The split amounts must add up to the total.";
    } else {
      const included = formData.getAll("splitMembers").map(String).filter((id) => activeIds.has(id));
      if (included.length === 0) errors.splits = "Split with at least one person.";
      else splits = equalSplit(amount, included);
    }
    if (errors.splits) return { errors };
  }

  let categoryId: string | null = parsed.data.categoryId || null;
  if (categoryId) {
    const owned = await prisma.category.count({ where: { id: categoryId, ledgerId: ctx.ledger.id } });
    if (!owned) categoryId = null;
  }

  return {
    data: { amount, date, description: parsed.data.description, notes: parsed.data.notes || null, categoryId, paidById, splits },
  };
}

function alertAfter(ledgerId: string, ...dates: Date[]) {
  const months = new Set(dates.map((d) => monthKey(monthOf(d))));
  after(() => Promise.all([...months].map((m) => checkBudgetAlerts(ledgerId, m))));
}

export async function createExpense(formData: FormData): Promise<ActionResult> {
  const ctx = await requireLedger();
  const { data, errors } = await parseExpense(formData, ctx);
  if (!data) return fail(errors!);

  const { splits, ...fields } = data;
  const expense = await prisma.expense.create({
    data: {
      ...fields,
      ledgerId: ctx.ledger.id,
      createdById: ctx.member.id,
      splits: splits.length ? { createMany: { data: splits } } : undefined,
    },
    select: { id: true },
  });
  alertAfter(ctx.ledger.id, data.date);
  refresh();
  return { ok: true, id: expense.id };
}

export async function updateExpense(id: string, formData: FormData): Promise<ActionResult> {
  const ctx = await requireLedger();
  const existing = await prisma.expense.findFirst({ where: { id, ledgerId: ctx.ledger.id }, select: { date: true } });
  if (!existing) return failMessage("That expense no longer exists.");

  const { data, errors } = await parseExpense(formData, ctx);
  if (!data) return fail(errors!);

  const { splits, ...fields } = data;
  await prisma.$transaction([
    prisma.expenseSplit.deleteMany({ where: { expenseId: id } }),
    prisma.expense.update({
      where: { id },
      data: { ...fields, splits: splits.length ? { createMany: { data: splits } } : undefined },
    }),
  ]);
  alertAfter(ctx.ledger.id, data.date, existing.date);
  refresh();
  return { ok: true, id };
}

export async function deleteExpense(id: string): Promise<ActionResult> {
  const ctx = await requireLedger();
  const expense = await prisma.expense.findFirst({
    where: { id, ledgerId: ctx.ledger.id },
    select: { receipt: { select: { storageKey: true } } },
  });
  if (expense) {
    await prisma.expense.delete({ where: { id } });
    if (expense.receipt) after(() => deleteReceiptFile(expense.receipt!.storageKey));
  }
  refresh();
  return { ok: true };
}

export async function deleteReceipt(expenseId: string): Promise<ActionResult> {
  const ctx = await requireLedger();
  const receipt = await prisma.receipt.findFirst({ where: { expenseId, ledgerId: ctx.ledger.id }, select: { id: true, storageKey: true } });
  if (receipt) {
    await prisma.receipt.delete({ where: { id: receipt.id } });
    after(() => deleteReceiptFile(receipt.storageKey));
  }
  refresh();
  return { ok: true };
}
