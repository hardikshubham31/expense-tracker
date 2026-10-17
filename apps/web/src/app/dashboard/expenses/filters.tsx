"use client";

import Form from "next/form";
import Link from "next/link";
import { selectBase } from "@/components/ui";
import { inputClass } from "@/components/auth/field";
import { UNCATEGORIZED } from "@expense/shared/categories";
import type { CategoryRow } from "@/lib/data";

export function ExpenseFilters({
  month,
  q,
  category,
  categories,
}: {
  month: string;
  q?: string;
  category?: string;
  categories: CategoryRow[];
}) {
  return (
    <Form action="/dashboard/expenses" role="search" className="flex flex-1 flex-wrap items-center gap-2">
      <input type="hidden" name="month" value={month} />
      <label className="relative min-w-48 flex-1 sm:max-w-xs">
        <span className="sr-only">Search expenses</span>
        <svg aria-hidden="true" viewBox="0 0 24 24" className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-zinc-400" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <circle cx="11" cy="11" r="7" />
          <path d="m20 20-3.5-3.5" />
        </svg>
        <input type="search" name="q" defaultValue={q} placeholder="Search descriptions and notes" className={`${inputClass} pl-9`} />
      </label>
      <label>
        <span className="sr-only">Category</span>
        <select
          name="category"
          defaultValue={category ?? ""}
          onChange={(e) => e.currentTarget.form?.requestSubmit()}
          className={`${selectBase} w-auto`}
        >
          <option value="">All categories</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
          <option value={UNCATEGORIZED}>Uncategorized</option>
        </select>
      </label>
      <button type="submit" className="sr-only focus:not-sr-only focus:rounded-lg focus:px-3 focus:py-2 focus:text-sm">
        Search
      </button>
      {q || category ? (
        <Link href={`/dashboard/expenses?month=${month}`} className="rounded-lg px-2.5 py-2 text-sm font-medium text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800">
          Clear
        </Link>
      ) : null}
    </Form>
  );
}
