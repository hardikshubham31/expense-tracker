"use client";

import { createContext, use, useEffect, useState, type ReactNode } from "react";
import type { CategoryRow } from "@/lib/data";
import { ExpenseDialog } from "./expense-dialog";

export type LedgerUI = {
  ledgerId: string;
  currency: string;
  isShared: boolean;
  meId: string;
  /** Current members (payer / split choices) */
  members: { id: string; name: string }[];
  /** Every member ever, for labelling older expenses */
  memberNames: Record<string, string>;
  categories: CategoryRow[];
  /** Recent description -> category, newest first */
  hints: { description: string; categoryId: string | null }[];
};

const LedgerContext = createContext<LedgerUI | null>(null);

export function useLedgerUI() {
  const value = use(LedgerContext);
  if (!value) throw new Error("useLedgerUI must be used inside <LedgerProvider>");
  return value;
}

const OPEN_EVENT = "open-add-expense";

/** Open the shared "Add expense" dialog from anywhere. */
export function openAddExpense() {
  window.dispatchEvent(new Event(OPEN_EVENT));
}

function isTypingTarget(target: EventTarget | null) {
  const el = target as HTMLElement | null;
  if (!el) return false;
  // Focus can linger in a dialog that has just closed
  if (el.closest("dialog") && !el.closest("dialog[open]")) return false;
  return Boolean(el.closest("input, textarea, select, [contenteditable=true], dialog[open]"));
}

/** Provides ledger data to client components and owns the global quick-add dialog (press N). */
export function LedgerProvider({ value, children }: { value: LedgerUI; children: ReactNode }) {
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    const open = () => setAdding(true);
    const onKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() !== "n" || e.metaKey || e.ctrlKey || e.altKey || isTypingTarget(e.target)) return;
      e.preventDefault();
      setAdding(true);
    };
    window.addEventListener(OPEN_EVENT, open);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener(OPEN_EVENT, open);
      window.removeEventListener("keydown", onKey);
    };
  }, []);

  return (
    <LedgerContext value={value}>
      {children}
      <ExpenseDialog open={adding} onClose={() => setAdding(false)} />
    </LedgerContext>
  );
}
