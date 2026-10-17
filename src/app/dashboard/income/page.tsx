import type { Metadata } from "next";
import { Suspense } from "react";
import { Card, PageHeader, Skeleton } from "@/components/ui";
import { getIncomes, getMonthSummary } from "@/lib/data";
import { requireLedger } from "@/lib/session";
import { formatMonth, parseMonth } from "@/lib/dates";
import { formatMoney } from "@/lib/money";
import { MonthSwitcher } from "../_components/month-switcher";
import { AddIncomeButton, IncomeList } from "./income-manager";

export const metadata: Metadata = { title: "Income" };

export default function IncomePage({ searchParams }: PageProps<"/dashboard/income">) {
  return (
    <Suspense fallback={<Skeleton className="h-96" />}>
      <Income searchParams={searchParams} />
    </Suspense>
  );
}

async function Income({ searchParams }: Pick<PageProps<"/dashboard/income">, "searchParams">) {
  const { month: monthParam } = await searchParams;
  const { today, ledger } = await requireLedger();
  const month = parseMonth(typeof monthParam === "string" ? monthParam : null) ?? today.month;
  const [incomes, summary] = await Promise.all([getIncomes(month), getMonthSummary(month)]);
  const net = summary.income - summary.total;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Income"
        description="Salary, freelance, refunds — anything coming in. Used to work out what you saved."
        actions={
          <>
            <MonthSwitcher month={month} basePath="/dashboard/income" />
            <AddIncomeButton />
          </>
        }
      />

      <section aria-label="Monthly income" className="grid gap-4 sm:grid-cols-3">
        {[
          { label: `Income in ${formatMonth(month)}`, value: formatMoney(summary.income, ledger.currency), tone: "" },
          { label: "Spent", value: formatMoney(summary.total, ledger.currency), tone: "" },
          {
            label: net >= 0 ? "Saved" : "Overspent",
            value: `${formatMoney(Math.abs(net), ledger.currency)}${summary.income ? ` · ${Math.round((net / summary.income) * 100)}%` : ""}`,
            tone: net >= 0 ? "text-good" : "text-critical",
          },
        ].map((s) => (
          <div key={s.label} className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-xs dark:border-zinc-800 dark:bg-zinc-900">
            <p className="text-sm text-zinc-500 dark:text-zinc-400">{s.label}</p>
            <p className={`mt-1 text-2xl font-semibold tracking-tight ${s.tone || "text-zinc-900 dark:text-zinc-50"}`}>{s.value}</p>
          </div>
        ))}
      </section>

      <Card>
        {incomes.length ? (
          <IncomeList incomes={incomes} />
        ) : (
          <p className="py-12 text-center text-sm text-zinc-500 dark:text-zinc-400">No income recorded for {formatMonth(month)}.</p>
        )}
      </Card>
    </div>
  );
}
