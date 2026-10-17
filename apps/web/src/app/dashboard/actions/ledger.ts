"use server";

import { cookies } from "next/headers";
import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { apiAction } from "@/lib/api";
import { LEDGER_COOKIE, requireLedger } from "@/lib/session";
import { formToJson, type ActionResult } from "@/lib/action-utils";

/** The active ledger is a UI choice stored here; the API checks membership on every call. */
async function setActiveLedger(id: string) {
  (await cookies()).set(LEDGER_COOKIE, id, { httpOnly: true, sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 365 });
}

export async function switchLedger(id: string) {
  const { ledgers } = await requireLedger();
  if (ledgers.some((l) => l.id === id)) await setActiveLedger(id);
  redirect("/dashboard");
}

export async function createHousehold(form: FormData): Promise<ActionResult> {
  const res = await apiAction("POST", "/api/households", formToJson(form));
  if (!res.ok) return res;
  await setActiveLedger(String(res.id));
  redirect("/dashboard/settings");
}

export async function updateLedgerSettings(form: FormData): Promise<ActionResult> {
  const res = await apiAction("PATCH", "/api/ledger", formToJson(form));
  if (res.ok) refresh();
  return res;
}

export async function inviteMember(form: FormData): Promise<ActionResult> {
  const res = await apiAction("POST", "/api/ledger/invites", formToJson(form));
  if (res.ok) refresh();
  return res;
}

export async function revokeInvite(id: string): Promise<ActionResult> {
  const res = await apiAction("DELETE", `/api/ledger/invites/${encodeURIComponent(id)}`);
  if (res.ok) refresh();
  return res;
}

/** Accept from /invite/[token]. The signed-in account's email must match the invite. */
export async function acceptInvite(token: string): Promise<ActionResult> {
  const res = await apiAction("POST", `/api/invites/${encodeURIComponent(token)}/accept`);
  if (!res.ok) return res;
  await setActiveLedger(String(res.ledgerId));
  redirect("/dashboard");
}

export async function removeMember(memberId: string): Promise<ActionResult> {
  const res = await apiAction("DELETE", `/api/ledger/members/${encodeURIComponent(memberId)}`);
  if (res.ok) refresh();
  return res;
}

export async function leaveLedger(): Promise<ActionResult> {
  const res = await apiAction("POST", "/api/ledger/leave");
  if (!res.ok) return res;
  (await cookies()).delete(LEDGER_COOKIE);
  redirect("/dashboard");
}

export async function deleteLedger(): Promise<ActionResult> {
  const res = await apiAction("DELETE", "/api/ledger");
  if (!res.ok) return res;
  (await cookies()).delete(LEDGER_COOKIE);
  redirect("/dashboard");
}
