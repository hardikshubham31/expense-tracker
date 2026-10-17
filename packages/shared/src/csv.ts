/** Client-safe CSV helpers for importing bank statements. */

export const MAX_IMPORT_ROWS = 2000;

/** RFC 4180-ish parser: quoted fields, escaped quotes, CRLF, BOM; auto-detects , ; or tab. */
export function parseCSV(input: string): string[][] {
  const text = input.replace(/^﻿/, "");
  const firstLine = text.split(/\r?\n/, 1)[0];
  const delimiter = [",", ";", "\t"].map((d) => [d, firstLine.split(d).length] as const).sort((a, b) => b[1] - a[1])[0][0];

  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"' && field === "") quoted = true;
    else if (c === delimiter) {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      if (row.some((f) => f.trim() !== "")) rows.push(row);
      row = [];
      field = "";
    } else field += c;
  }
  row.push(field);
  if (row.some((f) => f.trim() !== "")) rows.push(row);
  return rows.map((r) => r.map((f) => f.trim()));
}

const MONTHS: Record<string, number> = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };

export const DATE_FORMATS = [
  { id: "ymd", label: "2026-10-31", re: /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/, order: [1, 2, 3] },
  { id: "dmy", label: "31/10/2026", re: /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})$/, order: [3, 2, 1] },
  { id: "mdy", label: "10/31/2026", re: /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})$/, order: [3, 1, 2] },
  { id: "dmon", label: "31 Oct 2026", re: /^(\d{1,2})[\s-]([A-Za-z]{3})[A-Za-z]*[\s-,]*(\d{2,4})$/, order: [3, 2, 1] },
] as const;

export type DateFormatId = (typeof DATE_FORMATS)[number]["id"];

/** "YYYY-MM-DD" or null. Two-digit years are 20xx. */
export function parseImportDate(value: string, format: DateFormatId): string | null {
  const f = DATE_FORMATS.find((x) => x.id === format)!;
  const m = f.re.exec(value.trim().split(/[ T]\d{1,2}:\d{2}/)[0]); // drop a time part
  if (!m) return null;
  const parts = f.order.map((i) => m[i]);
  let year = Number(parts[0]);
  if (year < 100) year += 2000;
  const month = format === "dmon" ? MONTHS[parts[1].toLowerCase()] : Number(parts[1]);
  const day = Number(parts[2]);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (!month || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  return date.toISOString().slice(0, 10);
}

/** The format that reads the most samples; ties go to ISO, then day-first, then month-first. */
export function detectDateFormat(samples: string[]): DateFormatId {
  const values = samples.filter(Boolean).slice(0, 50);
  let best: DateFormatId = "ymd";
  let bestCount = 0;
  for (const f of DATE_FORMATS) {
    const count = values.filter((v) => parseImportDate(v, f.id)).length;
    if (count > bestCount) [best, bestCount] = [f.id, count];
  }
  return best;
}

/**
 * Signed amount in hundredths from strings like "1,234.50", "-45", "(12.00)",
 * "₹ 99", "1.234,56" (comma decimal), "45.00 DR". Returns null if unreadable.
 */
export function parseImportAmount(value: string, decimalComma = false): number | null {
  let s = value.trim();
  if (!s) return null;
  let negative = false;
  if (/^\(.*\)$/.test(s)) {
    negative = true;
    s = s.slice(1, -1);
  }
  if (/\b(dr|debit)\b/i.test(s)) negative = true;
  s = s.replace(/\b(cr|dr|credit|debit)\b/gi, "").replace(/[^\d.,\-+]/g, "");
  if (s.startsWith("-") || s.endsWith("-")) negative = true;
  s = s.replace(/[-+]/g, "");
  if (decimalComma) s = s.replace(/\./g, "").replace(",", ".");
  else s = s.replace(/,/g, "");
  const m = /^(\d+)(?:\.(\d+))?$/.exec(s);
  if (!m) return null;
  const hundredths = Number(m[1]) * 100 + Math.round(Number(`0.${m[2] ?? "0"}`) * 100);
  return negative ? -hundredths : hundredths;
}

/** Comma decimals when values look like "1.234,56" or "12,50". */
export function detectDecimalComma(samples: string[]) {
  const values = samples.filter(Boolean).slice(0, 50);
  const comma = values.filter((v) => /\d,\d{1,2}(\D*)$/.test(v)).length;
  const dot = values.filter((v) => /\d\.\d{1,2}(\D*)$/.test(v)).length;
  return comma > dot;
}
