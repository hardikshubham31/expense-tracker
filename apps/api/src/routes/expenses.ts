import { Router } from "express";
import { z } from "zod";
import { monthKey, monthOf, parseDateInput, parseMonth, toDateInput } from "@expense/shared/dates";
import { MAX_AMOUNT, currencyDigits, parseAmount } from "@expense/shared/money";
import { MAX_IMPORT_ROWS } from "@expense/shared/csv";
import { equalSplit } from "@expense/shared/splits";
import { prisma } from "../db.js";
import { defer } from "../logger.js";
import { getCtx, type LedgerContext } from "../middleware/context.js";
import { checkBudgetAlerts } from "../services/budget-alerts.js";
import { deleteReceiptFile } from "../services/receipts.js";
import { expenseWhere, getDescriptionHints, getExpenses } from "../services/data.js";
import { badRequest, firstErrors, invalid, notFound, queryString, text } from "../http.js";
import { bodyOf, param, str, strs } from "./body.js";

export const expensesRouter = Router();

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

/** Validate an expense, including payer and splits in shared ledgers. Reports every field's error. */
async function parseExpense(body: Record<string, unknown>, ctx: LedgerContext): Promise<ParsedExpense> {
  const parsed = expenseSchema.safeParse({
    description: str(body, "description"),
    notes: str(body, "notes") || undefined,
    categoryId: str(body, "categoryId") || undefined,
    paidById: str(body, "paidById") || undefined,
    splitMode: str(body, "splitMode") || undefined,
  });
  const errors: Record<string, string> = parsed.success ? {} : firstErrors(parsed.error);
  const amount = parseAmount(str(body, "amount"), ctx.ledger.currency);
  if (amount === null) errors.amount = "Enter an amount greater than zero.";
  const date = parseDateInput(str(body, "date"));
  if (!date) errors.date = "Pick a valid date.";
  if (!parsed.success || amount === null || !date) throw invalid(errors);

  const activeIds = new Set(ctx.members.map((m) => m.id));
  let paidById = ctx.member.id;
  let splits: ParsedExpense["splits"] = [];

  if (ctx.isShared) {
    paidById = parsed.data.paidById && activeIds.has(parsed.data.paidById) ? parsed.data.paidById : ctx.member.id;

    if (parsed.data.splitMode === "custom") {
      let sum = 0;
      for (const m of ctx.members) {
        const raw = str(body, `split_${m.id}`).trim();
        if (!raw || raw === "0") continue;
        const share = parseAmount(raw, ctx.ledger.currency);
        if (share === null) throw invalid({ splits: `Enter a valid amount for ${m.name}.` });
        splits.push({ memberId: m.id, amount: share });
        sum += share;
      }
      if (sum !== amount) throw invalid({ splits: "The split amounts must add up to the total." });
    } else {
      const included = strs(body, "splitMembers").filter((id) => activeIds.has(id));
      if (included.length === 0) throw invalid({ splits: "Split with at least one person." });
      splits = equalSplit(amount, included);
    }
  }

  let categoryId: string | null = parsed.data.categoryId || null;
  if (categoryId) {
    const owned = await prisma.category.count({ where: { id: categoryId, ledgerId: ctx.ledger.id } });
    if (!owned) categoryId = null;
  }
  return { amount, date, description: parsed.data.description, notes: parsed.data.notes || null, categoryId, paidById, splits };
}

function alertAfter(ledgerId: string, ...dates: Date[]) {
  const months = new Set(dates.map((d) => monthKey(monthOf(d))));
  defer(() => Promise.all([...months].map((m) => checkBudgetAlerts(ledgerId, m))));
}

/** GET /api/expenses?month=YYYY-MM&q=&category=&take= */
expensesRouter.get("/", async (req, res) => {
  const ctx = getCtx(req);
  const month = parseMonth(queryString(req.query.month)) ?? ctx.today.month;
  const take = Number(queryString(req.query.take)) || undefined;
  res.json(
    await getExpenses(ctx, { month, q: queryString(req.query.q)?.trim().slice(0, 100), category: queryString(req.query.category) }, take),
  );
});

expensesRouter.get("/hints", async (req, res) => {
  res.json(await getDescriptionHints(getCtx(req)));
});

expensesRouter.post("/", async (req, res) => {
  const ctx = getCtx(req);
  const { splits, ...fields } = await parseExpense(bodyOf(req), ctx);
  const expense = await prisma.expense.create({
    data: {
      ...fields,
      ledgerId: ctx.ledger.id,
      createdById: ctx.member.id,
      splits: splits.length ? { createMany: { data: splits } } : undefined,
    },
    select: { id: true },
  });
  alertAfter(ctx.ledger.id, fields.date);
  res.status(201).json({ ok: true, id: expense.id });
});

