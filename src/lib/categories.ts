/**
 * Category colors are palette slots, not hex values. Each slot maps to a CSS
 * variable (--series-<slot>) with separate light/dark steps in globals.css.
 * The order is the validated categorical order: assign in this order, never cycle.
 */
export const COLOR_SLOTS = ["blue", "orange", "aqua", "yellow", "magenta", "green", "violet", "red"] as const;

export type ColorSlot = (typeof COLOR_SLOTS)[number];

export function isColorSlot(value: string): value is ColorSlot {
  return (COLOR_SLOTS as readonly string[]).includes(value);
}

export function seriesColor(slot: string | null | undefined) {
  return slot && isColorSlot(slot) ? `var(--series-${slot})` : "var(--series-none)";
}

/** Keep in sync with the seed in prisma/migrations/*_expenses/migration.sql. */
export const DEFAULT_CATEGORIES: { name: string; color: ColorSlot }[] = [
  { name: "Food & Dining", color: "orange" },
  { name: "Groceries", color: "green" },
  { name: "Transport", color: "blue" },
  { name: "Shopping", color: "magenta" },
  { name: "Bills & Utilities", color: "yellow" },
  { name: "Entertainment", color: "violet" },
  { name: "Health", color: "red" },
  { name: "Travel", color: "aqua" },
];

/** First palette slot not already used, so new categories don't repeat colors until all 8 are taken. */
export function nextColorSlot(used: string[]): ColorSlot {
  return COLOR_SLOTS.find((slot) => !used.includes(slot)) ?? COLOR_SLOTS[used.length % COLOR_SLOTS.length];
}

export const UNCATEGORIZED = "uncategorized";
