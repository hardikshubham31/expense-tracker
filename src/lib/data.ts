import "server-only";
import { cache } from "react";
import { after } from "next/server";
import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { requireLedger } from "@/lib/session";
import { materializeRecurring } from "@/lib/recurring";
import { checkBudgetAlerts } from "@/lib/budget-alerts";
import { UNCATEGORIZED } from "@/lib/categories";
import { daysInMonth, monthKey, monthRange, shiftMonth, type Month } from "@/lib/dates";
import { computeBalances, suggestTransfers } from "@/lib/splits";

// Every exported reader resolves the ledger itself (verified membership), so
// callers can't ask for another ledger's rows by passing an id.

/** Fill in due recurring entries once per request, before anything reads money data. */
const syncRecurring = cache(async () => {
  const ctx = await requireLedger();
  const months = await materializeRecurring(ctx.ledger.id, ctx.today.date, ctx.members.map((m) => m.id));
  if (months.length) after(() => Promise.all(months.map((m) => checkBudgetAlerts(ctx.ledger.id, m))));
  return ctx;
});

export type CategoryRow = { id: string; name: string; color: string; budget: number | null };

export async function getCategories(): Promise<CategoryRow[]> {
  const { ledger } = await requireLedger();
  return prisma.category.findMany({
    where: { ledgerId: ledger.id },
    select: { id: true, name: true, color: true, budget: true },
    orderBy: { name: "asc" },
  });
}

export type ExpenseFilters = { month: Month; q?: string; category?: string };

/** Shared by the list and the CSV export so both apply identical filters. */
export function expenseWhere(ledgerId: string, { month, q, category }: ExpenseFilters): Prisma.ExpenseWhereInput {
  const where: Prisma.ExpenseWhereInput = { ledgerId, date: monthRange(month) };
  if (q) {
    where.OR = [
      { description: { contains: q, mode: "insensitive" } },
      { notes: { contains: q, mode: "insensitive" } },
    ];
  }
  if (category === UNCATEGORIZED) where.categoryId = null;
  else if (category) where.categoryId = category;
  return where;
}

const expenseSelect = {
  id: true,
  amount: true,
  description: true,
  notes: true,
  date: true,
  paidById: true,
  recurringId: true,
  category: { select: { id: true, name: true, color: true } },
  splits: { select: { memberId: true, amount: true } },
  receipt: { select: { id: true, mimeType: true, originalName: true } },
} satisfies Prisma.ExpenseSelect;

export type ExpenseRow = Prisma.ExpenseGetPayload<{ select: typeof expenseSelect }>;

export async function getExpenses(filters: ExpenseFilters, take?: number): Promise<ExpenseRow[]> {
  const { ledger } = await syncRecurring();
  return prisma.expense.findMany({
    where: expenseWhere(ledger.id, filters),
    select: expenseSelect,
    orderBy: [{ date: "desc" }, { createdAt: "desc" }],
    take,
  });
}

export type IncomeRow = { id: string; amount: number; source: string; notes: string | null; date: Date; recurringId: string | null };

export async function getIncomes(month: Month): Promise<IncomeRow[]> {
  const { ledger } = await syncRecurring();
  return prisma.income.findMany({
    where: { ledgerId: ledger.id, date: monthRange(month) },
    select: { id: true, amount: true, source: true, notes: true, date: true, recurringId: true },
    orderBy: [{ date: "desc" }, { createdAt: "desc" }],
  });
}

export type CategoryTotal = {
  id: string | null;
  name: string;
  color: string | null;
  budget: number | null;
  total: number;
  count: number;
};

export async function getMonthSummary(month: Month) {
  const { ledger, member, isShared } = await syncRecurring();
  // Sums are done in JS: Prisma's Int aggregates are 32-bit.
  const [expenses, previous, incomes, categories] = await Promise.all([
    prisma.expense.findMany({
      where: { ledgerId: ledger.id, date: monthRange(month) },
      select: { amount: true, date: true, categoryId: true, splits: { where: { memberId: member.id }, select: { amount: true } } },
    }),
    prisma.expense.findMany({ where: { ledgerId: ledger.id, date: monthRange(shiftMonth(month, -1)) }, select: { amount: true } }),
    prisma.income.findMany({ where: { ledgerId: ledger.id, date: monthRange(month) }, select: { amount: true } }),
    getCategories(),
  ]);

  const byDay = new Array<number>(daysInMonth(month)).fill(0);
  const byCategory = new Map<string | null, { total: number; count: number }>();
  let total = 0;
  let myShare = 0;

  for (const e of expenses) {
    total += e.amount;
    // Personal ledgers (no splits): your share is the whole amount
    myShare += isShared ? (e.splits[0]?.amount ?? 0) : e.amount;
    byDay[e.date.getUTCDate() - 1] += e.amount;
    const entry = byCategory.get(e.categoryId) ?? { total: 0, count: 0 };
    entry.total += e.amount;
    entry.count += 1;
    byCategory.set(e.categoryId, entry);
  }

  const categoryTotals: CategoryTotal[] = categories.map((c) => ({
    id: c.id,
    name: c.name,
    color: c.color,
    budget: c.budget,
    ...(byCategory.get(c.id) ?? { total: 0, count: 0 }),
  }));
  const uncategorized = byCategory.get(null);
  if (uncategorized) {
    categoryTotals.push({ id: null, name: "Uncategorized", color: null, budget: null, ...uncategorized });
  }

  return {
    total,
    myShare,
    count: expenses.length,
    income: incomes.reduce((s, i) => s + i.amount, 0),
    previousTotal: previous.reduce((sum, e) => sum + e.amount, 0),
    byDay,
    categories: categoryTotals.toSorted((a, b) => b.total - a.total),
    monthlyBudget: ledger.monthlyBudget,
    currency: ledger.currency,
  };
}

