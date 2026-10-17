import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Card, PageHeader, Skeleton } from "@/components/ui";
import { getBalances } from "@/lib/data";
import { requireLedger } from "@/lib/session";
import { formatDay } from "@/lib/dates";
import { formatMoney } from "@/lib/money";
import { DeleteSettlementButton, RecordPaymentButton } from "./settle-up";

export const metadata: Metadata = { title: "Balances" };

export default function BalancesPage() {
  return (
    <Suspense fallback={<Skeleton className="h-96" />}>
      <Balances />
    </Suspense>
  );
}

async function Balances() {
  const ctx = await requireLedger();
  if (!ctx.isShared) {
    return (
      <div className="space-y-6">
        <PageHeader title="Balances" />
        <Card>
          <p className="py-8 text-center text-sm text-zinc-600 dark:text-zinc-400">
            Balances are for shared households. Use the ledger menu at the top to create one, or{" "}
            <Link href="/dashboard" className="font-medium text-emerald-700 hover:underline dark:text-emerald-400">
              go to your overview
            </Link>
            .
          </p>
        </Card>
      </div>
    );
  }

  const { net, transfers, settlements, currency } = await getBalances();
  const name = (id: string) => ctx.allMembers.find((m) => m.id === id)?.name ?? "Former member";
  const you = (id: string) => (id === ctx.member.id ? "You" : name(id));
  const max = Math.max(1, ...[...net.values()].map(Math.abs));

  return (
    <div className="space-y-6">
      <PageHeader
        title="Balances"
        description="Who owes whom in this household, from shared expenses and recorded payments."
        actions={<RecordPaymentButton />}
      />

      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Everyone's balance">
          <ul className="space-y-4">
            {ctx.members.map((m) => {
              const v = net.get(m.id) ?? 0;
              return (
                <li key={m.id} className="space-y-1.5">
                  <div className="flex items-center justify-between gap-3 text-sm">
                    <span className="font-medium text-zinc-800 dark:text-zinc-200">
                      {m.name}
                      {m.id === ctx.member.id ? <span className="font-normal text-zinc-500"> (you)</span> : null}
                    </span>
                    <span className={`tabular-nums ${v > 0 ? "text-good" : v < 0 ? "text-critical" : "text-zinc-500 dark:text-zinc-400"}`}>
                      {v === 0 ? "Settled up" : v > 0 ? `gets back ${formatMoney(v, currency)}` : `owes ${formatMoney(-v, currency)}`}
                    </span>
                  </div>
                  {/* Diverging bar from a center baseline: right = owed money, left = owes */}
                  <div className="relative h-2 rounded-full bg-zinc-100 dark:bg-zinc-800" aria-hidden="true">
                    <div className="absolute inset-y-0 left-1/2 w-px bg-zinc-300 dark:bg-zinc-600" />
                    {v !== 0 ? (
                      <div
                        className={`absolute inset-y-0 ${v > 0 ? "left-1/2 rounded-r-full" : "right-1/2 rounded-l-full"}`}
                        style={{ width: `${(Math.abs(v) / max) * 50}%`, backgroundColor: v > 0 ? "var(--series-blue)" : "var(--series-red)" }}
                      />
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ul>
        </Card>

        <Card title="Suggested payments">
          {transfers.length ? (
            <ul className="divide-y divide-zinc-100 dark:divide-zinc-800">
              {transfers.map((t) => (
                <li key={`${t.from}-${t.to}`} className="flex flex-wrap items-center justify-between gap-3 py-3">
                  <span className="text-sm text-zinc-800 dark:text-zinc-200">
                    <strong className="font-semibold">{you(t.from)}</strong> {t.from === ctx.member.id ? "pay" : "pays"}{" "}
                    <strong className="font-semibold">{t.to === ctx.member.id ? "you" : name(t.to)}</strong>
                  </span>
                  <span className="flex items-center gap-3">
                    <span className="text-sm font-semibold tabular-nums text-zinc-900 dark:text-zinc-50">{formatMoney(t.amount, currency)}</span>
                    <RecordPaymentButton preset={{ from: t.from, to: t.to, amount: t.amount }} compact />
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="py-6 text-center text-sm text-zinc-500 dark:text-zinc-400">Everyone is settled up. 🎉</p>
          )}
          <p className="mt-4 text-xs text-zinc-500 dark:text-zinc-400">The fewest payments that settle everyone up.</p>
        </Card>
      </div>

      <Card title="Payment history">
        {settlements.length ? (
          <ul className="divide-y divide-zinc-100 dark:divide-zinc-800">
            {settlements.map((s) => (
              <li key={s.id} className="flex items-center justify-between gap-3 py-3 text-sm">
                <span className="min-w-0">
                  <span className="block text-zinc-800 dark:text-zinc-200">
                    {you(s.fromMemberId)} paid {s.toMemberId === ctx.member.id ? "you" : name(s.toMemberId)}
                  </span>
                  <span className="block truncate text-xs text-zinc-500 dark:text-zinc-400">
                    {[formatDay(s.date, { day: "numeric", month: "short", year: "numeric" }), s.note].filter(Boolean).join(" · ")}
                  </span>
                </span>
                <span className="flex items-center gap-2">
                  <span className="font-semibold tabular-nums text-zinc-900 dark:text-zinc-50">{formatMoney(s.amount, currency)}</span>
                  <DeleteSettlementButton id={s.id} />
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="py-6 text-center text-sm text-zinc-500 dark:text-zinc-400">No payments recorded yet.</p>
        )}
      </Card>
    </div>
  );
}
