"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, useTransition } from "react";
import { Card } from "@/components/ui";
import { FormAlert, Spinner } from "@/components/auth/ui";
import { buttonStyles, selectClass } from "@/components/ui";
import {
  DATE_FORMATS,
  MAX_IMPORT_ROWS,
  detectDateFormat,
  detectDecimalComma,
  parseCSV,
  parseImportAmount,
  parseImportDate,
  type DateFormatId,
} from "@/lib/csv";
import { formatMoney } from "@/lib/money";
import { suggestCategory } from "@/lib/suggest";
import { findImportDuplicates, importExpenses, type ImportRow } from "../../actions/import";
import { useLedgerUI } from "../../_components/ledger-context";

type Field = "date" | "description" | "amount" | "category" | "notes";
const FIELDS: { key: Field; label: string; required: boolean; guess: RegExp }[] = [
  { key: "date", label: "Date", required: true, guess: /^(txn |transaction |value |posting )?date$|^date/i },
  { key: "description", label: "Description", required: true, guess: /desc|narration|details|particular|merchant|payee|remark|name|memo/i },
  { key: "amount", label: "Amount", required: true, guess: /amount|debit|withdrawal|value|spent/i },
  { key: "category", label: "Category", required: false, guess: /categor/i },
  { key: "notes", label: "Notes", required: false, guess: /^notes?$|comment/i },
];
const PREVIEW_ROWS = 200;

type Status = "ok" | "duplicate" | "skipped" | "invalid";
type Processed = { status: Status; reason?: string; row?: ImportRow };

