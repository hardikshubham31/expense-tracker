"use server";

import { refresh } from "next/cache";
import { apiAction } from "@/lib/api";
import { formToJson, type ActionResult } from "@/lib/action-utils";

// Thin proxies to the API, which validates, authorizes and stores. They exist so
// forms can keep using server actions and get the page refreshed afterwards.

async function done<T extends ActionResult>(result: Promise<T>) {
  const res = await result;
  if (res.ok) refresh();
  return res;
}

export async function createExpense(form: FormData): Promise<ActionResult> {
  return done(apiAction("POST", "/api/expenses", formToJson(form, ["splitMembers"])));
}

export async function updateExpense(id: string, form: FormData): Promise<ActionResult> {
  return done(apiAction("PATCH", `/api/expenses/${encodeURIComponent(id)}`, formToJson(form, ["splitMembers"])));
}

export async function deleteExpense(id: string): Promise<ActionResult> {
  return done(apiAction("DELETE", `/api/expenses/${encodeURIComponent(id)}`));
}

export async function deleteReceipt(expenseId: string): Promise<ActionResult> {
  return done(apiAction("DELETE", `/api/expenses/${encodeURIComponent(expenseId)}/receipt`));
}
