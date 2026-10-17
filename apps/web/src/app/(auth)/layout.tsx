import Link from "next/link";
import { Logo } from "@/components/logo";

export default function AuthLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="grid min-h-dvh lg:grid-cols-[1fr_1.1fr]">
      <BrandPanel />
      <main className="flex flex-col px-4 py-8 sm:px-8">
        <Link href="/login" className="self-start rounded-md lg:hidden" aria-label="Expense Tracker home">
          <Logo className="text-zinc-900 dark:text-zinc-50" />
        </Link>
        <div className="flex flex-1 items-center justify-center py-10">
          <div className="w-full max-w-sm">{children}</div>
        </div>
      </main>
    </div>
  );
}

const BARS = [
  { label: "Groceries", pct: 72, amount: "412.80" },
  { label: "Transport", pct: 45, amount: "186.20" },
  { label: "Dining out", pct: 58, amount: "240.50" },
  { label: "Utilities", pct: 30, amount: "128.00" },
];

function BrandPanel() {
  return (
    <aside className="relative hidden overflow-hidden bg-emerald-950 p-12 text-emerald-50 lg:flex lg:flex-col lg:justify-between">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -top-40 -right-40 size-[28rem] rounded-full bg-emerald-500/20 blur-3xl"
      />
      <Logo className="relative text-lg" />

      <div className="relative max-w-md space-y-8">
        <div className="space-y-3">
          <h2 className="text-4xl font-semibold leading-tight tracking-tight text-balance">
            Know exactly where your money goes.
          </h2>
          <p className="text-emerald-200/80 text-pretty">
            Log expenses in seconds, set monthly budgets, and spot spending trends before they become problems.
          </p>
        </div>

        {/* Illustrative preview only */}
        <div aria-hidden="true" className="rounded-2xl border border-white/10 bg-white/5 p-5 backdrop-blur">
          <div className="flex items-baseline justify-between">
            <span className="text-sm text-emerald-200/70">Spent this month</span>
            <span className="font-mono text-2xl font-semibold tabular-nums">967.50</span>
          </div>
          <ul className="mt-5 space-y-3.5">
            {BARS.map((bar) => (
              <li key={bar.label} className="space-y-1.5">
                <div className="flex justify-between text-xs">
                  <span className="text-emerald-100/90">{bar.label}</span>
                  <span className="font-mono tabular-nums text-emerald-200/70">{bar.amount}</span>
                </div>
                <div className="h-1.5 rounded-full bg-white/10">
                  <div className="h-full rounded-full bg-emerald-400" style={{ width: `${bar.pct}%` }} />
                </div>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <p className="relative text-sm text-emerald-200/60">Your data stays yours. Sessions are encrypted and expire automatically.</p>
    </aside>
  );
}