export function CsvImporter() {
  const ui = useLedgerUI();
  const [fileName, setFileName] = useState<string | null>(null);
  const [table, setTable] = useState<string[][]>([]);
  const [hasHeader, setHasHeader] = useState(true);
  const [mapping, setMapping] = useState<Record<Field, number | null>>({ date: null, description: null, amount: null, category: null, notes: null });
  const [dateFormat, setDateFormat] = useState<DateFormatId>("ymd");
  const [decimalComma, setDecimalComma] = useState(false);
  const [expenseSign, setExpenseSign] = useState<"negative" | "positive">("positive");
  const [overrides, setOverrides] = useState<Record<number, string>>({});
  const [duplicates, setDuplicates] = useState<Set<number>>(new Set());
  const [checking, startChecking] = useTransition();
  const [importing, startImport] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [imported, setImported] = useState<number | null>(null);

  const header = hasHeader ? (table[0] ?? []) : (table[0] ?? []).map((_, i) => `Column ${i + 1}`);
  const body = useMemo(() => (hasHeader ? table.slice(1) : table), [table, hasHeader]);

  async function onFile(file: File | undefined) {
    setError(null);
    setImported(null);
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) return setError("That file is over 5 MB. Split it into smaller files.");
    const rows = parseCSV(await file.text());
    if (rows.length < 2) return setError("That file doesn't look like a CSV with data rows.");

    const first = rows[0];
    const looksLikeHeader = first.some((c) => c && Number.isNaN(Number(c.replace(/[,\s]/g, ""))) && !parseImportDate(c, detectDateFormat([c])));
    const head = looksLikeHeader ? first : first.map((_, i) => `Column ${i + 1}`);
    const data = looksLikeHeader ? rows.slice(1) : rows;

    const guessed = Object.fromEntries(
      FIELDS.map((f) => {
        const idx = head.findIndex((h) => f.guess.test(h.trim()));
        return [f.key, idx >= 0 ? idx : null];
      }),
    ) as Record<Field, number | null>;
    // Without headers, guess by content: first date-like column, first numeric column, longest text column.
    if (!looksLikeHeader) {
      guessed.date = first.findIndex((c) => parseImportDate(c, detectDateFormat([c]))) ;
      guessed.amount = first.findIndex((c) => parseImportAmount(c) !== null);
      guessed.description = first.reduce((best, c, i) => (parseImportAmount(c) === null && c.length > (first[best]?.length ?? 0) ? i : best), 0);
      for (const k of ["date", "amount"] as const) if ((guessed[k] ?? -1) < 0) guessed[k] = null;
    }

    const sampleCol = (i: number | null) => (i === null ? [] : data.map((r) => r[i] ?? ""));
    const amounts = sampleCol(guessed.amount);
    const comma = detectDecimalComma(amounts);
    const negatives = amounts.filter((a) => (parseImportAmount(a, comma) ?? 0) < 0).length;

    setFileName(file.name);
    setTable(rows);
    setHasHeader(looksLikeHeader);
    setMapping(guessed);
    setDateFormat(detectDateFormat(sampleCol(guessed.date)));
    setDecimalComma(comma);
    setExpenseSign(negatives > amounts.length / 2 ? "negative" : "positive");
    setOverrides({});
    setDuplicates(new Set());
  }

  const processed: Processed[] = useMemo(() => {
    const get = (r: string[], f: Field) => (mapping[f] === null ? "" : (r[mapping[f]!] ?? "").trim());
    const byName = new Map(ui.categories.map((c) => [c.name.toLowerCase(), c.id]));
    return body.slice(0, MAX_IMPORT_ROWS).map((r, i) => {
      const date = parseImportDate(get(r, "date"), dateFormat);
      if (!date) return { status: "invalid", reason: "Unreadable date" };
      const description = get(r, "description").slice(0, 120);
      if (!description) return { status: "invalid", reason: "No description" };
      const rawAmount = get(r, "amount");
      // Bank exports with separate Debit/Credit columns leave one of them blank
      if (!rawAmount) return { status: "skipped", reason: "No amount" };
      const signed = parseImportAmount(rawAmount, decimalComma);
      if (signed === null || signed === 0) return { status: "invalid", reason: "Unreadable amount" };
      if (expenseSign === "negative" ? signed > 0 : signed < 0) return { status: "skipped", reason: "Income or refund" };
      const amount = Math.abs(signed);
      if (amount > 10_000_000 * 100) return { status: "invalid", reason: "Amount too large" };

      const categoryId =
        overrides[i] !== undefined
          ? overrides[i] || null
          : (byName.get(get(r, "category").toLowerCase()) ?? suggestCategory(description, ui.hints, ui.categories));
      const row: ImportRow = { date, description, amount, categoryId, notes: get(r, "notes").slice(0, 500) || null };
      return { status: duplicates.has(i) ? "duplicate" : "ok", row };
    });
  }, [body, mapping, dateFormat, decimalComma, expenseSign, overrides, duplicates, ui.categories, ui.hints]);

  const ready = FIELDS.every((f) => !f.required || mapping[f.key] !== null);
  const candidateKey = processed.map((p) => (p.row ? `${p.row.date}|${p.row.amount}|${p.row.description}` : "")).join("\n");

  // Re-check duplicates against the ledger whenever the parsed rows change.
  useEffect(() => {
    if (!ready || !candidateKey) return;
    const rows = processed.flatMap((p, i) => (p.row ? [{ i, row: p.row }] : []));
    startChecking(async () => {
      const dupIdx = await findImportDuplicates(rows.map((r) => r.row));
      setDuplicates(new Set(dupIdx.map((d) => rows[d].i)));
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- candidateKey captures the relevant row changes
  }, [ready, candidateKey]);

  const counts = processed.reduce((acc, p) => ({ ...acc, [p.status]: (acc[p.status] ?? 0) + 1 }), {} as Record<Status, number>);
  const toImport = processed.filter((p) => p.status === "ok").map((p) => p.row!);
  const importTotal = toImport.reduce((s, r) => s + r.amount, 0);

  function handleImport() {
    setError(null);
    startImport(async () => {
      const res = await importExpenses(toImport);
      if (!res.ok) return setError(res.error ?? "Import failed.");
      setImported(res.imported ?? toImport.length);
      setTable([]);
      setFileName(null);
    });
  }

  if (imported !== null) {
    return (
      <Card>
        <FormAlert tone="success">
          Imported {imported} {imported === 1 ? "expense" : "expenses"}.{" "}
          <Link href="/dashboard/expenses" className="font-semibold underline">
            View expenses
          </Link>
        </FormAlert>
        <button type="button" onClick={() => setImported(null)} className={`${buttonStyles.secondary} mt-4`}>
          Import another file
        </button>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {error ? <FormAlert>{error}</FormAlert> : null}

      <Card title="1. Choose a file">
        <input
          type="file"
          accept=".csv,text/csv"
          aria-label="CSV file"
          onChange={(e) => onFile(e.target.files?.[0])}
          className="block w-full text-sm text-zinc-600 file:mr-3 file:rounded-lg file:border-0 file:bg-emerald-600 file:px-3.5 file:py-2 file:text-sm file:font-semibold file:text-white hover:file:bg-emerald-700 dark:text-zinc-400"
        />
        <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">
          Up to {MAX_IMPORT_ROWS.toLocaleString()} rows. Columns are matched automatically; you can adjust them below.
        </p>
      </Card>

      {table.length ? (
        <>
          <Card title={`2. Match columns · ${fileName}`}>
            <div className="grid gap-4 sm:grid-cols-3 lg:grid-cols-5">
              {FIELDS.map((f) => (
                <label key={f.key} className="space-y-1.5 text-sm">
                  <span className="font-medium text-zinc-800 dark:text-zinc-200">
                    {f.label}
                    {f.required ? "" : <span className="font-normal text-zinc-500"> (optional)</span>}
                  </span>
                  <select
                    value={mapping[f.key] ?? ""}
                    onChange={(e) => setMapping((m) => ({ ...m, [f.key]: e.target.value === "" ? null : Number(e.target.value) }))}
                    className={selectClass}
                  >
                    <option value="">{f.required ? "Choose a column" : "None"}</option>
                    {header.map((h, i) => (
                      <option key={i} value={i}>
                        {h || `Column ${i + 1}`}
                      </option>
                    ))}
                  </select>
                </label>
              ))}
            </div>
            <div className="mt-5 grid gap-4 sm:grid-cols-3">
              <label className="space-y-1.5 text-sm">
                <span className="font-medium text-zinc-800 dark:text-zinc-200">Date format</span>
                <select value={dateFormat} onChange={(e) => setDateFormat(e.target.value as DateFormatId)} className={selectClass}>
                  {DATE_FORMATS.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="space-y-1.5 text-sm">
                <span className="font-medium text-zinc-800 dark:text-zinc-200">Expenses appear as</span>
                <select value={expenseSign} onChange={(e) => setExpenseSign(e.target.value as "negative" | "positive")} className={selectClass}>
                  <option value="positive">Positive numbers (skip negatives)</option>
                  <option value="negative">Negative numbers (skip positives)</option>
                </select>
              </label>
              <label className="flex items-center gap-2 self-end pb-2.5 text-sm text-zinc-700 dark:text-zinc-300">
                <input type="checkbox" checked={decimalComma} onChange={(e) => setDecimalComma(e.target.checked)} className="size-4 accent-emerald-600" />
                Comma is the decimal separator (1.234,56)
              </label>
            </div>
            <label className="mt-3 flex items-center gap-2 text-sm text-zinc-700 dark:text-zinc-300">
              <input type="checkbox" checked={hasHeader} onChange={(e) => setHasHeader(e.target.checked)} className="size-4 accent-emerald-600" />
              First row is a header
            </label>
          </Card>

          {ready ? (
            <Card
              title="3. Review"
              action={
                <span className="flex items-center gap-2 text-xs text-zinc-500 dark:text-zinc-400" aria-live="polite">
                  {checking ? (
                    <>
                      <Spinner /> Checking for duplicates…
                    </>
                  ) : (
                    [
                      `${counts.ok ?? 0} to import`,
                      counts.duplicate ? `${counts.duplicate} already exist` : null,
                      counts.skipped ? `${counts.skipped} skipped` : null,
                      counts.invalid ? `${counts.invalid} unreadable` : null,
                    ]
                      .filter(Boolean)
                      .join(" · ")
                  )}
                </span>
              }
            >
              <div className="max-h-[28rem] overflow-auto rounded-lg border border-zinc-200 dark:border-zinc-800">
                <table className="w-full min-w-[40rem] text-left text-sm">
                  <thead className="sticky top-0 z-10 bg-zinc-50 text-xs text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400">
                    <tr>
                      <th scope="col" className="px-3 py-2 font-medium">Status</th>
                      <th scope="col" className="px-3 py-2 font-medium">Date</th>
                      <th scope="col" className="px-3 py-2 font-medium">Description</th>
                      <th scope="col" className="px-3 py-2 font-medium">Category</th>
                      <th scope="col" className="px-3 py-2 text-right font-medium">Amount</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                    {processed.slice(0, PREVIEW_ROWS).map((p, i) => (
                      <tr key={i} className={p.status === "ok" ? "" : "text-zinc-400 dark:text-zinc-500"}>
                        <td className="px-3 py-2 text-xs whitespace-nowrap">
                          <StatusBadge status={p.status} reason={p.reason} />
                        </td>
                        <td className="px-3 py-2 tabular-nums whitespace-nowrap">{p.row?.date ?? (body[i][mapping.date!] || "—")}</td>
                        <td className="max-w-64 truncate px-3 py-2">{p.row?.description ?? body[i][mapping.description!] ?? "—"}</td>
                        <td className="px-3 py-1.5">
                          {p.row ? (
                            <select
                              aria-label={`Category for ${p.row.description}`}
                              value={p.row.categoryId ?? ""}
                              onChange={(e) => setOverrides((o) => ({ ...o, [i]: e.target.value }))}
                              className="rounded-md border border-zinc-200 bg-transparent px-1.5 py-1 text-xs dark:border-zinc-700"
                            >
                              <option value="">Uncategorized</option>
                              {ui.categories.map((c) => (
                                <option key={c.id} value={c.id}>
                                  {c.name}
                                </option>
                              ))}
                            </select>
                          ) : null}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums whitespace-nowrap">
                          {p.row ? formatMoney(p.row.amount, ui.currency) : (body[i][mapping.amount!] ?? "—")}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {processed.length > PREVIEW_ROWS ? (
                <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">
                  Showing the first {PREVIEW_ROWS} of {processed.length} rows. All rows are imported with the categories shown or suggested.
                </p>
              ) : null}
              {body.length > MAX_IMPORT_ROWS ? (
                <p className="mt-2 text-xs text-critical">Only the first {MAX_IMPORT_ROWS} rows will be imported.</p>
              ) : null}

              <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
                <p className="text-sm text-zinc-600 dark:text-zinc-400">
                  {toImport.length} {toImport.length === 1 ? "expense" : "expenses"} ·{" "}
                  <span className="font-medium tabular-nums text-zinc-900 dark:text-zinc-100">{formatMoney(importTotal, ui.currency)}</span>
                  {ui.isShared ? " · recorded as paid by you, not split" : ""}
                </p>
                <button type="button" onClick={handleImport} disabled={importing || checking || toImport.length === 0} className={buttonStyles.primary}>
                  {importing ? <Spinner /> : null}
                  Import {toImport.length} {toImport.length === 1 ? "expense" : "expenses"}
                </button>
              </div>
            </Card>
          ) : (
            <p className="text-sm text-zinc-500 dark:text-zinc-400">Choose the Date, Description and Amount columns to see a preview.</p>
          )}
        </>
      ) : null}
    </div>
  );
}

function StatusBadge({ status, reason }: { status: Status; reason?: string }) {
  const styles: Record<Status, string> = {
    ok: "bg-emerald-50 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300",
    duplicate: "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300",
    skipped: "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300",
    invalid: "bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-300",
  };
  const label = { ok: "New", duplicate: "Already exists", skipped: reason ?? "Skipped", invalid: reason ?? "Unreadable" }[status];
  return <span className={`rounded-full px-2 py-0.5 font-medium ${styles[status]}`}>{label}</span>;
}
