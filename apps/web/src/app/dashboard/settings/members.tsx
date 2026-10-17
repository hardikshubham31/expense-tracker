"use client";

import { useState, useTransition, type FormEvent } from "react";
import { Field, TextInput } from "@/components/auth/field";
import { FormAlert, Spinner } from "@/components/auth/ui";
import { buttonStyles } from "@/components/ui";
import type { ActionResult } from "@/lib/action-utils";
import { deleteLedger, inviteMember, leaveLedger, removeMember, revokeInvite } from "../actions/ledger";

type Member = { id: string; name: string; role: "OWNER" | "MEMBER"; leftAt: Date | null };
type Invite = { id: string; email: string; expiresAt: Date; url: string };

export function MemberList({ members, meId, isOwner }: { members: Member[]; meId: string; isOwner: boolean }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);

  return (
    <div className="space-y-3">
      {error ? <FormAlert>{error}</FormAlert> : null}
      <ul className="divide-y divide-zinc-100 dark:divide-zinc-800">
        {members
          .filter((m) => !m.leftAt)
          .map((m) => (
            <li key={m.id} className="flex items-center justify-between gap-3 py-3">
              <span className="flex items-center gap-3">
                <span aria-hidden="true" className="grid size-8 place-items-center rounded-full bg-zinc-100 text-xs font-semibold text-zinc-700 dark:bg-zinc-800 dark:text-zinc-200">
                  {m.name[0]?.toUpperCase()}
                </span>
                <span className="text-sm">
                  <span className="font-medium text-zinc-900 dark:text-zinc-100">{m.name}</span>
                  {m.id === meId ? <span className="text-zinc-500"> (you)</span> : null}
                  <span className="block text-xs text-zinc-500 dark:text-zinc-400">{m.role === "OWNER" ? "Owner" : "Member"}</span>
                </span>
              </span>
              {isOwner && m.id !== meId ? (
                confirming === m.id ? (
                  <span className="flex items-center gap-1">
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() =>
                        startTransition(async () => {
                          const res = await removeMember(m.id);
                          setError(res.ok ? null : (res.error ?? "Couldn't remove them."));
                          setConfirming(null);
                        })
                      }
                      className={buttonStyles.danger}
                    >
                      Remove
                    </button>
                    <button type="button" onClick={() => setConfirming(null)} className={buttonStyles.ghost}>
                      Cancel
                    </button>
                  </span>
                ) : (
                  <button type="button" onClick={() => setConfirming(m.id)} className={buttonStyles.ghost}>
                    Remove<span className="sr-only"> {m.name}</span>
                  </button>
                )
              ) : null}
            </li>
          ))}
      </ul>
      {members.some((m) => m.leftAt) ? (
        <p className="text-xs text-zinc-500 dark:text-zinc-400">
          Former members: {members.filter((m) => m.leftAt).map((m) => m.name).join(", ")}. Their past expenses are kept.
        </p>
      ) : null}
    </div>
  );
}

export function InviteForm({ invites }: { invites: Invite[] }) {
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<ActionResult | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const errors = result && !result.ok ? (result.fieldErrors ?? {}) : {};

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    startTransition(async () => {
      const res = await inviteMember(data);
      setResult(res);
      if (res.ok) form.reset();
    });
  }

  async function copy(invite: Invite) {
    await navigator.clipboard.writeText(invite.url);
    setCopied(invite.id);
    setTimeout(() => setCopied(null), 2000);
  }

  return (
    <div className="space-y-4">
      <form onSubmit={handleSubmit} noValidate className="flex flex-wrap items-start gap-2">
        <div className="min-w-56 flex-1">
          <Field id="invite-email" label="Invite someone" hint="Enter their email. They must sign in with it to join." error={errors.email}>
            {(a11y) => <TextInput {...a11y} name="email" type="email" autoComplete="off" placeholder="name@example.com" required />}
          </Field>
        </div>
        <button type="submit" disabled={pending} aria-busy={pending} className={`${buttonStyles.primary} mt-7`}>
          {pending ? <Spinner /> : null}
          Create invite
        </button>
      </form>
      {result?.ok ? <FormAlert tone="success">Invite created. Use “Copy link” below and send it to them.</FormAlert> : null}
      {result && !result.ok && result.error ? <FormAlert>{result.error}</FormAlert> : null}

      {invites.length ? (
        <div>
          <h3 className="mb-1 text-xs font-medium text-zinc-500 dark:text-zinc-400">Pending invites</h3>
          <ul className="divide-y divide-zinc-100 dark:divide-zinc-800">
            {invites.map((i) => (
              <li key={i.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5 text-sm">
                <span className="min-w-0">
                  <span className="block truncate text-zinc-800 dark:text-zinc-200">{i.email}</span>
                  <span className="text-xs text-zinc-500 dark:text-zinc-400">
                    Expires {i.expiresAt.toLocaleDateString("en", { day: "numeric", month: "short" })}
                  </span>
                </span>
                <span className="flex gap-1">
                  <button type="button" onClick={() => copy(i)} className={buttonStyles.ghost}>
                    {copied === i.id ? "Copied!" : "Copy link"}
                  </button>
                  <button type="button" onClick={() => startTransition(async () => void (await revokeInvite(i.id)))} className={buttonStyles.ghost}>
                    Revoke<span className="sr-only"> invite for {i.email}</span>
                  </button>
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

export function DangerZone({ isOwner, name }: { isOwner: boolean; name: string }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<"leave" | "delete" | null>(null);

  const run = (fn: () => Promise<ActionResult>) =>
    startTransition(async () => {
      const res = await fn();
      if (!res.ok) setError(res.error ?? "Something went wrong.");
    });

  return (
    <div className="space-y-3">
      {error ? <FormAlert>{error}</FormAlert> : null}
      {confirm ? (
        <FormAlert>
          <p>
            {confirm === "leave"
              ? `Leave “${name}”? You can only leave once your balance is settled.`
              : `Delete “${name}” and all of its expenses, income and history for everyone? This can't be undone.`}
          </p>
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              disabled={pending}
              onClick={() => run(confirm === "leave" ? leaveLedger : deleteLedger)}
              className="rounded-md bg-[var(--status-critical)] px-3 py-1.5 text-sm font-medium text-white hover:opacity-90"
            >
              {pending ? "Working…" : confirm === "leave" ? "Leave household" : "Delete household"}
            </button>
            <button type="button" onClick={() => setConfirm(null)} className={buttonStyles.ghost}>
              Cancel
            </button>
          </div>
        </FormAlert>
      ) : (
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => setConfirm("leave")} className={buttonStyles.secondary}>
            Leave household
          </button>
          {isOwner ? (
            <button type="button" onClick={() => setConfirm("delete")} className={buttonStyles.danger}>
              Delete household
            </button>
          ) : null}
        </div>
      )}
    </div>
  );
}
