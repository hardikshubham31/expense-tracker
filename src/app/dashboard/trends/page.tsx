import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Card, CategoryDot, PageHeader, Skeleton } from "@/components/ui";
import { getTrends } from "@/lib/data";
import { requireLedger } from "@/lib/session";
import { UNCATEGORIZED } from "@/lib/categories";
import { formatMonth } from "@/lib/dates";
import { formatMoney } from "@/lib/money";
import { TrendsChart } from "./trends-chart";
import { CategoryPicker } from "./category-picker";

export const metadata: Metadata = { title: "Trends" };

export default function TrendsPage({ searchParams }: PageProps<"/dashboard/trends">) {
  return (
    <div className="space-y-6">
      <PageHeader title="Trends" description="The last 12 months of spending and income." />
      <Suspense fallback={<Skeleton className="h-96" />}>
        <Trends searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function Trends({ searchParams }: Pick<PageProps<"/dashboard/trends">, "searchParams">) {
  const { category: categoryParam } = await searchParams;
  const { today } = await requireLedger();
  const { months, categories, currency } = await getTrends(today.month, 12);

  const category = typeof categoryParam === "string" ? categoryParam : "";
  const selected = categories.find((c) => c.id === category) ?? (category === UNCATEGORIZED ? { id: UNCATEGORIZED, name: "Uncategorized" } : null);
  const points = months.map((m) => ({ ...m, spent: selected ? (m.byCategory[selected.id] ?? 0) : m.spent }));

  const totalSpent = months.reduce((s, m) => s + m.spent, 0);
  const totalIncome = months.reduce((s, m) => s + m.income, 0);
  const activeMonths = months.filter((m) => m.spent > 0).length || 1;

  // Category table: last full 3 months vs the 3 before, so a partial current month doesn't skew it
  const recent = months.slice(-4, -1);
  const prior = months.slice(-7, -4);
  const sum = (ms: typeof months, id: string) => ms.reduce((s, m) => s + (m.byCategory[id] ?? 0), 0);
  const rows = [...categories.map((c) => ({ id: c.id, name: c.name, color: c.color as string | null })), { id: UNCATEGORIZED, name: "Uncategorized", color: null }]
    .map((c) => ({ ...c, year: sum(months, c.id), recent: sum(recent, c.id), prior: sum(prior, c.id) }))
    .filter((c) => c.year > 0)
    .toSorted((a, b) => b.year - a.year);

  return (
    <>
      <section aria-label="12-month totals" className="grid gap-4 sm:grid-cols-3">
        {[
          { label: "Spent in 12 months", value: formatMoney(totalSpent, currency) },
          { label: "Average per month", value: formatMoney(Math.round(totalSpent / activeMonths), currency) },
          { label: "Income in 12 months", value: formatMoney(totalIncome, currency) },
        ].map((s) => (
          <div key={s.label} className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-xs dark:border-zinc-800 dark:bg-zinc-900">
            <p className="text-sm text-zinc-500 dark:text-zinc-400">{s.label}</p>
            <p className="mt-1 text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">{s.value}</p>
          </div>
        ))}
      </section>

      <Card
        title={selected ? `${selected.name} by month` : "Spending and income by month"}
        action={<CategoryPicker key={category} categories={categories} value={category} />}
      >
        <TrendsChart points={points} currency={currency} showIncome={!selected} spentLabel={selected ? selected.name : "Spent"} />
      </Card>

      <Card title="Categories over time">
        {rows.length ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[32rem] text-left text-sm">
              <thead className="text-xs text-zinc-500 dark:text-zinc-400">
                <tr className="border-b border-zinc-200 dark:border-zinc-800">
                  <th scope="col" className="py-2 font-medium">Category</th>
                  <th scope="col" className="py-2 text-right font-medium">12 months</th>
                  <th scope="col" className="py-2 text-right font-medium">Avg / month</th>
                  <th scope="col" className="py-2 text-right font-medium">
                    {formatMonth(recent[0], "short").split(" ")[0]}–{formatMonth(recent[2], "short").split(" ")[0]} vs prior 3
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 tabular-nums dark:divide-zinc-800">
                {rows.map((r) => {
                  const change = r.prior ? Math.round(((r.recent - r.prior) / r.prior) * 100) : null;
                  return (
                    <tr key={r.id}>
                      <td className="py-2.5">
                        <Link href={`/dashboard/trends?category=${r.id}`} className="flex items-center gap-2 text-zinc-800 hover:underline dark:text-zinc-200">
                          <CategoryDot color={r.color} />
                          {r.name}
                        </Link>
                      </td>
                      <td className="py-2.5 text-right font-medium text-zinc-900 dark:text-zinc-100">{formatMoney(r.year, currency)}</td>
                      <td className="py-2.5 text-right text-zinc-600 dark:text-zinc-400">{formatMoney(Math.round(r.year / 12), currency)}</td>
                      <td className="py-2.5 text-right">
                        {change === null ? (
                          <span className="text-zinc-400">{r.recent ? "New" : "—"}</span>
                        ) : (
                          <span className={change > 0 ? "text-critical" : change < 0 ? "text-good" : "text-zinc-500"}>
                            {change > 0 ? "↑" : change < 0 ? "↓" : ""} {Math.abs(change)}%
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="py-6 text-center text-sm text-zinc-500 dark:text-zinc-400">No spending in the last 12 months.</p>
        )}
      </Card>
    </>
  );
}
