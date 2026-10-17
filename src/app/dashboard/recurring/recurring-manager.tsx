"use client";

import { useState, useTransition, type FormEvent } from "react";
import { Dialog } from "@/components/dialog";
import { AmountInput } from "@/components/amount-input";
import { Field, TextInput } from "@/components/auth/field";
import { FormAlert, Spinner } from "@/components/auth/ui";
import { CategoryDot, PlusIcon, buttonStyles, selectClass } from "@/components/ui";
import type { ActionResult } from "@/lib/action-utils";
import type { RecurringRuleRow } from "@/lib/data";
import { currencySymbol, formatMoney, toAmountInput } from "@/lib/money";
import { formatDay, toDateInput, todayInput } from "@/lib/dates";
import { createRecurring, deleteRecurring, setRecurringActive, updateRecurring } from "../actions/recurring";
import { useLedgerUI } from "../_components/ledger-context";

const FREQUENCY_LABEL = { WEEKLY: "Weekly", MONTHLY: "Monthly", YEARLY: "Yearly" } as const;

export function NewRecurringButton() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={buttonStyles.primary}>
        <PlusIcon />
        New recurring
      </button>
      <Dialog open={open} onClose={() => setOpen(false)} title="New recurring entry">
        <RuleForm onDone={() => setOpen(false)} />
      </Dialog>
    </>
  );
}

