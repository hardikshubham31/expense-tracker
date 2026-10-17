import { Router } from "express";
import { z } from "zod";
import { parseDateInput, parseMonth } from "@expense/shared/dates";
import { parseAmount } from "@expense/shared/money";
import { prisma } from "../db.js";
import { getCtx, requireLedger, type LedgerContext } from "../middleware/context.js";
import { getBalances, getIncomes, getMonthSummary, getRecurringRules, getTrends } from "../services/data.js";
import { badRequest, firstErrors, invalid, notFound, queryString, text } from "../http.js";
import { bodyOf, param, str } from "./body.js";

// ─── Read models ─────────────────────────────────────────────────────────────

export const summaryRouter = Router();

/** GET /api/summary?month=YYYY-MM */
summaryRouter.get("/summary", requireLedger, async (req, res) => {
  const ctx = getCtx(req);
  res.json(await getMonthSummary(ctx, parseMonth(queryString(req.query.month)) ?? ctx.today.month));
});

/** GET /api/trends?end=YYYY-MM (12 months ending there) */
summaryRouter.get("/trends", requireLedger, async (req, res) => {
  const ctx = getCtx(req);
  res.json(await getTrends(ctx, parseMonth(queryString(req.query.end)) ?? ctx.today.month, 12));
});

summaryRouter.get("/balances", requireLedger, async (req, res) => {
  res.json(await getBalances(getCtx(req)));
});

// ─── Income ──────────────────────────────────────────────────────────────────

export const incomeRouter = Router();

const incomeSchema = z.object({
  source: text(120).min(1, "Where did it come from?"),
  notes: text(500).optional(),
});

function parseIncome(body: Record<string, unknown>, currency: string) {
  const parsed = incomeSchema.safeParse({ source: str(body, "source"), notes: str(body, "notes") || undefined });
  const errors: Record<string, string> = parsed.success ? {} : firstErrors(parsed.error);
  const amount = parseAmount(str(body, "amount"), currency);
  if (amount === null) errors.amount = "Enter an amount greater than zero.";
  const date = parseDateInput(str(body, "date"));
  if (!date) errors.date = "Pick a valid date.";
  if (!parsed.success || amount === null || !date) throw invalid(errors);
  return { amount, date, source: parsed.data.source, notes: parsed.data.notes || null };
}

incomeRouter.get("/", async (req, res) => {
  const ctx = getCtx(req);
  res.json(await getIncomes(ctx, parseMonth(queryString(req.query.month)) ?? ctx.today.month));
});

incomeRouter.post("/", async (req, res) => {
  const { ledger } = getCtx(req);
  const income = await prisma.income.create({ data: { ...parseIncome(bodyOf(req), ledger.currency), ledgerId: ledger.id }, select: { id: true } });
  res.status(201).json({ ok: true, id: income.id });
});

incomeRouter.patch("/:id", async (req, res) => {
  const { ledger } = getCtx(req);
  const id = param(req, "id");
  const { count } = await prisma.income.updateMany({ where: { id, ledgerId: ledger.id }, data: parseIncome(bodyOf(req), ledger.currency) });
  if (!count) throw notFound("That entry no longer exists.");
  res.json({ ok: true, id });
});

incomeRouter.delete("/:id", async (req, res) => {
  const { ledger } = getCtx(req);
  await prisma.income.deleteMany({ where: { id: param(req, "id"), ledgerId: ledger.id } });
  res.json({ ok: true });
});

// ─── Recurring rules ─────────────────────────────────────────────────────────

export const recurringRouter = Router();

const ruleSchema = z.object({
  type: z.enum(["EXPENSE", "INCOME"]),
  description: text(120).min(1, "Add a description."),
  frequency: z.enum(["WEEKLY", "MONTHLY", "YEARLY"], { error: "Pick how often it repeats." }),
  categoryId: z.string().optional(),
  paidById: z.string().optional(),
});

