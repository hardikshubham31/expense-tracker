"use client";

import { useState } from "react";
import { CategoryDot } from "@/components/ui";
import { formatMoney } from "@/lib/money";
import { formatDay } from "@/lib/dates";
import type { ExpenseRow } from "@/lib/data";
import { ExpenseDialog } from "./expense-dialog";
import { useLedgerUI } from "./ledger-context";

type Group = { key: string; date: Date; total: number; items: ExpenseRow[] };

function groupByDay(expenses: ExpenseRow[]) {
  const groups: Group[] = [];
  for (const e of expenses) {
    const key = e.date.toISOString().slice(0, 10);
    let group = groups.at(-1);
    if (group?.key !== key) {
      group = { key, date: e.date, total: 0, items: [] };
      groups.push(group);
    }
    group.total += e.amount;
    group.items.push(e);
  }
  return groups;
}

export function RepeatIcon({ className = "size-3.5" }: { className?: string }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="m17 2 4 4-4 4" />
      <path d="M3 11v-1a4 4 0 0 1 4-4h14M7 22l-4-4 4-4" />
      <path d="M21 13v1a4 4 0 0 1-4 4H3" />
    </svg>
  );
}

function PaperclipIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="size-3.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="m21.4 11.1-9.2 9.2a6 6 0 0 1-8.5-8.5l9.2-9.2a4 4 0 0 1 5.7 5.7l-9.2 9.2a2 2 0 0 1-2.8-2.8l8.5-8.5" />
    </svg>
  );
}

export function ExpenseList({ expenses, grouped = true }: { expenses: ExpenseRow[]; grouped?: boolean }) {
  const ui = useLedgerUI();
  // Track by id so the dialog shows fresh data after a refresh (e.g. receipt removed)
  const [editingId, setEditingId] = useState<string | null>(null);
  const editing = expenses.find((e) => e.id === editingId) ?? null;

  const rows = (items: ExpenseRow[], showDate: boolean) => (
    <ul className="divide-y divide-zinc-100 dark:divide-zinc-800">
      {items.map((e) => {
        const meta = [
          e.category?.name ?? "Uncategorized",
          showDate ? formatDay(e.date, { day: "numeric", month: "short" }) : null,
          ui.isShared ? `${ui.memberNames[e.paidById] ?? "Someone"} paid` : null,
          e.notes,
        ].filter(Boolean);
        return (
          <li key={e.id}>
            <button
              type="button"
              onClick={() => setEditingId(e.id)}
              className="flex w-full items-center gap-3 px-1 py-3 text-left transition hover:bg-zinc-50 focus-visible:rounded-lg focus-visible:outline-2 focus-visible:outline-emerald-600 dark:hover:bg-zinc-800/50"
            >
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-1.5 text-sm font-medium text-zinc-900 dark:text-zinc-100">
                  <span className="truncate">{e.description}</span>
                  {e.recurringId ? (
                    <span className="shrink-0 text-zinc-400" title="Recurring">
                      <RepeatIcon />
                      <span className="sr-only">(recurring)</span>
                    </span>
                  ) : null}
                  {e.receipt ? (
                    <span className="shrink-0 text-zinc-400" title="Has receipt">
                      <PaperclipIcon />
                      <span className="sr-only">(has receipt)</span>
                    </span>
                  ) : null}
                </span>
                <span className="mt-0.5 flex items-center gap-1.5 text-xs text-zinc-500 dark:text-zinc-400">
                  <CategoryDot color={e.category?.color} />
                  <span className="truncate">{meta.join(" · ")}</span>
                </span>
              </span>
              <span className="text-sm font-semibold tabular-nums text-zinc-900 dark:text-zinc-100">{formatMoney(e.amount, ui.currency)}</span>
              <span className="sr-only">, edit</span>
            </button>
          </li>
        );
      })}
    </ul>
  );

  return (
    <>
      {grouped ? (
        <div className="space-y-6">
          {groupByDay(expenses).map((g) => (
            <section key={g.key} aria-label={formatDay(g.date, { weekday: "long", day: "numeric", month: "long" })}>
              <div className="flex items-baseline justify-between border-b border-zinc-200 pb-2 text-xs font-medium text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
                <span>{formatDay(g.date)}</span>
                <span className="tabular-nums">{formatMoney(g.total, ui.currency)}</span>
              </div>
              {rows(g.items, false)}
            </section>
          ))}
        </div>
      ) : (
        rows(expenses, true)
      )}

      <ExpenseDialog open={editing !== null} onClose={() => setEditingId(null)} expense={editing} />
    </>
  );
}
