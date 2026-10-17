import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Logo } from "@/components/logo";
import { Skeleton } from "@/components/ui";
import { apiGetOrNull } from "@/lib/api";
import { requireUser } from "@/lib/session";
import { AcceptInvite } from "./accept-invite";

export const metadata: Metadata = { title: "Join household" };

export default function InvitePage({ params }: PageProps<"/invite/[token]">) {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center bg-zinc-50 px-4 py-10 dark:bg-zinc-950">
      <Link href="/dashboard" className="mb-8 rounded-md text-zinc-900 dark:text-zinc-50">
        <Logo />
      </Link>
      <div className="w-full max-w-md rounded-2xl border border-zinc-200 bg-white p-8 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
        <Suspense fallback={<Skeleton className="h-40" />}>
          <Invite params={params} />
        </Suspense>
      </div>
    </main>
  );
}

async function Invite({ params }: Pick<PageProps<"/invite/[token]">, "params">) {
  const { token } = await params;
  const [user, invite] = await Promise.all([
    requireUser(),
    apiGetOrNull<{ email: string; ledgerName: string; members: number; invitedBy: string }>(`/api/invites/${encodeURIComponent(token)}`),
  ]);

  // The API answers 404 for unknown, used and expired invites alike
  if (!invite) {
    return (
      <div className="space-y-3 text-center">
        <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-50">This invite has expired</h1>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">Ask the person who invited you to send a new one.</p>
        <Link href="/dashboard" className="inline-block text-sm font-medium text-emerald-700 hover:underline dark:text-emerald-400">
          Go to your dashboard
        </Link>
      </div>
    );
  }

  const wrongAccount = invite.email.toLowerCase() !== user.email.toLowerCase();
  const others = invite.members;

  return (
    <div className="space-y-5 text-center">
      <div className="space-y-2">
        <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-50">Join {invite.ledgerName}</h1>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          {invite.invitedBy} invited you to share expenses with {others} {others === 1 ? "person" : "people"}.
        </p>
      </div>
      {wrongAccount ? (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-200">
          This invite is for <strong>{invite.email}</strong>, but you&apos;re signed in as <strong>{user.email}</strong>. Sign in with the invited email to accept.
        </p>
      ) : (
        <AcceptInvite token={token} />
      )}
    </div>
  );
}
