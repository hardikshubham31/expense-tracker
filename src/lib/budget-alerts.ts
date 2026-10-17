import "server-only";
import { prisma } from "@/lib/prisma";
import { emails, sendEmail } from "@/lib/email";
import { formatMonth, monthRange, parseMonth } from "@/lib/dates";
import { formatMoney } from "@/lib/money";

const THRESHOLDS = [100, 80] as const;

/**
 * After spending changes in `month` ("YYYY-MM"), email opted-in members about any
 * budget that newly crossed 80% or 100%. The unique BudgetAlert row is the
 * "already sent" marker, so each threshold emails at most once per month.
 * Run it with after() so it never slows down the request.
 */
export async function checkBudgetAlerts(ledgerId: string, month: string) {
  const m = parseMonth(month);
  if (!m) return;

  const [ledger, expenses] = await Promise.all([
    prisma.ledger.findUnique({
      where: { id: ledgerId },
      select: {
        name: true,
        currency: true,
        monthlyBudget: true,
        categories: { where: { budget: { not: null } }, select: { id: true, name: true, budget: true } },
        members: {
          where: { leftAt: null, user: { budgetAlerts: true } },
          select: { user: { select: { email: true } } },
        },
      },
    }),
    prisma.expense.findMany({ where: { ledgerId, date: monthRange(m) }, select: { amount: true, categoryId: true } }),
  ]);
  if (!ledger || ledger.members.length === 0) return;

  const total = expenses.reduce((s, e) => s + e.amount, 0);
  const byCategory = new Map<string, number>();
  for (const e of expenses) if (e.categoryId) byCategory.set(e.categoryId, (byCategory.get(e.categoryId) ?? 0) + e.amount);

  const budgets = [
    ...(ledger.monthlyBudget ? [{ scope: "overall", name: "Overall", limit: ledger.monthlyBudget, spent: total }] : []),
    ...ledger.categories.map((c) => ({ scope: c.id, name: c.name, limit: c.budget!, spent: byCategory.get(c.id) ?? 0 })),
  ];

  const url = `${process.env.BETTER_AUTH_URL ?? "http://localhost:3000"}/dashboard?month=${month}`;
  for (const b of budgets) {
    // Only the highest crossed threshold emails; a jump straight past 100% skips the 80% email.
    const crossed = THRESHOLDS.filter((t) => b.spent * 100 >= b.limit * t);
    for (const [i, threshold] of crossed.entries()) {
      try {
        await prisma.budgetAlert.create({ data: { ledgerId, scope: b.scope, month, threshold } });
      } catch {
        continue; // already recorded
      }
      if (i > 0) continue; // record lower thresholds silently
      for (const { user } of ledger.members) {
        if (!user) continue;
        void sendEmail(
          emails.budgetAlert(user.email, url, {
            ledger: ledger.name,
            budget: b.name,
            month: formatMonth(m),
            threshold,
            spent: formatMoney(b.spent, ledger.currency),
            limit: formatMoney(b.limit, ledger.currency),
          }),
        );
      }
    }
  }
}
