"use server";

import { refresh } from "next/cache";
import { apiAction } from "@/lib/api";
import { formToJson, type ActionResult } from "@/lib/action-utils";

async function done<T extends ActionResult>(result: Promise<T>) {
  const res = await result;
  if (res.ok) refresh();
  return res;
}

export async function createRecurring(form: FormData): Promise<ActionResult> {
  return done(apiAction("POST", "/api/recurring", formToJson(form)));
}

export async function updateRecurring(id: string, form: FormData): Promise<ActionResult> {
  return done(apiAction("PATCH", `/api/recurring/${encodeURIComponent(id)}`, formToJson(form)));
}

export async function setRecurringActive(id: string, active: boolean): Promise<ActionResult> {
  return done(apiAction("POST", `/api/recurring/${encodeURIComponent(id)}/active`, { active }));
}

/** Deleting a rule keeps the entries it already created. */
export async function deleteRecurring(id: string): Promise<ActionResult> {
  return done(apiAction("DELETE", `/api/recurring/${encodeURIComponent(id)}`));
}