export type MonthSummary = Awaited<ReturnType<typeof getMonthSummary>>;

export type TrendMonth = { key: string; year: number; month: number; spent: number; income: number; byCategory: Record<string, number> };

/** Spending and income for the `count` months ending at `end`. */
export async function getTrends(end: Month, count = 12) {
  const { ledger } = await syncRecurring();
  const start = shiftMonth(end, -(count - 1));
  const range = { gte: monthRange(start).gte, lt: monthRange(end).lt };

  const [expenses, incomes, categories] = await Promise.all([
    prisma.expense.findMany({ where: { ledgerId: ledger.id, date: range }, select: { amount: true, date: true, categoryId: true } }),
    prisma.income.findMany({ where: { ledgerId: ledger.id, date: range }, select: { amount: true, date: true } }),
    getCategories(),
  ]);

  const months: TrendMonth[] = Array.from({ length: count }, (_, i) => {
    const m = shiftMonth(start, i);
    return { key: monthKey(m), ...m, spent: 0, income: 0, byCategory: {} };
  });
  const index = new Map(months.map((m, i) => [m.key, i]));
  const keyOf = (d: Date) => d.toISOString().slice(0, 7);

  for (const e of expenses) {
    const m = months[index.get(keyOf(e.date))!];
    m.spent += e.amount;
    const cat = e.categoryId ?? UNCATEGORIZED;
    m.byCategory[cat] = (m.byCategory[cat] ?? 0) + e.amount;
  }
  for (const i of incomes) months[index.get(keyOf(i.date))!].income += i.amount;

  return { months, categories, currency: ledger.currency };
}

export async function getBalances() {
  const { ledger, allMembers, member } = await syncRecurring();
  const [expenses, settlements] = await Promise.all([
    prisma.expense.findMany({
      where: { ledgerId: ledger.id, splits: { some: {} } },
      select: { paidById: true, amount: true, splits: { select: { memberId: true, amount: true } } },
    }),
    prisma.settlement.findMany({
      where: { ledgerId: ledger.id },
      select: { id: true, fromMemberId: true, toMemberId: true, amount: true, date: true, note: true },
      orderBy: [{ date: "desc" }, { createdAt: "desc" }],
    }),
  ]);
  const net = computeBalances(allMembers.map((m) => m.id), expenses, settlements);
  return {
    net,
    mine: net.get(member.id) ?? 0,
    transfers: suggestTransfers(net),
    settlements,
    currency: ledger.currency,
  };
}

export async function getRecurringRules() {
  const { ledger } = await syncRecurring();
  return prisma.recurringRule.findMany({
    where: { ledgerId: ledger.id },
    select: {
      id: true,
      type: true,
      amount: true,
      description: true,
      frequency: true,
      startDate: true,
      endDate: true,
      nextDate: true,
      active: true,
      paidById: true,
      category: { select: { id: true, name: true, color: true } },
    },
    orderBy: [{ active: "desc" }, { nextDate: "asc" }],
  });
}

export type RecurringRuleRow = Awaited<ReturnType<typeof getRecurringRules>>[number];

/**
 * Recent descriptions and the category they were filed under, newest first.
 * Powers description autocomplete and category suggestions in the expense form.
 */
export async function getDescriptionHints(): Promise<{ description: string; categoryId: string | null }[]> {
  const { ledger } = await requireLedger();
  const rows = await prisma.expense.findMany({
    where: { ledgerId: ledger.id },
    select: { description: true, categoryId: true },
    orderBy: { createdAt: "desc" },
    take: 400,
  });
  const seen = new Set<string>();
  return rows.filter((r) => {
    const key = r.description.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export async function getLedgerDetails() {
  const { ledger, allMembers, isOwner } = await requireLedger();
  const invites = isOwner
    ? await prisma.ledgerInvite.findMany({
        where: { ledgerId: ledger.id, acceptedAt: null, expiresAt: { gt: new Date() } },
        select: { id: true, email: true, expiresAt: true, token: true },
        orderBy: { createdAt: "desc" },
      })
    : [];
  return { ledger, members: allMembers, invites };
}
