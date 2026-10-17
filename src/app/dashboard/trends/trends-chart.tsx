"use client";

import { useState, type KeyboardEvent } from "react";
import { formatMoney } from "@/lib/money";
import { formatMonth } from "@/lib/dates";
import { tooltipY } from "../_components/daily-chart";

type Point = { key: string; year: number; month: number; spent: number; income: number };

function niceCeil(value: number) {
  if (value <= 0) return 1;
  const exp = 10 ** Math.floor(Math.log10(value));
  for (const step of [1, 2, 2.5, 5, 10]) if (value <= step * exp) return step * exp;
  return 10 * exp;
}

/**
 * Monthly spending (columns) with income (line) on the same currency axis.
 * One axis only: both series are the same unit. Hover/focus a month for its values.
 */
export function TrendsChart({
  points,
  currency,
  showIncome: wantIncome,
  spentLabel,
}: {
  points: Point[];
  currency: string;
  showIncome: boolean;
  spentLabel: string;
}) {
  const [active, setActive] = useState<number | null>(null);
  // A flat line of zeros is noise: only draw income when there is some.
  const showIncome = wantIncome && points.some((p) => p.income > 0);
  const n = points.length;
  const max = niceCeil(Math.max(...points.map((p) => Math.max(p.spent, showIncome ? p.income : 0))) / 100) * 100;
  const ticks = [max, max / 2, 0];
  const y = (v: number) => 100 - (v / max) * 100;
  const label = (p: Point) => formatMonth(p, "short");

  function onKeyDown(e: KeyboardEvent) {
    const moves: Record<string, (i: number) => number> = {
      ArrowRight: (i) => Math.min(n - 1, i + 1),
      ArrowLeft: (i) => Math.max(0, i - 1),
      Home: () => 0,
      End: () => n - 1,
    };
    if (!moves[e.key]) return;
    e.preventDefault();
    setActive((i) => moves[e.key](i ?? n - 1));
  }

  const linePath = points.map((p, i) => `${i === 0 ? "M" : "L"}${((i + 0.5) / n) * 100},${y(p.income)}`).join(" ");
  const activePoint = active !== null ? points[active] : null;

  return (
    <div>
      {/* Legend: always present for 2 series; mirrors the marks (rect for columns, line for the line) */}
      <div className="mb-4 flex flex-wrap gap-4 text-xs text-zinc-600 dark:text-zinc-400">
        <span className="flex items-center gap-1.5">
          <span aria-hidden="true" className="inline-block h-2.5 w-2.5 rounded-[2px]" style={{ backgroundColor: "var(--series-blue)" }} />
          {spentLabel}
        </span>
        {showIncome ? (
          <span className="flex items-center gap-1.5">
            <span aria-hidden="true" className="inline-block h-0.5 w-4 rounded-full" style={{ backgroundColor: "var(--series-orange)" }} />
            Income
          </span>
        ) : null}
      </div>

      <div className="flex gap-2">
        <div className="relative h-56 w-14 shrink-0 text-right text-[11px] tabular-nums text-zinc-500 dark:text-zinc-400" aria-hidden="true">
          {ticks.map((t, i) => (
            <span key={i} className="absolute right-0 -translate-y-1/2" style={{ top: `${(i / 2) * 100}%` }}>
              {formatMoney(t, currency, { compact: true })}
            </span>
          ))}
        </div>

        <div className="relative min-w-0 flex-1">
          {ticks.map((_, i) => (
            <div
              key={i}
              aria-hidden="true"
              className={`absolute inset-x-0 h-px ${i === 2 ? "bg-zinc-300 dark:bg-zinc-700" : "bg-zinc-100 dark:bg-zinc-800"}`}
              style={{ top: `${(i / 2) * 100}%` }}
            />
          ))}

          <div
            role="group"
            tabIndex={0}
            aria-label="Monthly totals. Use left and right arrow keys to read each month."
            onKeyDown={onKeyDown}
            onFocus={() => setActive((i) => i ?? n - 1)}
            onBlur={() => setActive(null)}
            onPointerLeave={() => setActive(null)}
            className="relative flex h-56 items-end rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/50 focus-visible:ring-offset-4 dark:focus-visible:ring-offset-zinc-900"
          >
            {points.map((p, i) => (
              <div key={p.key} onPointerEnter={() => setActive(i)} className="flex h-full flex-1 items-end justify-center px-0.5">
                <div
                  className="w-full max-w-6 rounded-t-[4px] transition-opacity"
                  style={{
                    height: `${p.spent > 0 ? Math.max((p.spent / max) * 100, 1) : 0}%`,
                    backgroundColor: "var(--series-blue)",
                    opacity: active !== null && active !== i ? 0.5 : 1,
                  }}
                />
              </div>
            ))}

            {showIncome ? (
              <>
                <svg aria-hidden="true" className="pointer-events-none absolute inset-0 h-full w-full overflow-visible" viewBox="0 0 100 100" preserveAspectRatio="none">
                  <path d={linePath} fill="none" stroke="var(--series-orange)" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
                </svg>
                {/* Markers as HTML so they stay round under the stretched viewBox; 2px surface ring */}
                {points.map((p, i) => (
                  <span
                    key={p.key}
                    aria-hidden="true"
                    className="pointer-events-none absolute size-2.5 rounded-full ring-2 ring-white dark:ring-zinc-900"
                    style={{
                      left: `${((i + 0.5) / n) * 100}%`,
                      top: `${y(p.income)}%`,
                      backgroundColor: "var(--series-orange)",
                      transform: `translate(-50%, -50%) scale(${active === i ? 1.3 : 1})`,
                    }}
                  />
                ))}
              </>
            ) : null}

            {activePoint ? (
              <div
                role="status"
                className="pointer-events-none absolute z-10 min-w-36 whitespace-nowrap rounded-lg border border-zinc-200 bg-white px-3 py-2 text-xs shadow-md dark:border-zinc-700 dark:bg-zinc-800"
                style={{
                  ...tooltipY((Math.max(activePoint.spent, showIncome ? activePoint.income : 0) / max) * 100),
                  left: `${((active! + 0.5) / n) * 100}%`,
                  transform: active! < 2 ? "translateX(-15%)" : active! > n - 3 ? "translateX(-85%)" : "translateX(-50%)",
                }}
              >
                <div className="mb-1 text-zinc-500 dark:text-zinc-400">{formatMonth(activePoint)}</div>
                <TooltipRow color="var(--series-blue)" label={spentLabel} value={formatMoney(activePoint.spent, currency)} />
                {showIncome ? (
                  <>
                    <TooltipRow color="var(--series-orange)" label="Income" value={formatMoney(activePoint.income, currency)} />
                    <div className="mt-1 border-t border-zinc-100 pt-1 text-zinc-600 dark:border-zinc-700 dark:text-zinc-300">
                      {activePoint.income - activePoint.spent >= 0 ? "Saved " : "Overspent "}
                      <span className="font-semibold tabular-nums text-zinc-900 dark:text-zinc-50">
                        {formatMoney(Math.abs(activePoint.income - activePoint.spent), currency)}
                      </span>
                    </div>
                  </>
                ) : null}
              </div>
            ) : null}
          </div>

          <div className="mt-2 flex text-[11px] text-zinc-500 dark:text-zinc-400" aria-hidden="true">
            {points.map((p, i) => (
              <span key={p.key} className="flex-1 text-center">
                {/* Every other label on narrow screens */}
                <span className={i % 2 === 1 ? "hidden sm:inline" : ""}>{label(p).split(" ")[0]}</span>
              </span>
            ))}
          </div>
        </div>
      </div>

      <details className="mt-4 text-sm">
        <summary className="cursor-pointer text-xs font-medium text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200">View as table</summary>
        <div className="mt-2 overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-800">
          <table className="w-full text-left text-xs">
            <thead className="bg-zinc-50 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400">
              <tr>
                <th scope="col" className="px-3 py-2 font-medium">Month</th>
                <th scope="col" className="px-3 py-2 text-right font-medium">{spentLabel}</th>
                {showIncome ? (
                  <>
                    <th scope="col" className="px-3 py-2 text-right font-medium">Income</th>
                    <th scope="col" className="px-3 py-2 text-right font-medium">Net</th>
                  </>
                ) : null}
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100 tabular-nums dark:divide-zinc-800">
              {points.map((p) => (
                <tr key={p.key}>
                  <td className="px-3 py-1.5 text-zinc-700 dark:text-zinc-300">{formatMonth(p)}</td>
                  <td className="px-3 py-1.5 text-right">{formatMoney(p.spent, currency)}</td>
                  {showIncome ? (
                    <>
                      <td className="px-3 py-1.5 text-right">{formatMoney(p.income, currency)}</td>
                      <td className={`px-3 py-1.5 text-right ${p.income - p.spent >= 0 ? "text-good" : "text-critical"}`}>
                        {p.income - p.spent < 0 ? "−" : ""}
                        {formatMoney(Math.abs(p.income - p.spent), currency)}
                      </td>
                    </>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
}

function TooltipRow({ color, label, value }: { color: string; label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="flex items-center gap-1.5 text-zinc-500 dark:text-zinc-400">
        <span aria-hidden="true" className="inline-block h-0.5 w-3 rounded-full" style={{ backgroundColor: color }} />
        {label}
      </span>
      <span className="font-semibold tabular-nums text-zinc-900 dark:text-zinc-50">{value}</span>
    </div>
  );
}
