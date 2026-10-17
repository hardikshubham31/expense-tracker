import { z } from "zod";

/** `id` is the created/updated row, when the caller needs it (e.g. to attach a receipt). */
export type ActionResult = { ok: true; id?: string } | { ok: false; error?: string; fieldErrors?: Record<string, string> };

export function fail(fieldErrors: Record<string, string>): { ok: false; fieldErrors: Record<string, string> } {
  return { ok: false, fieldErrors };
}

export function failMessage(error: string): { ok: false; error: string } {
  return { ok: false, error };
}

export function firstErrors(error: z.ZodError) {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = String(issue.path[0] ?? "form");
    out[key] ??= issue.message;
  }
  return out;
}

export const text = (max: number) => z.string().trim().max(max, `Keep it under ${max} characters.`);

export function isUniqueViolation(error: unknown) {
  return typeof error === "object" && error !== null && "code" in error && error.code === "P2002";
}
