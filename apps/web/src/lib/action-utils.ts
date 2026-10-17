/** `id` is the created/updated row, when the caller needs it (e.g. to attach a receipt). */
export type ActionResult = { ok: true; id?: string } | { ok: false; error?: string; fieldErrors?: Record<string, string> };

/**
 * FormData -> JSON for the API. Repeated fields (checkbox groups) become arrays;
 * file inputs are skipped (receipts upload separately).
 */
export function formToJson(form: FormData, arrayKeys: string[] = []) {
  const out: Record<string, string | string[]> = {};
  for (const key of new Set(form.keys())) {
    const values = form.getAll(key).filter((v): v is string => typeof v === "string");
    out[key] = arrayKeys.includes(key) ? values : (values[0] ?? "");
  }
  return out;
}