export function RecurringList({ rules }: { rules: RecurringRuleRow[] }) {
  const ui = useLedgerUI();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const editing = rules.find((r) => r.id === editingId) ?? null;

  return (
    <>
      <ul className="divide-y divide-zinc-100 dark:divide-zinc-800">
        {rules.map((r) => (
          <li key={r.id} className={`flex items-center gap-3 py-3 ${r.active ? "" : "opacity-60"}`}>
            <button
              type="button"
              onClick={() => setEditingId(r.id)}
              className="flex min-w-0 flex-1 items-center gap-3 rounded-lg px-1 text-left focus-visible:outline-2 focus-visible:outline-emerald-600"
            >
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-2 text-sm font-medium text-zinc-900 dark:text-zinc-100">
                  <span className="truncate">{r.description}</span>
                  <span className="shrink-0 rounded-full bg-zinc-100 px-2 py-0.5 text-[11px] font-medium text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
                    {r.type === "INCOME" ? "Income" : FREQUENCY_LABEL[r.frequency]}
                    {r.type === "INCOME" ? ` · ${FREQUENCY_LABEL[r.frequency].toLowerCase()}` : ""}
                  </span>
                </span>
                <span className="mt-0.5 flex items-center gap-1.5 text-xs text-zinc-500 dark:text-zinc-400">
                  {r.type === "EXPENSE" ? <CategoryDot color={r.category?.color} /> : null}
                  <span className="truncate">
                    {[
                      r.type === "EXPENSE" ? (r.category?.name ?? "Uncategorized") : null,
                      r.active ? `Next ${formatDay(r.nextDate, { day: "numeric", month: "short", year: "numeric" })}` : "Paused",
                      r.endDate ? `until ${formatDay(r.endDate, { day: "numeric", month: "short", year: "numeric" })}` : null,
                      ui.isShared && r.paidById ? `${ui.memberNames[r.paidById] ?? "Someone"} pays` : null,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                </span>
              </span>
              <span className={`text-sm font-semibold tabular-nums ${r.type === "INCOME" ? "text-good" : "text-zinc-900 dark:text-zinc-100"}`}>
                {r.type === "INCOME" ? "+" : ""}
                {formatMoney(r.amount, ui.currency)}
              </span>
              <span className="sr-only">, edit</span>
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={() => startTransition(async () => void (await setRecurringActive(r.id, !r.active)))}
              className={buttonStyles.ghost}
            >
              {r.active ? "Pause" : "Resume"}
              <span className="sr-only"> {r.description}</span>
            </button>
          </li>
        ))}
      </ul>
      <Dialog open={editing !== null} onClose={() => setEditingId(null)} title="Edit recurring entry">
        {editing ? <RuleForm key={editing.id} rule={editing} onDone={() => setEditingId(null)} /> : null}
      </Dialog>
    </>
  );
}

function RuleForm({ rule, onDone }: { rule?: RecurringRuleRow; onDone: () => void }) {
  const ui = useLedgerUI();
  const [type, setType] = useState<"EXPENSE" | "INCOME">(rule?.type ?? "EXPENSE");
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<ActionResult | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const errors = result && !result.ok ? (result.fieldErrors ?? {}) : {};

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    startTransition(async () => {
      const res = rule ? await updateRecurring(rule.id, data) : await createRecurring(data);
      setResult(res);
      if (res.ok) onDone();
      else requestAnimationFrame(() => form.querySelector<HTMLElement>("[aria-invalid=true]")?.focus());
    });
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-4">
      {result && !result.ok && result.error ? <FormAlert>{result.error}</FormAlert> : null}

      <div role="radiogroup" aria-label="Type" className="inline-flex rounded-lg bg-zinc-100 p-0.5 text-sm dark:bg-zinc-800">
        {(["EXPENSE", "INCOME"] as const).map((t) => (
          <label key={t} className="cursor-pointer">
            <input type="radio" name="type" value={t} checked={type === t} onChange={() => setType(t)} className="peer sr-only" />
            <span className="block rounded-md px-3 py-1.5 font-medium text-zinc-500 peer-checked:bg-white peer-checked:text-zinc-900 peer-checked:shadow-xs peer-focus-visible:outline-2 peer-focus-visible:outline-emerald-600 dark:peer-checked:bg-zinc-950 dark:peer-checked:text-zinc-50">
              {t === "EXPENSE" ? "Expense" : "Income"}
            </span>
          </label>
        ))}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="rule-amount" label="Amount" error={errors.amount}>
          {(a11y) => (
            <AmountInput
              symbol={currencySymbol(ui.currency)}
              {...a11y}
              name="amount"
              placeholder="0.00"
              defaultValue={rule ? toAmountInput(rule.amount, ui.currency) : ""}
              autoFocus
              required
            />
          )}
        </Field>
        <Field id="rule-frequency" label="Repeats" error={errors.frequency}>
          {(a11y) => (
            <select {...a11y} name="frequency" defaultValue={rule?.frequency ?? "MONTHLY"} className={selectClass}>
              <option value="WEEKLY">Every week</option>
              <option value="MONTHLY">Every month</option>
              <option value="YEARLY">Every year</option>
            </select>
          )}
        </Field>
      </div>

      <Field id="rule-description" label="Description" error={errors.description}>
        {(a11y) => (
          <TextInput
            {...a11y}
            name="description"
            maxLength={120}
            placeholder={type === "EXPENSE" ? "e.g. Rent, Netflix" : "e.g. Salary"}
            defaultValue={rule?.description}
            required
          />
        )}
      </Field>

      {type === "EXPENSE" ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <Field id="rule-category" label="Category">
            {(a11y) => (
              <select {...a11y} name="categoryId" defaultValue={rule?.category?.id ?? ""} className={selectClass}>
                <option value="">Uncategorized</option>
                {ui.categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            )}
          </Field>
          {ui.isShared ? (
            <Field id="rule-paid-by" label="Paid by" hint="Split equally between everyone">
              {(a11y) => (
                <select {...a11y} name="paidById" defaultValue={rule?.paidById ?? ui.meId} className={selectClass}>
                  {ui.members.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name}
                    </option>
                  ))}
                </select>
              )}
            </Field>
          ) : null}
        </div>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="rule-start" label="First date" error={errors.startDate} hint="Past dates are filled in right away">
          {(a11y) => (
            <TextInput {...a11y} name="startDate" type="date" defaultValue={rule ? toDateInput(rule.startDate) : todayInput()} required />
          )}
        </Field>
        <Field id="rule-end" label="Ends" hint="Optional" error={errors.endDate}>
          {(a11y) => <TextInput {...a11y} name="endDate" type="date" defaultValue={rule?.endDate ? toDateInput(rule.endDate) : ""} />}
        </Field>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
        {rule ? (
          confirmingDelete ? (
            <div className="flex items-center gap-1">
              <span className="text-sm text-zinc-600 dark:text-zinc-400">Delete? Past entries stay.</span>
              <button
                type="button"
                disabled={pending}
                onClick={() =>
                  startTransition(async () => {
                    if ((await deleteRecurring(rule.id)).ok) onDone();
                  })
                }
                className={buttonStyles.danger}
              >
                Delete
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
            {rule ? "Save changes" : "Create"}
          </button>
        </div>
      </div>
    </form>
  );
}
