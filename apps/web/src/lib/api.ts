import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { ActionResult } from "@/lib/action-utils";

/**
 * Server-side client for the Express API. Forwards the visitor's cookies
 * (session + active ledger), so the API authorizes every call itself.
 * The browser reaches the same API through the /api rewrite in next.config.ts.
 */
const API_URL = process.env.API_URL ?? "http://localhost:4000";

/** JSON has no Date: revive the date fields the UI works with. */
const DATE_KEYS = new Set(["date", "startDate", "endDate", "nextDate", "expiresAt", "leftAt", "createdAt", "joinedAt", "sessionCreatedAt"]);
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/;
const revive = (key: string, value: unknown) => (DATE_KEYS.has(key) && typeof value === "string" && ISO.test(value) ? new Date(value) : value);

async function request(method: string, path: string, body?: unknown) {
  const jar = await cookies();
  return fetch(`${API_URL}${path}`, {
    method,
    headers: {
      cookie: jar.toString(),
      ...(body === undefined ? {} : { "content-type": "application/json" }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: "no-store",
  });
}

/** GET that must succeed. 401 sends the visitor to /login. */
export async function apiGet<T>(path: string): Promise<T> {
  const res = await request("GET", path);
  if (res.status === 401) redirect("/login");
  if (!res.ok) throw new Error(`API GET ${path} failed: ${res.status}`);
  return JSON.parse(await res.text(), revive) as T;
}

/** GET that may legitimately 404 (e.g. an expired invite). */
export async function apiGetOrNull<T>(path: string): Promise<T | null> {
  const res = await request("GET", path);
  if (res.status === 401) redirect("/login");
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`API GET ${path} failed: ${res.status}`);
  return JSON.parse(await res.text(), revive) as T;
}

/** POST that returns data (not an ActionResult). */
export async function apiPostJson<T>(path: string, body: unknown): Promise<T> {
  const res = await request("POST", path, body);
  if (res.status === 401) redirect("/login");
  if (!res.ok) throw new Error(`API POST ${path} failed: ${res.status}`);
  return JSON.parse(await res.text(), revive) as T;
}

/**
 * A mutation from a server action, mapped to ActionResult for the forms:
 * field errors show next to inputs, other errors in an alert.
 */
export async function apiAction(method: "POST" | "PATCH" | "DELETE", path: string, body?: unknown): Promise<ActionResult & Record<string, unknown>> {
  const res = await request(method, path, body);
  if (res.status === 401) redirect("/login");
  const data = (await res.json().catch(() => ({}))) as { error?: string; fieldErrors?: Record<string, string> } & Record<string, unknown>;
  if (res.ok) return { ...data, ok: true };
  if (res.status >= 500) return { ok: false, error: "Something went wrong. Please try again." };
  return data.fieldErrors ? { ok: false, fieldErrors: data.fieldErrors } : { ok: false, error: data.error ?? "Something went wrong." };
}
