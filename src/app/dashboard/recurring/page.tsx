import type { Metadata } from "next";
import { Suspense } from "react";
import { Card, PageHeader, Skeleton } from "@/components/ui";
import { getRecurringRules } from "@/lib/data";
import { requireLedger } from "@/lib/session";
import { formatMoney } from "@/lib/money";
import { NewRecurringButton, RecurringList } from "./recurring-manager";

export const metadata: Metadata = { title: "Recurring" };

export default function RecurringPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Recurring"
        description="Rent, subscriptions, EMIs, salary. Entries are added automatically on each due date."
        actions={<NewRecurringButton />}
      />
      <Suspense fallback={<Skeleton className="h-80" />}>
        <Rules />
      </Suspense>
    </div>
  );
}

const MONTHLY_FACTOR = { WEEKLY: 52 / 12, MONTHLY: 1, YEARLY: 1 / 12 } as const;

async function Rules() {
  const [rules, { ledger }] = await Promise.all([getRecurringRules(), requireLedger()]);
  const monthly = (type: "EXPENSE" | "INCOME") =>
    Math.round(rules.filter((r) => r.active && r.type === type).reduce((s, r) => s + r.amount * MONTHLY_FACTOR[r.frequency], 0));

  return (
    <>
      {rules.length ? (
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          About <strong className="font-semibold text-zinc-900 dark:text-zinc-100">{formatMoney(monthly("EXPENSE"), ledger.currency)}</strong> a month
          in recurring expenses
          {monthly("INCOME") ? (
            <>
              {" "}
              and <strong className="font-semibold text-good">{formatMoney(monthly("INCOME"), ledger.currency)}</strong> in recurring income
            </>
          ) : null}
          .
        </p>
      ) : null}
      <Card>
        {rules.length ? (
          <RecurringList rules={rules} />
        ) : (
          <div className="py-12 text-center">
            <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">No recurring entries yet</p>
            <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">Add rent or a subscription once and it fills itself in every month.</p>
          </div>
        )}
      </Card>
    </>
  );
}
