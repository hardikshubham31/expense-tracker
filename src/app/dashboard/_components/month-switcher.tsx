import Link from "next/link";
import { formatMonth, monthKey, shiftMonth, type Month } from "@/lib/dates";

/** Prev / next month links that keep the rest of the query string. */
export function MonthSwitcher({
  month,
  basePath,
  params = {},
}: {
  month: Month;
  basePath: string;
  params?: Record<string, string | undefined>;
}) {
  const href = (m: Month) => {
    const search = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) if (v) search.set(k, v);
    search.set("month", monthKey(m));
    return `${basePath}?${search}`;
  };
  const prev = shiftMonth(month, -1);
  const next = shiftMonth(month, 1);

  const btn =
    "grid size-9 place-items-center rounded-lg text-zinc-600 transition hover:bg-zinc-100 hover:text-zinc-900 focus-visible:outline-2 focus-visible:outline-emerald-600 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-100";

  return (
    <nav aria-label="Month" className="inline-flex items-center rounded-xl border border-zinc-200 bg-white p-0.5 shadow-xs dark:border-zinc-800 dark:bg-zinc-900">
      <Link href={href(prev)} className={btn} aria-label={`Previous month, ${formatMonth(prev)}`}>
        <Chevron dir="left" />
      </Link>
      <span className="min-w-36 px-2 text-center text-sm font-medium text-zinc-900 dark:text-zinc-100">
        {formatMonth(month)}
      </span>
      <Link href={href(next)} className={btn} aria-label={`Next month, ${formatMonth(next)}`}>
        <Chevron dir="right" />
      </Link>
    </nav>
  );
}

function Chevron({ dir }: { dir: "left" | "right" }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round">
      <path d={dir === "left" ? "m15 18-6-6 6-6" : "m9 18 6-6-6-6"} />
    </svg>
  );
}
