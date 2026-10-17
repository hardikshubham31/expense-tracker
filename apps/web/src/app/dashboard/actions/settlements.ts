"use server";

import { refresh } from "next/cache";
import { apiAction } from "@/lib/api";
import { formToJson, type ActionResult } from "@/lib/action-utils";

async function done<T extends ActionResult>(result: Promise<T>) {
  const res = await result;
  if (res.ok) refresh();
  return res;
}

export async function recordSettlement(form: FormData): Promise<ActionResult> {
  return done(apiAction("POST", "/api/settlements", formToJson(form)));
}

export async function deleteSettlement(id: string): Promise<ActionResult> {
  return done(apiAction("DELETE", `/api/settlements/${encodeURIComponent(id)}`));
}
