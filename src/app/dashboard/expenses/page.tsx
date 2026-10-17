import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Card, PageHeader, Skeleton } from "@/components/ui";
import { getCategories, getExpenses } from "@/lib/data";
import { requireLedger } from "@/lib/session";
import { formatMonth, monthKey, parseMonth } from "@/lib/dates";
import { formatMoney } from "@/lib/money";
import { AddExpenseButton } from "../_components/expense-dialog";
import { ExpenseList } from "../_components/expense-list";
import { MonthSwitcher } from "../_components/month-switcher";
import { ExpenseFilters } from "./filters";

export const metadata: Metadata = { title: "Expenses" };

export default function ExpensesPage({ searchParams }: PageProps<"/dashboard/expenses">) {
  return (
    <Suspense
      fallback={
        <div className="space-y-6" aria-busy="true" aria-label="Loading expenses">
          <Skeleton className="h-14 w-72" />
          <Skeleton className="h-12" />
          <Skeleton className="h-96" />
        </div>
      }
    >
      <Expenses searchParams={searchParams} />
    </Suspense>
  );
}

const one = (v: string | string[] | undefined) => (typeof v === "string" ? v : undefined);

const toolLink =
  "inline-flex items-center gap-1.5 rounded-lg px-2.5 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-100 focus-visible:outline-2 focus-visible:outline-emerald-600 dark:text-zinc-300 dark:hover:bg-zinc-800";

async function Expenses({ searchParams }: Pick<PageProps<"/dashboard/expenses">, "searchParams">) {
  const params = await searchParams;
  const { today, ledger } = await requireLedger();
  const month = parseMonth(one(params.month)) ?? today.month;
  const q = one(params.q)?.trim().slice(0, 100) || undefined;
  const category = one(params.category) || undefined;

  const [expenses, categories] = await Promise.all([getExpenses({ month, q, category }), getCategories()]);
  const total = expenses.reduce((s, e) => s + e.amount, 0);
  const filtered = Boolean(q || category);

  const exportParams = new URLSearchParams({ month: monthKey(month) });
  if (q) exportParams.set("q", q);
  if (category) exportParams.set("category", category);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Expenses"
        description={
          <>
            {expenses.length} {expenses.length === 1 ? "expense" : "expenses"}
            {filtered ? " matching filters" : ""} ·{" "}
            <span className="font-medium tabular-nums text-zinc-900 dark:text-zinc-100">{formatMoney(total, ledger.currency)}</span>
          </>
        }
        actions={
          <>
            <MonthSwitcher month={month} basePath="/dashboard/expenses" params={{ q, category }} />
            <AddExpenseButton />
          </>
        }
      />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <ExpenseFilters key={`${q}|${category}`} month={monthKey(month)} q={q} category={category} categories={categories} />
        <div className="flex items-center gap-1">
          <Link href="/dashboard/expenses/import" className={toolLink}>
            <svg aria-hidden="true" viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 15V3m0 0L8 7m4-4 4 4M5 21h14" />
            </svg>
            Import CSV
          </Link>
          <a href={`/api/expenses/export?${exportParams}`} download className={toolLink}>
            <svg aria-hidden="true" viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 3v12m0 0 4-4m-4 4-4-4M5 21h14" />
            </svg>
            Export CSV
          </a>
        </div>
      </div>

      <Card>
        {expenses.length ? (
          <ExpenseList expenses={expenses} />
        ) : (
          <div className="py-12 text-center">
            <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
              {filtered ? "No expenses match these filters" : `No expenses in ${formatMonth(month)}`}
            </p>
            <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
              {filtered ? "Try a different search or category." : "Add one, or import a bank statement."}
            </p>
          </div>
        )}
      </Card>
    </div>
  );
}
