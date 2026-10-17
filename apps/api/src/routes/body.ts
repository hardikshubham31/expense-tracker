import type { Request } from "express";

/** JSON body as a plain object (never null), so handlers can read fields safely. */
export function bodyOf(req: Request): Record<string, unknown> {
  const body: unknown = req.body;
  return body && typeof body === "object" && !Array.isArray(body) ? (body as Record<string, unknown>) : {};
}

/** A field as a string ("" if missing). Numbers are accepted and stringified. */
export function str(body: Record<string, unknown>, key: string) {
  const v = body[key];
  return typeof v === "string" ? v : typeof v === "number" ? String(v) : "";
}

/** A repeated field (e.g. checkboxes) as a string array. */
export function strs(body: Record<string, unknown>, key: string) {
  const v = body[key];
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : typeof v === "string" ? [v] : [];
}

/** Route param as a string (Express 5 types allow arrays for wildcard params). */
export function param(req: Request, key: string) {
  const v = req.params[key];
  return Array.isArray(v) ? v.join("/") : String(v ?? "");
}
