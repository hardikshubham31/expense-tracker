"use client";

import { useState, useTransition, type FormEvent } from "react";
import { Dialog } from "@/components/dialog";
import { Menu, menuItemClass } from "@/components/menu";
import { Field, TextInput } from "@/components/auth/field";
import { FormAlert, Spinner } from "@/components/auth/ui";
import { buttonStyles, selectClass } from "@/components/ui";
import { CURRENCIES } from "@/lib/money";
import type { ActionResult } from "@/lib/action-utils";
import { createHousehold, switchLedger } from "../actions/ledger";

type LedgerItem = { id: string; name: string; kind: "PERSONAL" | "SHARED" };

function LedgerIcon({ kind }: { kind: LedgerItem["kind"] }) {
  return kind === "SHARED" ? (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M22 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8" />
      <circle cx="9" cy="7" r="4" />
    </svg>
  ) : (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21a8 8 0 0 1 16 0" />
    </svg>
  );
}

export function LedgerSwitcher({ current, ledgers, currency }: { current: LedgerItem; ledgers: LedgerItem[]; currency: string }) {
  const [creating, setCreating] = useState(false);
  const [pending, startTransition] = useTransition();

  return (
    <>
      <Menu
        label={`Ledger: ${current.name}. Switch ledger`}
        triggerClassName="inline-flex max-w-52 items-center gap-2 rounded-lg border border-zinc-200 px-2.5 py-1.5 text-sm font-medium text-zinc-800 hover:bg-zinc-50 focus-visible:outline-2 focus-visible:outline-emerald-600 dark:border-zinc-700 dark:text-zinc-100 dark:hover:bg-zinc-800"
        trigger={
          <>
            <LedgerIcon kind={current.kind} />
            <span className="truncate">{current.name}</span>
            {pending ? (
              <Spinner />
            ) : (
              <svg aria-hidden="true" viewBox="0 0 24 24" className="size-4 text-zinc-400" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <path d="m7 10 5 5 5-5" />
              </svg>
            )}
          </>
        }
      >
        {(close) => (
          <div className="space-y-1">
            <p className="px-2.5 pt-1 pb-1.5 text-xs font-medium text-zinc-500 dark:text-zinc-400">Ledgers</p>
            {ledgers.map((l) => (
              <button
                key={l.id}
                type="button"
                aria-current={l.id === current.id ? "true" : undefined}
                onClick={() => {
                  close();
                  if (l.id !== current.id) startTransition(() => switchLedger(l.id));
                }}
                className={menuItemClass}
              >
                <LedgerIcon kind={l.kind} />
                <span className="flex-1 truncate">{l.name}</span>
                {l.id === current.id ? (
                  <svg aria-hidden="true" viewBox="0 0 24 24" className="size-4 text-emerald-600" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M20 6 9 17l-5-5" />
                  </svg>
                ) : null}
              </button>
            ))}
            <div className="my-1 h-px bg-zinc-100 dark:bg-zinc-800" />
            <button
              type="button"
              onClick={() => {
                close();
                setCreating(true);
              }}
              className={menuItemClass}
            >
              <svg aria-hidden="true" viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round">
                <path d="M12 5v14M5 12h14" />
              </svg>
              New household…
            </button>
          </div>
        )}
      </Menu>

      <Dialog
        open={creating}
        onClose={() => setCreating(false)}
        title="New household"
        description="Share expenses with family or roommates. You can invite people next."
      >
        <HouseholdForm defaultCurrency={currency} onCancel={() => setCreating(false)} />
      </Dialog>
    </>
  );
}

function HouseholdForm({ defaultCurrency, onCancel }: { defaultCurrency: string; onCancel: () => void }) {
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<ActionResult | null>(null);
  const errors = result && !result.ok ? (result.fieldErrors ?? {}) : {};

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    // Success redirects to the new household's settings
    startTransition(async () => setResult(await createHousehold(data)));
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-4">
      {result && !result.ok && result.error ? <FormAlert>{result.error}</FormAlert> : null}
      <Field id="household-name" label="Name" error={errors.name}>
        {(a11y) => <TextInput {...a11y} name="name" placeholder="e.g. Home, Flat 4B" maxLength={60} autoFocus required />}
      </Field>
      <Field id="household-currency" label="Currency" error={errors.currency}>
        {(a11y) => (
          <select {...a11y} name="currency" defaultValue={defaultCurrency} className={selectClass}>
            {CURRENCIES.map((c) => (
              <option key={c.code} value={c.code}>
                {c.code} · {c.label}
              </option>
            ))}
          </select>
        )}
      </Field>
      <div className="flex justify-end gap-2 pt-2">
        <button type="button" onClick={onCancel} className={buttonStyles.secondary}>
          Cancel
        </button>
        <button type="submit" disabled={pending} aria-busy={pending} className={buttonStyles.primary}>
          {pending ? <Spinner /> : null}
          Create household
        </button>
      </div>
    </form>
  );
}
