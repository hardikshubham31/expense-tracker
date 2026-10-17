"use client";

import { useState, type KeyboardEvent } from "react";
import { formatMoney } from "@/lib/money";

/** Vertical tooltip position for a mark whose top is at `pct`% of the plot height. */
export function tooltipY(pct: number) {
  return pct > 60 ? { top: `calc(${100 - pct}% + 10px)` } : { bottom: `calc(${pct}% + 10px)` };
}

/** Round up to 1 / 2 / 2.5 / 5 × 10^n so ticks land on clean numbers. */
function niceCeil(value: number) {
  if (value <= 0) return 1;
  const exp = 10 ** Math.floor(Math.log10(value));
  for (const step of [1, 2, 2.5, 5, 10]) if (value <= step * exp) return step * exp;
  return 10 * exp;
}

export function DailyChart({
  byDay,
  currency,
  year,
  month,
}: {
  byDay: number[]; // hundredths per day, index 0 = day 1
  currency: string;
  year: number;
  month: number;
}) {
  const [active, setActive] = useState<number | null>(null);

  const maxMajor = niceCeil(Math.max(...byDay) / 100);
  const max = maxMajor * 100;
  const ticks = [max, max / 2, 0];
  const n = byDay.length;
  const labelEvery = new Set([1, 5, 10, 15, 20, 25, n]);

  const dayLabel = (i: number) =>
    new Date(Date.UTC(year, month - 1, i + 1)).toLocaleDateString("en", {
      weekday: "short",
      day: "numeric",
      month: "short",
      timeZone: "UTC",
    });

  function onKeyDown(e: KeyboardEvent) {
    const keys: Record<string, (i: number) => number> = {
      ArrowRight: (i) => Math.min(n - 1, i + 1),
      ArrowLeft: (i) => Math.max(0, i - 1),
      Home: () => 0,
      End: () => n - 1,
    };
    const move = keys[e.key];
    if (!move) return;
    e.preventDefault();
    setActive((i) => move(i ?? 0));
  }

  return (
    <div>
      <div className="flex gap-2">
        {/* Y axis */}
        <div className="relative h-44 w-12 shrink-0 text-right text-[11px] tabular-nums text-zinc-500 dark:text-zinc-400" aria-hidden="true">
          {ticks.map((t, i) => (
            <span key={t} className="absolute right-0 -translate-y-1/2" style={{ top: `${(i / 2) * 100}%` }}>
              {formatMoney(t, currency, { compact: true })}
            </span>
          ))}
        </div>

        <div className="relative min-w-0 flex-1">
          {/* Gridlines: hairline, solid, recessive */}
          {ticks.map((t, i) => (
            <div
              key={t}
              aria-hidden="true"
              className={`absolute inset-x-0 h-px ${i === 2 ? "bg-zinc-300 dark:bg-zinc-700" : "bg-zinc-100 dark:bg-zinc-800"}`}
              style={{ top: `${(i / 2) * 100}%` }}
            />
          ))}

          {/* Columns */}
          <div
            role="group"
            tabIndex={0}
            aria-label="Daily spending. Use left and right arrow keys to read each day."
            onKeyDown={onKeyDown}
            onFocus={() => setActive((i) => i ?? Math.max(0, byDay.findLastIndex((v) => v > 0)))}
            onBlur={() => setActive(null)}
            onPointerLeave={() => setActive(null)}
            className="relative flex h-44 items-end rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/50 focus-visible:ring-offset-4 dark:focus-visible:ring-offset-zinc-900"
          >
            {byDay.map((value, i) => {
              const pct = value > 0 ? Math.max((value / max) * 100, 1.5) : 0;
              const isActive = active === i;
              return (
                <div
                  key={i}
                  onPointerEnter={() => setActive(i)}
                  className="flex h-full flex-1 items-end justify-center px-px"
                >
                  <div
                    className="w-full max-w-6 rounded-t-[4px] transition-[filter,opacity]"
                    style={{
                      height: `${pct}%`,
                      backgroundColor: "var(--series-blue)",
                      filter: isActive ? "brightness(1.15)" : undefined,
                      opacity: active !== null && !isActive ? 0.55 : 1,
                    }}
                  />
                </div>
              );
            })}

            {active !== null ? (
              <div
                role="status"
                className="pointer-events-none absolute z-10 whitespace-nowrap rounded-lg border border-zinc-200 bg-white px-2.5 py-1.5 text-xs shadow-md dark:border-zinc-700 dark:bg-zinc-800"
                style={{
                  // Just above the column, or tucked under its top when the column is tall
                  ...tooltipY((byDay[active] / max) * 100),
                  left: `${((active + 0.5) / n) * 100}%`,
                  transform: active < 3 ? "translateX(-15%)" : active > n - 4 ? "translateX(-85%)" : "translateX(-50%)",
                }}
              >
                <div className="font-semibold tabular-nums text-zinc-900 dark:text-zinc-50">{formatMoney(byDay[active], currency)}</div>
                <div className="text-zinc-500 dark:text-zinc-400">{dayLabel(active)}</div>
              </div>
            ) : null}
          </div>

          {/* X axis */}
          <div className="mt-2 flex text-[11px] tabular-nums text-zinc-500 dark:text-zinc-400" aria-hidden="true">
            {byDay.map((_, i) => (
              <span key={i} className="flex-1 text-center">
                {labelEvery.has(i + 1) ? i + 1 : ""}
              </span>
            ))}
          </div>
        </div>
      </div>

      <details className="mt-4 text-sm">
        <summary className="cursor-pointer text-xs font-medium text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200">
          View as table
        </summary>
        <div className="mt-2 max-h-64 overflow-y-auto rounded-lg border border-zinc-200 dark:border-zinc-800">
          <table className="w-full text-left text-xs">
            <thead className="sticky top-0 bg-zinc-50 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400">
              <tr>
                <th scope="col" className="px-3 py-2 font-medium">Day</th>
                <th scope="col" className="px-3 py-2 text-right font-medium">Spent</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
              {byDay.map((v, i) =>
                v > 0 ? (
                  <tr key={i}>
                    <td className="px-3 py-1.5 text-zinc-700 dark:text-zinc-300">{dayLabel(i)}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums text-zinc-900 dark:text-zinc-100">{formatMoney(v, currency)}</td>
                  </tr>
                ) : null,
              )}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
}
