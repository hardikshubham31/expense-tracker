"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/dashboard", label: "Overview" },
  { href: "/dashboard/expenses", label: "Expenses" },
  { href: "/dashboard/income", label: "Income" },
  { href: "/dashboard/recurring", label: "Recurring" },
  { href: "/dashboard/trends", label: "Trends" },
  { href: "/dashboard/categories", label: "Categories" },
  { href: "/dashboard/balances", label: "Balances", sharedOnly: true },
  { href: "/dashboard/settings", label: "Settings" },
] as const;

export function DashboardNav({ shared }: { shared: boolean }) {
  const pathname = usePathname();
  return (
    <nav aria-label="Main" className="-mb-px flex gap-1 overflow-x-auto [scrollbar-width:none]">
      {LINKS.filter((l) => !("sharedOnly" in l) || shared).map(({ href, label }) => {
        const active = href === "/dashboard" ? pathname === href : pathname.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={`whitespace-nowrap border-b-2 px-3 py-3 text-sm font-medium transition focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-emerald-600 ${
              active
                ? "border-emerald-600 text-zinc-900 dark:text-zinc-50"
                : "border-transparent text-zinc-500 hover:border-zinc-300 hover:text-zinc-800 dark:text-zinc-400 dark:hover:border-zinc-700 dark:hover:text-zinc-200"
            }`}
          >
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