async function parseRule(body: Record<string, unknown>, ctx: LedgerContext) {
  const parsed = ruleSchema.safeParse({
    type: str(body, "type"),
    description: str(body, "description"),
    frequency: str(body, "frequency"),
    categoryId: str(body, "categoryId") || undefined,
    paidById: str(body, "paidById") || undefined,
  });
  const errors: Record<string, string> = parsed.success ? {} : firstErrors(parsed.error);
  const amount = parseAmount(str(body, "amount"), ctx.ledger.currency);
  if (amount === null) errors.amount = "Enter an amount greater than zero.";
  const startDate = parseDateInput(str(body, "startDate"));
  if (!startDate) errors.startDate = "Pick the first date.";
  const rawEnd = str(body, "endDate");
  const endDate = rawEnd ? parseDateInput(rawEnd) : null;
  if (rawEnd && !endDate) errors.endDate = "Pick a valid end date.";
  if (startDate && endDate && endDate < startDate) errors.endDate = "The end date must be after the start date.";
  if (!parsed.success || amount === null || !startDate || Object.keys(errors).length) throw invalid(errors);

  let categoryId: string | null = null;
  if (parsed.data.type === "EXPENSE" && parsed.data.categoryId) {
    const owned = await prisma.category.count({ where: { id: parsed.data.categoryId, ledgerId: ctx.ledger.id } });
    if (owned) categoryId = parsed.data.categoryId;
  }
  const paidById =
    parsed.data.type !== "EXPENSE"
      ? null
      : ctx.isShared && ctx.members.some((m) => m.id === parsed.data.paidById)
        ? parsed.data.paidById!
        : ctx.member.id;

  return { type: parsed.data.type, description: parsed.data.description, frequency: parsed.data.frequency, amount, startDate, endDate, categoryId, paidById };
}

recurringRouter.get("/", async (req, res) => {
  res.json(await getRecurringRules(getCtx(req)));
});

recurringRouter.post("/", async (req, res) => {
  const ctx = getCtx(req);
  const data = await parseRule(bodyOf(req), ctx);
  // Occurrences on or before today are filled in on the next read.
  const rule = await prisma.recurringRule.create({ data: { ...data, nextDate: data.startDate, ledgerId: ctx.ledger.id }, select: { id: true } });
  res.status(201).json({ ok: true, id: rule.id });
});

recurringRouter.patch("/:id", async (req, res) => {
  const ctx = getCtx(req);
  const id = param(req, "id");
  const existing = await prisma.recurringRule.findFirst({ where: { id, ledgerId: ctx.ledger.id }, select: { startDate: true } });
  if (!existing) throw notFound("That rule no longer exists.");
  const data = await parseRule(bodyOf(req), ctx);
  // Changing the start date restarts the schedule (already-created entries stay).
  const restart = data.startDate.getTime() !== existing.startDate.getTime();
  await prisma.recurringRule.update({ where: { id }, data: { ...data, ...(restart ? { nextDate: data.startDate } : {}), active: true } });
  res.json({ ok: true, id });
});

/** POST /api/recurring/:id/active { active } — resuming skips the paused period instead of back-filling it. */
recurringRouter.post("/:id/active", async (req, res) => {
  const ctx = getCtx(req);
  const id = param(req, "id");
  const active = bodyOf(req).active === true;
  const rule = await prisma.recurringRule.findFirst({ where: { id, ledgerId: ctx.ledger.id }, select: { nextDate: true } });
  if (!rule) throw notFound("That rule no longer exists.");
  const nextDate = active && rule.nextDate < ctx.today.date ? ctx.today.date : rule.nextDate;
  await prisma.recurringRule.update({ where: { id }, data: { active, nextDate } });
  res.json({ ok: true });
});

/** Deleting a rule keeps the entries it already created. */
recurringRouter.delete("/:id", async (req, res) => {
  const { ledger } = getCtx(req);
  await prisma.recurringRule.deleteMany({ where: { id: param(req, "id"), ledgerId: ledger.id } });
  res.json({ ok: true });
});

// ─── Settlements ─────────────────────────────────────────────────────────────

export const settlementsRouter = Router();

settlementsRouter.post("/", async (req, res) => {
  const ctx = getCtx(req);
  if (!ctx.isShared) throw badRequest("Settlements are only for shared households.");
  const body = bodyOf(req);
  const ids = new Set(ctx.members.map((m) => m.id));
  const from = str(body, "fromMemberId");
  const to = str(body, "toMemberId");
  const errors: Record<string, string> = {};
  if (!ids.has(from)) errors.fromMemberId = "Pick who paid.";
  if (!ids.has(to)) errors.toMemberId = "Pick who was paid.";
  if (from && from === to) errors.toMemberId = "Pick two different people.";
  const amount = parseAmount(str(body, "amount"), ctx.ledger.currency);
  if (amount === null) errors.amount = "Enter an amount greater than zero.";
  if (Object.keys(errors).length || amount === null) throw invalid(errors);

  const date = parseDateInput(str(body, "date")) ?? ctx.today.date;
  const note = str(body, "note").trim().slice(0, 200) || null;
  await prisma.settlement.create({ data: { ledgerId: ctx.ledger.id, fromMemberId: from, toMemberId: to, amount, date, note } });
  res.status(201).json({ ok: true });
});

settlementsRouter.delete("/:id", async (req, res) => {
  const { ledger } = getCtx(req);
  await prisma.settlement.deleteMany({ where: { id: param(req, "id"), ledgerId: ledger.id } });
  res.json({ ok: true });
});
