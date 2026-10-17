/**
 * Expense dates are calendar dates (Postgres DATE, read back as UTC midnight),
 * so every helper here works in UTC to avoid off-by-one-day bugs.
 * "Today" depends on the user's time zone: see todayIn().
 */

export type Month = { year: number; month: number }; // month is 1-12

const MONTH_PATTERN = /^(\d{4})-(0[1-9]|1[0-2])$/;
const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

export function parseMonth(value: string | undefined | null): Month | null {
  const match = value ? MONTH_PATTERN.exec(value) : null;
  return match ? { year: Number(match[1]), month: Number(match[2]) } : null;
}

export function monthOf(date: Date): Month {
  return { year: date.getUTCFullYear(), month: date.getUTCMonth() + 1 };
}

export function monthKey({ year, month }: Month) {
  return `${year}-${String(month).padStart(2, "0")}`;
}

export function shiftMonth({ year, month }: Month, delta: number): Month {
  const d = new Date(Date.UTC(year, month - 1 + delta, 1));
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1 };
}

export function monthRange({ year, month }: Month) {
  return { gte: new Date(Date.UTC(year, month - 1, 1)), lt: new Date(Date.UTC(year, month, 1)) };
}

export function daysInMonth({ year, month }: Month) {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

export function formatMonth(m: Month, style: "long" | "short" = "long") {
  return new Date(Date.UTC(m.year, m.month - 1, 1)).toLocaleDateString("en", {
    month: style,
    year: "numeric",
    timeZone: "UTC",
  });
}

/** "YYYY-MM-DD" -> UTC midnight Date, or null if it isn't a real calendar date. */
export function parseDateInput(value: string): Date | null {
  const match = DATE_PATTERN.exec(value);
  if (!match) return null;
  return utcDate(Number(match[1]), Number(match[2]), Number(match[3]));
}

/** UTC-midnight Date for y/m/d, or null if that day doesn't exist. */
export function utcDate(y: number, m: number, d: number): Date | null {
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d ? date : null;
}

export function toDateInput(date: Date) {
  return date.toISOString().slice(0, 10);
}

/** Today's calendar date in the browser's time zone, as "YYYY-MM-DD". */
export function todayInput() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

export function isValidTimeZone(tz: string) {
  try {
    new Intl.DateTimeFormat("en", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/** ICU still reports some zones by legacy names; show and store the modern ones. */
const MODERN_ZONE_NAMES: Record<string, string> = {
  "Asia/Calcutta": "Asia/Kolkata",
  "Asia/Katmandu": "Asia/Kathmandu",
  "Asia/Saigon": "Asia/Ho_Chi_Minh",
  "Asia/Rangoon": "Asia/Yangon",
  "Europe/Kiev": "Europe/Kyiv",
  "Atlantic/Faeroe": "Atlantic/Faroe",
  "America/Godthab": "America/Nuuk",
  "Pacific/Truk": "Pacific/Chuuk",
  "Pacific/Ponape": "Pacific/Pohnpei",
  "Pacific/Enderbury": "Pacific/Kanton",
};

export function normalizeTimeZone(tz: string) {
  return MODERN_ZONE_NAMES[tz] ?? tz;
}

/** Sorted list for a time zone picker: modern names, plus UTC. */
export function timeZoneOptions() {
  const zones = new Set(Intl.supportedValuesOf("timeZone").map(normalizeTimeZone));
  zones.add("UTC");
  return [...zones].sort();
}

/** Today's calendar date in an IANA time zone (falls back to UTC). */
export function todayIn(timeZone: string | null | undefined, now = new Date()) {
  const tz = timeZone && isValidTimeZone(timeZone) ? timeZone : "UTC";
  const input = new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
  const date = parseDateInput(input)!;
  return { input, date, month: monthOf(date), timeZone: tz };
}

export function addDays(date: Date, days: number) {
  return new Date(date.getTime() + days * 86_400_000);
}

/** Same day-of-month `months` later, clamped to the month's length (Jan 31 -> Feb 28). */
export function addMonthsClamped(date: Date, months: number, anchorDay = date.getUTCDate()) {
  const target = shiftMonth(monthOf(date), months);
  return new Date(Date.UTC(target.year, target.month - 1, Math.min(anchorDay, daysInMonth(target))));
}

export function formatDay(date: Date, opts: Intl.DateTimeFormatOptions = { weekday: "short", day: "numeric", month: "short" }) {
  return date.toLocaleDateString("en", { ...opts, timeZone: "UTC" });
}
