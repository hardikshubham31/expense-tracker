"use server";

import { refresh } from "next/cache";
import { apiAction, apiPostJson } from "@/lib/api";
import type { ActionResult } from "@/lib/action-utils";

/** A parsed, validated row from the CSV importer (amount in hundredths). */
export type ImportRow = { date: string; description: string; amount: number; categoryId: string | null; notes: string | null };

/** Which rows (by index) already exist in the ledger: same date, amount and description. */
export async function findImportDuplicates(rows: ImportRow[]): Promise<number[]> {
  return apiPostJson<number[]>("/api/expenses/import/duplicates", { rows });
}

export async function importExpenses(rows: ImportRow[]): Promise<ActionResult & { imported?: number }> {
  const res = await apiAction("POST", "/api/expenses/import", { rows });
  if (res.ok) refresh();
  return res.ok ? { ok: true, imported: Number(res.imported) } : res;
}
