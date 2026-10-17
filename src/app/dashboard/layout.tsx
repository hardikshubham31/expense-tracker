import Link from "next/link";
import { Suspense } from "react";
import { Logo } from "@/components/logo";
import { Skeleton } from "@/components/ui";
import { getCategories, getDescriptionHints } from "@/lib/data";
import { requireLedger } from "@/lib/session";
import { DashboardNav } from "./_components/nav";
import { LedgerProvider } from "./_components/ledger-context";
import { LedgerSwitcher } from "./_components/ledger-switcher";
import { UserMenu } from "./_components/user-menu";

export default function DashboardLayout({ children }: LayoutProps<"/dashboard">) {
  return (
    <div className="min-h-dvh bg-zinc-50 dark:bg-zinc-950">
      <header className="border-b border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <div className="flex h-16 items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3">
              <Link href="/dashboard" className="shrink-0 rounded-md text-zinc-900 dark:text-zinc-50" aria-label="Expense Tracker overview">
                <Logo textClassName="hidden sm:inline" />
              </Link>
              <Suspense fallback={<Skeleton className="h-8 w-32" />}>
                <HeaderSwitcher />
              </Suspense>
            </div>
            <Suspense fallback={<Skeleton className="size-9 rounded-full" />}>
              <HeaderUser />
            </Suspense>
          </div>
          <Suspense fallback={<DashboardNav shared={false} />}>
            <HeaderNav />
          </Suspense>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
        <Suspense fallback={<Skeleton className="h-96" />}>
          <LedgerData>{children}</LedgerData>
        </Suspense>
      </main>
    </div>
  );
}

async function HeaderSwitcher() {
  const { ledger, ledgers } = await requireLedger();
  return <LedgerSwitcher current={{ id: ledger.id, name: ledger.name, kind: ledger.kind }} ledgers={ledgers} currency={ledger.currency} />;
}

async function HeaderUser() {
  const { user } = await requireLedger();
  return <UserMenu name={user.name} email={user.email} hasTimezone={Boolean(user.timezone)} />;
}

async function HeaderNav() {
  const { isShared } = await requireLedger();
  return <DashboardNav shared={isShared} />;
}

/** Ledger data every client component on the dashboard can read (and the N quick-add dialog). */
async function LedgerData({ children }: { children: React.ReactNode }) {
  const [ctx, categories, hints] = await Promise.all([requireLedger(), getCategories(), getDescriptionHints()]);
  return (
    <LedgerProvider
      value={{
        ledgerId: ctx.ledger.id,
        currency: ctx.ledger.currency,
        isShared: ctx.isShared,
        meId: ctx.member.id,
        members: ctx.members.map((m) => ({ id: m.id, name: m.name })),
        memberNames: Object.fromEntries(ctx.allMembers.map((m) => [m.id, m.name])),
        categories,
        hints,
      }}
    >
      {children}
    </LedgerProvider>
  );
}
