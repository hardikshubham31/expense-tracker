"use server";

import { refresh } from "next/cache";
import { apiAction } from "@/lib/api";
import { formToJson, type ActionResult } from "@/lib/action-utils";

async function done<T extends ActionResult>(result: Promise<T>) {
  const res = await result;
  if (res.ok) refresh();
  return res;
}

export async function createIncome(form: FormData): Promise<ActionResult> {
  return done(apiAction("POST", "/api/income", formToJson(form)));
}

export async function updateIncome(id: string, form: FormData): Promise<ActionResult> {
  return done(apiAction("PATCH", `/api/income/${encodeURIComponent(id)}`, formToJson(form)));
}

export async function deleteIncome(id: string): Promise<ActionResult> {
  return done(apiAction("DELETE", `/api/income/${encodeURIComponent(id)}`));
}
