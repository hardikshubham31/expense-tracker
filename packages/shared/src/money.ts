/**
 * Amounts are stored as integers in hundredths of the currency unit for every
 * currency (see prisma/schema.prisma). Only currencies with <= 2 minor digits
 * are offered so that scale is always lossless.
 */

export const CURRENCIES = [
  { code: "INR", label: "Indian rupee" },
  { code: "USD", label: "US dollar" },
  { code: "EUR", label: "Euro" },
  { code: "GBP", label: "British pound" },
  { code: "AED", label: "UAE dirham" },
  { code: "SGD", label: "Singapore dollar" },
  { code: "AUD", label: "Australian dollar" },
  { code: "CAD", label: "Canadian dollar" },
  { code: "CHF", label: "Swiss franc" },
  { code: "CNY", label: "Chinese yuan" },
  { code: "JPY", label: "Japanese yen" },
] as const;

export type CurrencyCode = (typeof CURRENCIES)[number]["code"];

export const CURRENCY_CODES = CURRENCIES.map((c) => c.code) as [CurrencyCode, ...CurrencyCode[]];

export function isCurrency(code: string): code is CurrencyCode {
  return (CURRENCY_CODES as string[]).includes(code);
}

/** Largest single amount we accept, in major units. Keeps sums well inside safe integers. */
export const MAX_AMOUNT = 10_000_000;

const formatters = new Map<string, Intl.NumberFormat>();

function formatter(currency: string, compact: boolean) {
  const key = `${currency}:${compact}`;
  let f = formatters.get(key);
  if (!f) {
    f = new Intl.NumberFormat("en", {
      style: "currency",
      currency,
      ...(compact ? { notation: "compact", maximumFractionDigits: 1 } : {}),
    });
    formatters.set(key, f);
  }
  return f;
}

export function currencyDigits(currency: string) {
  return formatter(currency, false).resolvedOptions().maximumFractionDigits ?? 2;
}

export function formatMoney(hundredths: number, currency: string, opts: { compact?: boolean } = {}) {
  return formatter(currency, Boolean(opts.compact)).format(hundredths / 100);
}

export function currencySymbol(currency: string) {
  return formatter(currency, false).formatToParts(0).find((p) => p.type === "currency")?.value ?? currency;
}

/** Hundredths -> editable string, e.g. 123450 -> "1234.50" (no grouping). */
export function toAmountInput(hundredths: number, currency: string) {
  const digits = currencyDigits(currency);
  return (hundredths / 100).toFixed(digits);
}

/**
 * Parse user input ("1,234.5") into hundredths without floating-point error.
 * Returns null when the input isn't a positive amount valid for the currency.
 */
export function parseAmount(input: string, currency: string): number | null {
  const digits = currencyDigits(currency);
  const cleaned = input.trim().replace(/[,\s_]/g, "");
  const pattern = digits === 0 ? /^\d+$/ : new RegExp(`^(\\d+)(?:\\.(\\d{0,${digits}}))?$`);
  const match = pattern.exec(cleaned);
  if (!match) return null;

  const [whole, fraction = ""] = cleaned.split(".");
  if (Number(whole) > MAX_AMOUNT) return null;
  const value = Number(whole) * 100 + Number(fraction.padEnd(2, "0").slice(0, 2));
  return value > 0 && value <= MAX_AMOUNT * 100 ? value : null;
}
