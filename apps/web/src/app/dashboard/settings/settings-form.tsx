"use client";

import { useState, useTransition, type FormEvent } from "react";
import { AmountInput } from "@/components/amount-input";
import { Field, TextInput } from "@/components/auth/field";
import { FormAlert, Spinner } from "@/components/auth/ui";
import { buttonStyles, selectClass } from "@/components/ui";
import { CURRENCIES, currencySymbol } from "@expense/shared/money";
import type { ActionResult } from "@/lib/action-utils";
import { updateLedgerSettings } from "../actions/ledger";

export function SettingsForm({
  name,
  currency,
  monthlyBudget,
  shared,
  canEdit,
}: {
  name: string;
  currency: string;
  monthlyBudget: string;
  shared: boolean;
  canEdit: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<ActionResult | null>(null);
  const [selected, setSelected] = useState(currency);
  const errors = result && !result.ok ? (result.fieldErrors ?? {}) : {};
  const symbol = currencySymbol(selected);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    startTransition(async () => setResult(await updateLedgerSettings(data)));
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-5">
      {result?.ok ? <FormAlert tone="success">Settings saved.</FormAlert> : null}
      {result && !result.ok && result.error ? <FormAlert>{result.error}</FormAlert> : null}
      {!canEdit ? <p className="text-sm text-zinc-500 dark:text-zinc-400">Only the household owner can change these.</p> : null}

      <fieldset disabled={!canEdit} className="space-y-5 disabled:opacity-70">
        {shared ? (
          <Field id="ledger-name" label="Household name" error={errors.name}>
            {(a11y) => <TextInput {...a11y} name="name" maxLength={60} defaultValue={name} required />}
          </Field>
        ) : (
          <input type="hidden" name="name" value={name} />
        )}

        <Field
          id="currency"
          label="Currency"
          error={errors.currency}
          hint={selected !== currency ? "Existing amounts keep their numbers. They aren't converted." : undefined}
        >
          {(a11y) => (
            <select
              {...a11y}
              name="currency"
              value={selected}
              onChange={(e) => {
                setSelected(e.target.value);
                setResult(null);
              }}
              className={selectClass}
            >
              {CURRENCIES.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.code} · {c.label}
                </option>
              ))}
            </select>
          )}
        </Field>

        <Field id="monthlyBudget" label="Overall monthly budget" hint="Optional. Tracked on the overview alongside category budgets." error={errors.monthlyBudget}>
          {(a11y) => <AmountInput symbol={symbol} {...a11y} name="monthlyBudget" placeholder="No budget" defaultValue={monthlyBudget} />}
        </Field>

        {canEdit ? (
          <button type="submit" disabled={pending} aria-busy={pending} className={buttonStyles.primary}>
            {pending ? <Spinner /> : null}
            Save settings
          </button>
        ) : null}
      </fieldset>
    </form>
  );
}
