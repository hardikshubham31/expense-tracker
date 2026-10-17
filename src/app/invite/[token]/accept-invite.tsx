"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { FormAlert, Spinner } from "@/components/auth/ui";
import { buttonStyles } from "@/components/ui";
import { acceptInvite } from "@/app/dashboard/actions/ledger";

export function AcceptInvite({ token }: { token: string }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="space-y-3">
      {error ? <FormAlert>{error}</FormAlert> : null}
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            // Success redirects into the household
            const res = await acceptInvite(token);
            if (!res.ok) setError(res.error ?? "Couldn't accept the invite.");
          })
        }
        className={`${buttonStyles.primary} w-full py-2.5`}
      >
        {pending ? <Spinner /> : null}
        Accept and join
      </button>
      <Link href="/dashboard" className="block text-sm text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200">
        Not now
      </Link>
    </div>
  );
}
