import Link from "next/link";
import { CategoryDot } from "@/components/ui";
import { formatMoney } from "@/lib/money";
import { UNCATEGORIZED } from "@/lib/categories";
import type { CategoryTotal } from "@/lib/data";

const MAX_ROWS = 8;

/** Spending by category: ranked bars, values at the tip, folded into "Other" past 8 rows. */
export function CategoryBreakdown({
  categories,
  total,
  currency,
  monthParam,
}: {
  categories: CategoryTotal[];
  total: number;
  currency: string;
  monthParam: string;
}) {
  const spent = categories.filter((c) => c.total > 0);
  if (spent.length === 0) {
    return <p className="py-6 text-center text-sm text-zinc-500 dark:text-zinc-400">No spending this month yet.</p>;
  }

  let rows: (CategoryTotal & { href?: string })[] = spent;
  if (spent.length > MAX_ROWS) {
    const rest = spent.slice(MAX_ROWS - 1);
    rows = [
      ...spent.slice(0, MAX_ROWS - 1),
      {
        id: "other",
        name: `Other (${rest.length})`,
        color: null,
        budget: null,
        total: rest.reduce((s, c) => s + c.total, 0),
        count: rest.reduce((s, c) => s + c.count, 0),
      },
    ];
  }
  const max = rows[0].total;

  return (
    <ul className="space-y-3.5">
      {rows.map((c) => {
        const share = Math.round((c.total / total) * 100);
        const filter = c.id === "other" ? null : (c.id ?? UNCATEGORIZED);
        const label = (
          <>
            <span className="flex min-w-0 items-center gap-2">
              <CategoryDot color={c.color} />
              <span className="truncate text-zinc-800 dark:text-zinc-200">{c.name}</span>
            </span>
            <span className="shrink-0 tabular-nums">
              <span className="font-medium text-zinc-900 dark:text-zinc-100">{formatMoney(c.total, currency)}</span>
              <span className="ml-1.5 text-zinc-500 dark:text-zinc-400">{share}%</span>
            </span>
          </>
        );
        return (
          <li key={c.id ?? UNCATEGORIZED} className="space-y-1.5">
            {filter ? (
              <Link
                href={`/dashboard/expenses?month=${monthParam}&category=${filter}`}
                className="flex items-center justify-between gap-3 rounded-sm text-sm hover:underline focus-visible:outline-2 focus-visible:outline-emerald-600"
              >
                {label}
              </Link>
            ) : (
              <div className="flex items-center justify-between gap-3 text-sm">{label}</div>
            )}
            <div className="h-2" aria-hidden="true">
              <div
                className="h-full rounded-r-[4px]"
                style={{ width: `${Math.max((c.total / max) * 100, 1)}%`, backgroundColor: `var(--series-${c.color ?? "none"})` }}
              />
            </div>
          </li>
        );
      })}
    </ul>
  );
}

type Meter = { key: string; name: string; color: string | null; spent: number; budget: number };

/** Budget meters: fill carries severity (accent → warning → critical), always with an icon + label. */
export function BudgetMeters({
  categories,
  total,
  monthlyBudget,
  currency,
}: {
  categories: CategoryTotal[];
  total: number;
  monthlyBudget: number | null;
  currency: string;
}) {
  const meters: Meter[] = [];
  if (monthlyBudget) meters.push({ key: "overall", name: "Overall", color: null, spent: total, budget: monthlyBudget });
  for (const c of categories) {
    if (c.budget) meters.push({ key: c.id ?? UNCATEGORIZED, name: c.name, color: c.color, spent: c.total, budget: c.budget });
  }

  if (meters.length === 0) {
    return (
      <p className="py-4 text-sm text-zinc-500 dark:text-zinc-400">
        No budgets yet.{" "}
        <Link href="/dashboard/categories" className="font-medium text-emerald-700 hover:underline dark:text-emerald-400">
          Set category budgets
        </Link>{" "}
        or an{" "}
        <Link href="/dashboard/settings" className="font-medium text-emerald-700 hover:underline dark:text-emerald-400">
          overall monthly budget
        </Link>
        .
      </p>
    );
  }

  return (
    <ul className="space-y-4">
      {meters.map((m) => {
        const ratio = m.spent / m.budget;
        const state = ratio > 1 ? "over" : ratio >= 0.8 ? "near" : "ok";
        const fill = state === "over" ? "var(--status-critical)" : state === "near" ? "var(--status-warning)" : "var(--color-emerald-600)";
        return (
          <li key={m.key} className="space-y-1.5">
            <div className="flex items-center justify-between gap-3 text-sm">
              <span className="flex min-w-0 items-center gap-2">
                {m.key === "overall" ? null : <CategoryDot color={m.color} />}
                <span className={`truncate ${m.key === "overall" ? "font-medium" : ""} text-zinc-800 dark:text-zinc-200`}>{m.name}</span>
              </span>
              <span className="shrink-0 text-xs tabular-nums text-zinc-500 dark:text-zinc-400">
                <span className="font-medium text-zinc-900 dark:text-zinc-100">{formatMoney(m.spent, currency)}</span> of{" "}
                {formatMoney(m.budget, currency)}
              </span>
            </div>
            <div
              role="meter"
              aria-label={`${m.name} budget`}
              aria-valuemin={0}
              aria-valuemax={m.budget}
              aria-valuenow={Math.min(m.spent, m.budget)}
              aria-valuetext={`${Math.round(ratio * 100)}% used`}
              className="h-2 overflow-hidden rounded-full"
              style={{ backgroundColor: `color-mix(in oklab, ${fill} 18%, transparent)` }}
            >
              <div className="h-full rounded-full" style={{ width: `${Math.min(ratio, 1) * 100}%`, backgroundColor: fill }} />
            </div>
            <BudgetStatus state={state} ratio={ratio} remaining={m.budget - m.spent} currency={currency} />
          </li>
        );
      })}
    </ul>
  );
}

function BudgetStatus({
  state,
  ratio,
  remaining,
  currency,
}: {
  state: "ok" | "near" | "over";
  ratio: number;
  remaining: number;
  currency: string;
}) {
  if (state === "over") {
    return (
      <p className="flex items-center gap-1 text-xs font-medium text-critical">
        <svg aria-hidden="true" viewBox="0 0 24 24" className="size-3.5" fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10" />
          <path d="M12 8v4M12 16h.01" />
        </svg>
        Over by {formatMoney(-remaining, currency)}
      </p>
    );
  }
  if (state === "near") {
    return (
      <p className="flex items-center gap-1 text-xs font-medium text-zinc-700 dark:text-zinc-300">
        <svg aria-hidden="true" viewBox="0 0 24 24" className="size-3.5 text-[var(--status-warning)]" fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round">
          <path d="m21.7 18-8-14a2 2 0 0 0-3.4 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.7-3Z" />
          <path d="M12 9v4M12 17h.01" />
        </svg>
        {Math.round(ratio * 100)}% used · {formatMoney(remaining, currency)} left
      </p>
    );
  }
  return (
    <p className="text-xs text-zinc-500 dark:text-zinc-400">
      {formatMoney(remaining, currency)} left
    </p>
  );
}
