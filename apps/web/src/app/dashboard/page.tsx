import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Card, PageHeader, Skeleton } from "@/components/ui";
import { getBalances, getExpenses, getMonthSummary, type MonthSummary } from "@/lib/data";
import { requireLedger } from "@/lib/session";
import { daysInMonth, formatMonth, monthKey, parseMonth, shiftMonth, type Month } from "@expense/shared/dates";
import { formatMoney } from "@expense/shared/money";
import { AddExpenseButton } from "./_components/expense-dialog";
import { DailyChart } from "./_components/daily-chart";
import { ExpenseList } from "./_components/expense-list";
import { MonthSwitcher } from "./_components/month-switcher";
import { BudgetMeters, CategoryBreakdown } from "./_components/summary-panels";

export const metadata: Metadata = { title: "Overview" };

export default function OverviewPage({ searchParams }: PageProps<"/dashboard">) {
  return (
    <Suspense fallback={<OverviewSkeleton />}>
      <Overview searchParams={searchParams} />
    </Suspense>
  );
}

const linkClass = "text-xs font-medium text-emerald-700 hover:underline dark:text-emerald-400";

async function Overview({ searchParams }: Pick<PageProps<"/dashboard">, "searchParams">) {
  const { month: monthParam } = await searchParams;
  const ctx = await requireLedger();
  const month = parseMonth(typeof monthParam === "string" ? monthParam : null) ?? ctx.today.month;

  const [summary, recent, balances] = await Promise.all([
    getMonthSummary(month),
    getExpenses({ month }, 6),
    ctx.isShared ? getBalances() : null,
  ]);
  const { currency } = summary;
  const firstName = ctx.user.name.split(" ")[0] || ctx.user.name;

  return (
    <div className="space-y-6">
      <PageHeader
        title={ctx.isShared ? ctx.ledger.name : `Hi, ${firstName}`}
        description={ctx.isShared ? `Shared with ${ctx.members.length - 1} ${ctx.members.length === 2 ? "person" : "people"}` : "Here's where your money went."}
        actions={
          <>
            <MonthSwitcher month={month} basePath="/dashboard" />
            <AddExpenseButton />
          </>
        }
      />

      <Headline month={month} today={ctx.today} summary={summary} myBalance={balances?.mine ?? null} />

      <div className="grid gap-6 lg:grid-cols-3">
        <Card title="Daily spending" className="lg:col-span-2">
          <DailyChart byDay={summary.byDay} currency={currency} year={month.year} month={month.month} />
        </Card>
        <Card title="Budgets" action={<Link href="/dashboard/categories" className={linkClass}>Manage</Link>}>
          <BudgetMeters categories={summary.categories} total={summary.total} monthlyBudget={summary.monthlyBudget} currency={currency} />
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="By category">
          <CategoryBreakdown categories={summary.categories} total={summary.total} currency={currency} monthParam={monthKey(month)} />
        </Card>
        <Card title="Recent expenses" action={<Link href={`/dashboard/expenses?month=${monthKey(month)}`} className={linkClass}>View all</Link>}>
          {recent.length ? (
            <ExpenseList expenses={recent} grouped={false} />
          ) : (
            <p className="py-6 text-center text-sm text-zinc-500 dark:text-zinc-400">Nothing logged for {formatMonth(month)}.</p>
          )}
        </Card>
      </div>
    </div>
  );
}

