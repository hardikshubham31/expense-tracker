"use server";

import { refresh } from "next/cache";
import { after } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireLedger } from "@/lib/session";
import { checkBudgetAlerts } from "@/lib/budget-alerts";
import { parseDateInput, toDateInput } from "@/lib/dates";
import { MAX_AMOUNT } from "@/lib/money";
import { MAX_IMPORT_ROWS } from "@/lib/csv";
import { failMessage, type ActionResult } from "@/lib/action-utils";

const rowsSchema = z
  .array(
    z.object({
      date: z.string(),
      description: z.string().trim().min(1).max(120),
      amount: z.number().int().positive().max(MAX_AMOUNT * 100),
      categoryId: z.string().nullable(),
      notes: z.string().trim().max(500).nullable(),
    }),
  )
  .max(MAX_IMPORT_ROWS);

export type ImportRow = z.infer<typeof rowsSchema>[number];

const dupKey = (date: string, amount: number, description: string) => `${date}|${amount}|${description.trim().toLowerCase()}`;

/** Which rows (by index) already exist in the ledger: same date, amount and description. */
export async function findImportDuplicates(rows: ImportRow[]): Promise<number[]> {
  const { ledger } = await requireLedger();
  const parsed = rowsSchema.safeParse(rows);
  if (!parsed.success || parsed.data.length === 0) return [];

  const dates = parsed.data.map((r) => r.date).sort();
  const existing = await prisma.expense.findMany({
    where: { ledgerId: ledger.id, date: { gte: parseDateInput(dates[0])!, lte: parseDateInput(dates.at(-1)!)! } },
    select: { date: true, amount: true, description: true },
  });
  const keys = new Set(existing.map((e) => dupKey(toDateInput(e.date), e.amount, e.description)));
  return parsed.data.flatMap((r, i) => (keys.has(dupKey(r.date, r.amount, r.description)) ? [i] : []));
}

export async function importExpenses(rows: ImportRow[]): Promise<ActionResult & { imported?: number }> {
  const ctx = await requireLedger();
  const parsed = rowsSchema.safeParse(rows);
  if (!parsed.success) return failMessage("Some rows are invalid. Re-check the preview and try again.");

  const categoryIds = new Set((await prisma.category.findMany({ where: { ledgerId: ctx.ledger.id }, select: { id: true } })).map((c) => c.id));
  const data = parsed.data.flatMap((r) => {
    const date = parseDateInput(r.date);
    if (!date) return [];
    return [
      {
        ledgerId: ctx.ledger.id,
        date,
        description: r.description,
        amount: r.amount,
        notes: r.notes || null,
        categoryId: r.categoryId && categoryIds.has(r.categoryId) ? r.categoryId : null,
        // Imported rows are paid by the importer and not split
        paidById: ctx.member.id,
        createdById: ctx.member.id,
      },
    ];
  });
  if (data.length === 0) return failMessage("Nothing to import.");

  await prisma.expense.createMany({ data });
  const months = new Set(data.map((d) => toDateInput(d.date).slice(0, 7)));
  after(() => Promise.all([...months].map((m) => checkBudgetAlerts(ctx.ledger.id, m))));
  refresh();
  return { ok: true, imported: data.length };
}
