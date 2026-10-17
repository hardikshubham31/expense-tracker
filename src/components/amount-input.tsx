import type { ComponentProps } from "react";
import { TextInput } from "@/components/auth/field";

/** Text input with the currency symbol drawn inside on the left (₹, $, CHF...). */
export function AmountInput({ symbol, ...props }: ComponentProps<"input"> & { symbol: string }) {
  return (
    <div className="relative">
      <span aria-hidden="true" className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-sm text-zinc-500 dark:text-zinc-400">
        {symbol}
      </span>
      <TextInput
        inputMode="decimal"
        autoComplete="off"
        {...props}
        className="tabular-nums"
        style={{ paddingLeft: `${1.25 + symbol.length * 0.6}rem` }}
      />
    </div>
  );
}