function Headline({
  month,
  today,
  summary,
  myBalance,
}: {
  month: Month;
  today: { date: Date; month: Month };
  summary: MonthSummary;
  myBalance: number | null;
}) {
  const { total, previousTotal, count, currency, income } = summary;
  const isCurrent = monthKey(month) === monthKey(today.month);
  const isFuture = monthKey(month) > monthKey(today.month);
  const daysElapsed = isCurrent ? today.date.getUTCDate() : isFuture ? 0 : daysInMonth(month);
  const prevLabel = formatMonth(shiftMonth(month, -1), "long").split(" ")[0];
  const net = income - total;
  const savingsRate = income > 0 ? Math.round((net / income) * 100) : null;

  return (
    <section aria-label="Monthly total" className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-xs dark:border-zinc-800 dark:bg-zinc-900">
      <div className="flex flex-wrap items-end justify-between gap-6">
        <div>
          <p className="text-sm text-zinc-600 dark:text-zinc-400">Spent in {formatMonth(month)}</p>
          <p className="mt-1 text-5xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">{formatMoney(total, currency)}</p>
        </div>
        {myBalance !== null ? (
          <Link
            href="/dashboard/balances"
            className="rounded-xl border border-zinc-200 px-4 py-3 text-sm hover:bg-zinc-50 focus-visible:outline-2 focus-visible:outline-emerald-600 dark:border-zinc-800 dark:hover:bg-zinc-800/50"
          >
            <span className="block text-zinc-500 dark:text-zinc-400">Your balance</span>
            <span className={`block font-semibold ${myBalance > 0 ? "text-good" : myBalance < 0 ? "text-critical" : "text-zinc-900 dark:text-zinc-100"}`}>
              {myBalance === 0 ? "All settled up" : myBalance > 0 ? `You're owed ${formatMoney(myBalance, currency)}` : `You owe ${formatMoney(-myBalance, currency)}`}
            </span>
          </Link>
        ) : null}
      </div>
      <dl className="mt-5 grid grid-cols-2 gap-x-10 gap-y-4 text-sm sm:flex sm:flex-wrap">
        <Stat label={`vs ${prevLabel}`}>
          <Delta current={total} previous={previousTotal} currency={currency} />
        </Stat>
        <Stat label="Daily average">{daysElapsed ? formatMoney(Math.round(total / daysElapsed), currency) : "—"}</Stat>
        <Stat label="Expenses">{count}</Stat>
        {summary.myShare !== total ? <Stat label="Your share">{formatMoney(summary.myShare, currency)}</Stat> : null}
        <Stat label="Income">
          {income ? formatMoney(income, currency) : <Link href="/dashboard/income" className={linkClass}>Add income</Link>}
        </Stat>
        {income ? (
          <Stat label="Saved">
            <span className={net >= 0 ? "text-good" : "text-critical"}>
              {net < 0 ? "−" : ""}
              {formatMoney(Math.abs(net), currency)}
            </span>
            {savingsRate !== null ? <span className="ml-1.5 font-normal text-zinc-500 dark:text-zinc-400">({savingsRate}%)</span> : null}
          </Stat>
        ) : null}
      </dl>
    </section>
  );
}

function Stat({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-zinc-500 dark:text-zinc-400">{label}</dt>
      <dd className="mt-0.5 font-medium text-zinc-900 dark:text-zinc-100">{children}</dd>
    </div>
  );
}

function Delta({ current, previous, currency }: { current: number; previous: number; currency: string }) {
  if (!previous) return <span className="font-medium text-zinc-500 dark:text-zinc-400">No spending</span>;
  const diff = current - previous;
  const pct = Math.round((Math.abs(diff) / previous) * 100);
  if (diff === 0) return <span>Same as last month</span>;
  // Spending more is bad, so "up" uses the critical text color.
  const up = diff > 0;
  return (
    <span className={`inline-flex items-center gap-1 ${up ? "text-critical" : "text-good"}`}>
      <svg aria-hidden="true" viewBox="0 0 24 24" className="size-3.5" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <path d={up ? "M12 19V5M5 12l7-7 7 7" : "M12 5v14M5 12l7 7 7-7"} />
      </svg>
      {pct}% {up ? "more" : "less"}
      <span className="font-normal text-zinc-500 dark:text-zinc-400">({formatMoney(Math.abs(diff), currency)})</span>
    </span>
  );
}

function OverviewSkeleton() {
  return (
    <div className="space-y-6" aria-busy="true" aria-label="Loading overview">
      <div className="flex justify-between">
        <Skeleton className="h-14 w-64" />
        <Skeleton className="h-10 w-72" />
      </div>
      <Skeleton className="h-44" />
      <div className="grid gap-6 lg:grid-cols-3">
        <Skeleton className="h-72 lg:col-span-2" />
        <Skeleton className="h-72" />
      </div>
    </div>
  );
}
