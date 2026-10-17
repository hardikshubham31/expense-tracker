"use client";

import { useState, useTransition, type FormEvent } from "react";
import { Dialog } from "@/components/dialog";
import { AmountInput } from "@/components/amount-input";
import { Field, TextInput, inputClass } from "@/components/auth/field";
import { FormAlert, Spinner } from "@/components/auth/ui";
import { PlusIcon, buttonStyles } from "@/components/ui";
import type { ActionResult } from "@/lib/action-utils";
import type { IncomeRow } from "@/lib/data";
import { currencySymbol, formatMoney, toAmountInput } from "@/lib/money";
import { formatDay, toDateInput, todayInput } from "@/lib/dates";
import { createIncome, deleteIncome, updateIncome } from "../actions/income";
import { useLedgerUI } from "../_components/ledger-context";
import { RepeatIcon } from "../_components/expense-list";

export function AddIncomeButton() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={buttonStyles.primary}>
        <PlusIcon />
        Add income
      </button>
      <Dialog open={open} onClose={() => setOpen(false)} title="Add income">
        <IncomeForm onDone={() => setOpen(false)} />
      </Dialog>
    </>
  );
}

export function IncomeList({ incomes }: { incomes: IncomeRow[] }) {
  const { currency } = useLedgerUI();
  const [editingId, setEditingId] = useState<string | null>(null);
  const editing = incomes.find((i) => i.id === editingId) ?? null;

  return (
    <>
      <ul className="divide-y divide-zinc-100 dark:divide-zinc-800">
        {incomes.map((i) => (
          <li key={i.id}>
            <button
              type="button"
              onClick={() => setEditingId(i.id)}
              className="flex w-full items-center gap-3 px-1 py-3 text-left hover:bg-zinc-50 focus-visible:rounded-lg focus-visible:outline-2 focus-visible:outline-emerald-600 dark:hover:bg-zinc-800/50"
            >
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-1.5 text-sm font-medium text-zinc-900 dark:text-zinc-100">
                  <span className="truncate">{i.source}</span>
                  {i.recurringId ? (
                    <span className="text-zinc-400" title="Recurring">
                      <RepeatIcon />
                      <span className="sr-only">(recurring)</span>
                    </span>
                  ) : null}
                </span>
                <span className="block truncate text-xs text-zinc-500 dark:text-zinc-400">
                  {[formatDay(i.date), i.notes].filter(Boolean).join(" · ")}
                </span>
              </span>
              <span className="text-sm font-semibold tabular-nums text-good">+{formatMoney(i.amount, currency)}</span>
              <span className="sr-only">, edit</span>
            </button>
          </li>
        ))}
      </ul>
      <Dialog open={editing !== null} onClose={() => setEditingId(null)} title="Edit income">
        {editing ? <IncomeForm key={editing.id} income={editing} onDone={() => setEditingId(null)} /> : null}
      </Dialog>
    </>
  );
}

function IncomeForm({ income, onDone }: { income?: IncomeRow; onDone: () => void }) {
  const { currency } = useLedgerUI();
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<ActionResult | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const errors = result && !result.ok ? (result.fieldErrors ?? {}) : {};

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    startTransition(async () => {
      const res = income ? await updateIncome(income.id, data) : await createIncome(data);
      setResult(res);
      if (res.ok) onDone();
      else requestAnimationFrame(() => form.querySelector<HTMLElement>("[aria-invalid=true]")?.focus());
    });
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-4">
      {result && !result.ok && result.error ? <FormAlert>{result.error}</FormAlert> : null}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="income-amount" label="Amount" error={errors.amount}>
          {(a11y) => (
            <AmountInput
              symbol={currencySymbol(currency)}
              {...a11y}
              name="amount"
              placeholder="0.00"
              defaultValue={income ? toAmountInput(income.amount, currency) : ""}
              autoFocus
              required
            />
          )}
        </Field>
        <Field id="income-date" label="Date" error={errors.date}>
          {(a11y) => <TextInput {...a11y} name="date" type="date" defaultValue={income ? toDateInput(income.date) : todayInput()} required />}
        </Field>
      </div>
      <Field id="income-source" label="Source" error={errors.source}>
        {(a11y) => <TextInput {...a11y} name="source" placeholder="e.g. Salary, Freelance" maxLength={120} defaultValue={income?.source} required />}
      </Field>
      <Field id="income-notes" label="Notes" hint="Optional" error={errors.notes}>
        {(a11y) => <textarea {...a11y} name="notes" rows={2} maxLength={500} defaultValue={income?.notes ?? ""} className={`${inputClass} resize-y`} />}
      </Field>
      <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
        {income ? (
          confirmingDelete ? (
            <div className="flex items-center gap-1">
              <span className="text-sm text-zinc-600 dark:text-zinc-400">Delete?</span>
              <button
                type="button"
                disabled={pending}
                onClick={() =>
                  startTransition(async () => {
                    if ((await deleteIncome(income.id)).ok) onDone();
                  })
                }
                className={buttonStyles.danger}
              >
                Yes, delete
              </button>
              <button type="button" onClick={() => setConfirmingDelete(false)} className={buttonStyles.ghost}>
                No
              </button>
            </div>
          ) : (
            <button type="button" onClick={() => setConfirmingDelete(true)} className={buttonStyles.danger}>
              Delete
            </button>
          )
        ) : (
          <span />
        )}
        <div className="flex gap-2">
          <button type="button" onClick={onDone} className={buttonStyles.secondary}>
            Cancel
          </button>
          <button type="submit" disabled={pending} aria-busy={pending} className={buttonStyles.primary}>
            {pending ? <Spinner /> : null}
            {income ? "Save changes" : "Add income"}
          </button>
        </div>
      </div>
    </form>
  );
}
