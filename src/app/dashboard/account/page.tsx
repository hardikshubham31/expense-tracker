import type { Metadata } from "next";
import { Suspense } from "react";
import { Card, PageHeader, Skeleton } from "@/components/ui";
import { ThemeToggle } from "@/components/theme";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { normalizeTimeZone, timeZoneOptions, todayIn } from "@/lib/dates";
import { AccountForm, DeleteAccount, PasswordSection } from "./account-forms";

export const metadata: Metadata = { title: "Account" };

export default function AccountPage() {
  return (
    <div className="max-w-2xl space-y-6">
      <PageHeader title="Account" description="Your profile, preferences and data. These apply across all your ledgers." />
      <Suspense fallback={<Skeleton className="h-96" />}>
        <Account />
      </Suspense>
    </div>
  );
}

async function Account() {
  const user = await requireUser();
  const accounts = await prisma.account.findMany({ where: { userId: user.id }, select: { providerId: true } });
  const hasPassword = accounts.some((a) => a.providerId === "credential");
  const providers = accounts.filter((a) => a.providerId !== "credential").map((a) => a.providerId);

  return (
    <>
      <Card title="Profile">
        <AccountForm
          name={user.name}
          email={user.email}
          timezone={normalizeTimeZone(todayIn(user.timezone).timeZone)}
          budgetAlerts={user.budgetAlerts}
          timezones={timeZoneOptions()}
        />
      </Card>

      <Card title="Appearance">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-zinc-600 dark:text-zinc-400">Theme for this browser.</p>
          <ThemeToggle />
        </div>
      </Card>

      <Card title="Password">
        <PasswordSection hasPassword={hasPassword} providers={providers} email={user.email} />
      </Card>

      <Card title="Your data">
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          Download everything in your ledgers (expenses, income, categories, recurring rules and settlements) as JSON.
        </p>
        <a
          href="/api/account/export"
          download
          className="mt-3 inline-flex items-center gap-2 rounded-lg border border-zinc-300 px-3.5 py-2 text-sm font-medium text-zinc-800 hover:bg-zinc-50 focus-visible:outline-2 focus-visible:outline-emerald-600 dark:border-zinc-700 dark:text-zinc-100 dark:hover:bg-zinc-800"
        >
          Download my data
        </a>
      </Card>

      <Card title="Delete account">
        <DeleteAccount email={user.email} hasPassword={hasPassword} />
      </Card>
    </>
  );
}
