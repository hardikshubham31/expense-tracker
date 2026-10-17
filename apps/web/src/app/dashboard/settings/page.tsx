import type { Metadata } from "next";
import { Suspense } from "react";
import { Card, PageHeader, Skeleton } from "@/components/ui";
import { getLedgerDetails } from "@/lib/data";
import { requireLedger } from "@/lib/session";
import { toAmountInput } from "@expense/shared/money";
import { SettingsForm } from "./settings-form";
import { DangerZone, InviteForm, MemberList } from "./members";

export const metadata: Metadata = { title: "Settings" };

export default function SettingsPage() {
  return (
    <Suspense fallback={<Skeleton className="h-96 max-w-2xl" />}>
      <Settings />
    </Suspense>
  );
}

async function Settings() {
  const [ctx, details] = await Promise.all([requireLedger(), getLedgerDetails()]);
  const { ledger } = details;

  return (
    <div className="max-w-2xl space-y-6">
      <PageHeader
        title={ctx.isShared ? "Household settings" : "Settings"}
        description={ctx.isShared ? `Settings for “${ledger.name}”, shared by everyone in it.` : "Currency and overall budget for your personal ledger."}
      />

      <Card title={ctx.isShared ? "Household" : "Ledger"}>
        <SettingsForm
          name={ledger.name}
          currency={ledger.currency}
          monthlyBudget={ledger.monthlyBudget ? toAmountInput(ledger.monthlyBudget, ledger.currency) : ""}
          shared={ctx.isShared}
          canEdit={ctx.isOwner}
        />
      </Card>

      {ctx.isShared ? (
        <>
          <Card title="Members">
            <MemberList members={details.members} meId={ctx.member.id} isOwner={ctx.isOwner} />
            {ctx.isOwner ? (
              <div className="mt-6 border-t border-zinc-100 pt-5 dark:border-zinc-800">
                <InviteForm invites={details.invites} baseUrl={process.env.BETTER_AUTH_URL ?? "http://localhost:3000"} />
              </div>
            ) : null}
          </Card>
          <Card title="Leave or delete">
            <DangerZone isOwner={ctx.isOwner} name={ledger.name} />
          </Card>
        </>
      ) : (
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          Want to share expenses with someone? Create a household from the ledger menu at the top of the page.
        </p>
      )}
    </div>
  );
}
