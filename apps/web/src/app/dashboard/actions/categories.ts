"use server";

import { refresh } from "next/cache";
import { apiAction } from "@/lib/api";
import { formToJson, type ActionResult } from "@/lib/action-utils";

async function done<T extends ActionResult>(result: Promise<T>) {
  const res = await result;
  if (res.ok) refresh();
  return res;
}

export async function createCategory(form: FormData): Promise<ActionResult> {
  return done(apiAction("POST", "/api/categories", formToJson(form)));
}

export async function updateCategory(id: string, form: FormData): Promise<ActionResult> {
  return done(apiAction("PATCH", `/api/categories/${encodeURIComponent(id)}`, formToJson(form)));
}

/** Expenses in a deleted category become uncategorized. */
export async function deleteCategory(id: string): Promise<ActionResult> {
  return done(apiAction("DELETE", `/api/categories/${encodeURIComponent(id)}`));
}