expensesRouter.patch("/:id", async (req, res) => {
  const ctx = getCtx(req);
  const id = param(req, "id");
  const existing = await prisma.expense.findFirst({ where: { id, ledgerId: ctx.ledger.id }, select: { date: true } });
  if (!existing) throw notFound("That expense no longer exists.");
  const { splits, ...fields } = await parseExpense(bodyOf(req), ctx);
  await prisma.$transaction([
    prisma.expenseSplit.deleteMany({ where: { expenseId: id } }),
    prisma.expense.update({ where: { id }, data: { ...fields, splits: splits.length ? { createMany: { data: splits } } : undefined } }),
  ]);
  alertAfter(ctx.ledger.id, fields.date, existing.date);
  res.json({ ok: true, id });
});

expensesRouter.delete("/:id", async (req, res) => {
  const ctx = getCtx(req);
  const id = param(req, "id");
  const expense = await prisma.expense.findFirst({
    where: { id, ledgerId: ctx.ledger.id },
    select: { receipt: { select: { storageKey: true } } },
  });
  if (expense) {
    await prisma.expense.delete({ where: { id } });
    if (expense.receipt) defer(() => deleteReceiptFile(expense.receipt!.storageKey));
  }
  res.json({ ok: true });
});

expensesRouter.delete("/:id/receipt", async (req, res) => {
  const ctx = getCtx(req);
  const receipt = await prisma.receipt.findFirst({
    where: { expenseId: param(req, "id"), ledgerId: ctx.ledger.id },
    select: { id: true, storageKey: true },
  });
  if (receipt) {
    await prisma.receipt.delete({ where: { id: receipt.id } });
    defer(() => deleteReceiptFile(receipt.storageKey));
  }
  res.json({ ok: true });
});

// ─── CSV export ──────────────────────────────────────────────────────────────

/** Quote every cell and neutralise spreadsheet formulas (CSV injection). */
function cell(value: string) {
  const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return `"${safe.replaceAll('"', '""')}"`;
}

expensesRouter.get("/export", async (req, res) => {
  const { ledger, allMembers, isShared, today } = getCtx(req);
  const month = parseMonth(queryString(req.query.month)) ?? today.month;
  const q = queryString(req.query.q)?.trim().slice(0, 100);
  const category = queryString(req.query.category);

  const expenses = await prisma.expense.findMany({
    where: expenseWhere(ledger.id, { month, q, category }),
    select: { date: true, description: true, amount: true, notes: true, paidById: true, category: { select: { name: true } } },
    orderBy: [{ date: "asc" }, { createdAt: "asc" }],
  });

  const names = new Map(allMembers.map((m) => [m.id, m.name]));
  const digits = currencyDigits(ledger.currency);
  const header = ["Date", "Description", "Category", `Amount (${ledger.currency})`, ...(isShared ? ["Paid by"] : []), "Notes"];
  const lines = [
    header.map(cell).join(","),
    ...expenses.map((e) =>
      [
        cell(toDateInput(e.date)),
        cell(e.description),
        cell(e.category?.name ?? "Uncategorized"),
        (e.amount / 100).toFixed(digits),
        ...(isShared ? [cell(names.get(e.paidById) ?? "")] : []),
        cell(e.notes ?? ""),
      ].join(","),
    ),
  ];

  res
    .type("text/csv; charset=utf-8")
    .set("Content-Disposition", `attachment; filename="expenses-${monthKey(month)}.csv"`)
    .set("Cache-Control", "private, no-store")
    // BOM so Excel opens UTF-8 (₹, €) correctly
    .send("﻿" + lines.join("\r\n") + "\r\n");
});

// ─── CSV import ──────────────────────────────────────────────────────────────

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

const dupKey = (date: string, amount: number, description: string) => `${date}|${amount}|${description.trim().toLowerCase()}`;

/** POST /api/expenses/import/duplicates { rows } -> indexes of rows that already exist */
expensesRouter.post("/import/duplicates", async (req, res) => {
  const { ledger } = getCtx(req);
  const parsed = rowsSchema.safeParse(bodyOf(req).rows);
  if (!parsed.success || parsed.data.length === 0) {
    res.json([]);
    return;
  }
  const dates = parsed.data.map((r) => r.date).sort();
  const from = parseDateInput(dates[0]);
  const to = parseDateInput(dates.at(-1)!);
  if (!from || !to) {
    res.json([]);
    return;
  }
  const existing = await prisma.expense.findMany({
    where: { ledgerId: ledger.id, date: { gte: from, lte: to } },
    select: { date: true, amount: true, description: true },
  });
  const keys = new Set(existing.map((e) => dupKey(toDateInput(e.date), e.amount, e.description)));
  res.json(parsed.data.flatMap((r, i) => (keys.has(dupKey(r.date, r.amount, r.description)) ? [i] : [])));
});

/** POST /api/expenses/import { rows } */
expensesRouter.post("/import", async (req, res) => {
  const ctx = getCtx(req);
  const parsed = rowsSchema.safeParse(bodyOf(req).rows);
  if (!parsed.success) throw badRequest("Some rows are invalid. Re-check the preview and try again.");

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
  if (data.length === 0) throw badRequest("Nothing to import.");

  await prisma.expense.createMany({ data });
  alertAfter(ctx.ledger.id, ...data.map((d) => d.date));
  res.status(201).json({ ok: true, imported: data.length });
});

