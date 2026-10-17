"use server";

import { refresh } from "next/cache";
import { apiAction } from "@/lib/api";
import { formToJson, type ActionResult } from "@/lib/action-utils";

export async function updateAccount(form: FormData): Promise<ActionResult> {
  const res = await apiAction("PATCH", "/api/account", formToJson(form));
  if (res.ok) refresh();
  return res;
}

/** Called once from the browser when the account has no time zone yet. */
export async function saveDetectedTimezone(timezone: string) {
  await apiAction("POST", "/api/account/timezone", { timezone });
  refresh();
}
