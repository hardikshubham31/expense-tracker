"use client";

import { useId, useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Dialog } from "@/components/dialog";
import { AmountInput } from "@/components/amount-input";
import { Field, TextInput, inputClass } from "@/components/auth/field";
import { FormAlert, Spinner } from "@/components/auth/ui";
import { PlusIcon, buttonStyles, selectBase, selectClass } from "@/components/ui";
import { createExpense, deleteExpense, deleteReceipt, updateExpense } from "../actions/expenses";
import type { ActionResult } from "@/lib/action-utils";
import { currencySymbol, formatMoney, parseAmount, toAmountInput } from "@/lib/money";
import { toDateInput, todayInput } from "@/lib/dates";
import { equalSplit } from "@/lib/splits";
import { suggestCategory } from "@/lib/suggest";
import type { ExpenseRow } from "@/lib/data";
import { openAddExpense, useLedgerUI } from "./ledger-context";

const lastCategoryKey = (ledgerId: string) => `lastCategory:${ledgerId}`;

function readLastCategory(ledgerId: string) {
  try {
    return localStorage.getItem(lastCategoryKey(ledgerId)) ?? "";
  } catch {
    return "";
  }
}

export function ExpenseDialog({ open, onClose, expense }: { open: boolean; onClose: () => void; expense?: ExpenseRow | null }) {
  return (
    <Dialog open={open} onClose={onClose} title={expense ? "Edit expense" : "Add expense"} wide>
      {/* key remounts the form so fields reset between expenses */}
      <ExpenseForm key={expense?.id ?? "new"} onDone={onClose} expense={expense} />
    </Dialog>
  );
}

/** Work out the initial split UI state from an existing expense. */
function initialSplit(expense: ExpenseRow | null | undefined, memberIds: string[]) {
  if (!expense || expense.splits.length === 0) return { mode: "equal" as const, included: memberIds, custom: {} as Record<string, string> };
  const ids = expense.splits.map((s) => s.memberId);
  const equal = equalSplit(expense.amount, ids);
  const isEqual = equal.every((e) => expense.splits.find((s) => s.memberId === e.memberId)?.amount === e.amount);
  return {
    mode: isEqual ? ("equal" as const) : ("custom" as const),
    included: ids,
    custom: Object.fromEntries(expense.splits.map((s) => [s.memberId, (s.amount / 100).toString()])),
  };
}

function ExpenseForm({ onDone, expense }: { onDone: () => void; expense?: ExpenseRow | null }) {
  const ui = useLedgerUI();
  const router = useRouter();
  const datalistId = useId();
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<ActionResult | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  // After a create succeeds, further saves update it (e.g. if the receipt upload failed).
  const [savedId, setSavedId] = useState<string | null>(expense?.id ?? null);

  const [amount, setAmount] = useState(expense ? toAmountInput(expense.amount, ui.currency) : "");
  const [categoryId, setCategoryId] = useState(() => expense?.category?.id ?? (expense ? "" : readLastCategory(ui.ledgerId)));
  const [categoryTouched, setCategoryTouched] = useState(Boolean(expense));
  const [suggested, setSuggested] = useState(false);
  const [file, setFile] = useState<File | null>(null);

  const [split0] = useState(() => initialSplit(expense, ui.members.map((m) => m.id)));
  const [splitMode, setSplitMode] = useState<"equal" | "custom">(split0.mode);
  const [included, setIncluded] = useState<string[]>(split0.included);
  const [custom, setCustom] = useState<Record<string, string>>(split0.custom);

  const errors = result && !result.ok ? (result.fieldErrors ?? {}) : {};
  const symbol = currencySymbol(ui.currency);
  const total = parseAmount(amount, ui.currency);

  function onDescriptionChange(value: string) {
    if (categoryTouched) return;
    const suggestion = suggestCategory(value, ui.hints, ui.categories);
    if (suggestion) {
      setCategoryId(suggestion);
      setSuggested(true);
    } else if (suggested) {
      setSuggested(false);
    }
  }

  async function uploadReceipt(expenseId: string) {
    if (!file) return null;
    const body = new FormData();
    body.set("expenseId", expenseId);
    body.set("file", file);
    const res = await fetch("/api/receipts", { method: "POST", body });
    if (res.ok) return null;
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    return data.error ?? "The receipt couldn't be uploaded.";
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    startTransition(async () => {
      const res = savedId ? await updateExpense(savedId, data) : await createExpense(data);
      if (!res.ok) {
        setResult(res);
        requestAnimationFrame(() => form.querySelector<HTMLElement>("[aria-invalid=true]")?.focus());
        return;
      }
      const id = res.id!;
      setSavedId(id);
      try {
        localStorage.setItem(lastCategoryKey(ui.ledgerId), String(data.get("categoryId") ?? ""));
      } catch {}
      const uploadError = await uploadReceipt(id);
      if (uploadError) {
        setResult({ ok: false, error: `Saved, but the receipt wasn't attached: ${uploadError}` });
        router.refresh();
        return;
      }
      if (file) router.refresh();
      onDone();
    });
  }

  function handleDelete() {
    if (!savedId) return;
    startTransition(async () => {
      const res = await deleteExpense(savedId);
      setResult(res);
      if (res.ok) onDone();
    });
  }

  function handleRemoveReceipt() {
    if (!savedId) return;
    startTransition(async () => {
      await deleteReceipt(savedId);
    });
  }

  const preview = total && splitMode === "equal" && included.length ? equalSplit(total, included) : [];
  const customSum = Object.values(custom).reduce((s, v) => s + (parseAmount(v, ui.currency) ?? 0), 0);

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-4">
      {result && !result.ok && result.error ? <FormAlert>{result.error}</FormAlert> : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="amount" label="Amount" error={errors.amount}>
          {(a11y) => (
            <AmountInput
              symbol={symbol}
              {...a11y}
              name="amount"
              placeholder="0.00"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              autoFocus
              required
            />
          )}
        </Field>
        <Field id="date" label="Date" error={errors.date}>
          {(a11y) => (
            <TextInput {...a11y} name="date" type="date" defaultValue={expense ? toDateInput(expense.date) : todayInput()} required />
          )}
        </Field>
      </div>

      <Field id="description" label="Description" error={errors.description}>
        {(a11y) => (
          <>
            <TextInput
              {...a11y}
              name="description"
              placeholder="e.g. Lunch with team"
              maxLength={120}
              list={datalistId}
              autoComplete="off"
              defaultValue={expense?.description ?? ""}
              onChange={(e) => onDescriptionChange(e.target.value)}
              required
            />
            <datalist id={datalistId}>
              {ui.hints.slice(0, 50).map((h) => (
                <option key={h.description} value={h.description} />
              ))}
            </datalist>
          </>
        )}
      </Field>

      <Field id="categoryId" label="Category" error={errors.categoryId} hint={suggested ? "Suggested from the description" : undefined}>
        {(a11y) => (
          <select
            {...a11y}
            name="categoryId"
            value={categoryId}
            onChange={(e) => {
              setCategoryId(e.target.value);
              setCategoryTouched(true);
              setSuggested(false);
            }}
            className={selectClass}
          >
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
        <fieldset className="space-y-3 rounded-xl border border-zinc-200 p-4 dark:border-zinc-800">
          <legend className="px-1 text-sm font-medium text-zinc-800 dark:text-zinc-200">Paid by &amp; split</legend>
          <div className="flex flex-wrap items-center gap-3">
            <label htmlFor="paidById" className="text-sm text-zinc-600 dark:text-zinc-400">
              Paid by
            </label>
            <select id="paidById" name="paidById" defaultValue={expense?.paidById ?? ui.meId} className={`${selectBase} w-auto`}>
              {ui.members.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.id === ui.meId ? `${m.name} (you)` : m.name}
                </option>
              ))}
            </select>
            <div role="radiogroup" aria-label="Split" className="ml-auto inline-flex rounded-lg bg-zinc-100 p-0.5 text-xs dark:bg-zinc-800">
              {(["equal", "custom"] as const).map((mode) => (
                <label key={mode} className="cursor-pointer">
                  <input
                    type="radio"
                    name="splitMode"
                    value={mode}
                    checked={splitMode === mode}
                    onChange={() => setSplitMode(mode)}
                    className="peer sr-only"
                  />
                  <span className="block rounded-md px-2.5 py-1 font-medium text-zinc-500 peer-checked:bg-white peer-checked:text-zinc-900 peer-checked:shadow-xs peer-focus-visible:outline-2 peer-focus-visible:outline-emerald-600 dark:peer-checked:bg-zinc-950 dark:peer-checked:text-zinc-50">
                    {mode === "equal" ? "Equally" : "Exact amounts"}
                  </span>
                </label>
              ))}
            </div>
          </div>

          <ul className="space-y-2">
            {ui.members.map((m) => {
              const share = preview.find((p) => p.memberId === m.id)?.amount;
              return (
                <li key={m.id} className="flex items-center justify-between gap-3 text-sm">
                  {splitMode === "equal" ? (
                    <>
                      <label className="flex items-center gap-2 text-zinc-800 dark:text-zinc-200">
                        <input
                          type="checkbox"
                          name="splitMembers"
                          value={m.id}
                          checked={included.includes(m.id)}
                          onChange={(e) => setIncluded((cur) => (e.target.checked ? [...cur, m.id] : cur.filter((id) => id !== m.id)))}
                          className="size-4 accent-emerald-600"
                        />
                        {m.name}
                      </label>
                      <span className="tabular-nums text-zinc-500 dark:text-zinc-400">{share !== undefined ? formatMoney(share, ui.currency) : "—"}</span>
                    </>
                  ) : (
                    <>
                      <label htmlFor={`split_${m.id}`} className="text-zinc-800 dark:text-zinc-200">
                        {m.name}
                      </label>
                      <div className="w-36">
                        <AmountInput
                          symbol={symbol}
                          id={`split_${m.id}`}
                          name={`split_${m.id}`}
                          placeholder="0"
                          value={custom[m.id] ?? ""}
                          onChange={(e) => setCustom((cur) => ({ ...cur, [m.id]: e.target.value }))}
                        />
                      </div>
                    </>
                  )}
                </li>
              );
            })}
          </ul>
          {splitMode === "custom" && total ? (
            <p className={`text-xs tabular-nums ${customSum === total ? "text-zinc-500 dark:text-zinc-400" : "text-critical"}`}>
              {customSum === total
                ? "Adds up to the total"
                : `${formatMoney(Math.abs(total - customSum), ui.currency)} ${customSum < total ? "left to assign" : "over the total"}`}
            </p>
          ) : null}
          {errors.splits ? <p className="text-sm text-red-600 dark:text-red-400">{errors.splits}</p> : null}
        </fieldset>
      ) : null}

      <Field id="notes" label="Notes" hint="Optional" error={errors.notes}>
        {(a11y) => (
          <textarea {...a11y} name="notes" rows={2} maxLength={500} defaultValue={expense?.notes ?? ""} className={`${inputClass} resize-y`} />
        )}
      </Field>

      <div className="space-y-1.5">
        <span className="text-sm font-medium text-zinc-800 dark:text-zinc-200">Receipt</span>
        {expense?.receipt && !file ? (
          <div className="flex items-center gap-3 rounded-lg border border-zinc-200 p-2 dark:border-zinc-800">
            {expense.receipt.mimeType.startsWith("image/") ? (
              // eslint-disable-next-line @next/next/no-img-element -- authenticated, user-uploaded file
              <img src={`/api/receipts/${expense.receipt.id}`} alt="Receipt" className="size-14 rounded-md object-cover" />
            ) : (
              <span className="grid size-14 place-items-center rounded-md bg-zinc-100 text-xs font-semibold text-zinc-500 dark:bg-zinc-800">PDF</span>
            )}
            <a
              href={`/api/receipts/${expense.receipt.id}`}
              target="_blank"
              rel="noreferrer"
              className="min-w-0 flex-1 truncate text-sm font-medium text-emerald-700 hover:underline dark:text-emerald-400"
            >
              {expense.receipt.originalName}
            </a>
            <button type="button" onClick={handleRemoveReceipt} disabled={pending} className={buttonStyles.ghost}>
              Remove
            </button>
          </div>
        ) : null}
        <input
          type="file"
          accept="image/jpeg,image/png,image/webp,application/pdf"
          aria-label={expense?.receipt ? "Replace receipt" : "Attach receipt"}
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          className="block w-full text-sm text-zinc-600 file:mr-3 file:rounded-lg file:border-0 file:bg-zinc-100 file:px-3 file:py-2 file:text-sm file:font-medium file:text-zinc-800 hover:file:bg-zinc-200 dark:text-zinc-400 dark:file:bg-zinc-800 dark:file:text-zinc-100"
        />
        <p className="text-xs text-zinc-500 dark:text-zinc-400">JPEG, PNG, WebP or PDF, up to 5 MB.</p>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
        {savedId ? (
          confirmingDelete ? (
            <div role="group" aria-label="Confirm delete" className="flex items-center gap-1">
              <span className="text-sm text-zinc-600 dark:text-zinc-400">Delete?</span>
              <button type="button" onClick={handleDelete} disabled={pending} className={buttonStyles.danger}>
                Yes, delete
              </button>
              <button type="button" onClick={() => setConfirmingDelete(false)} className={buttonStyles.ghost}>
                No
              </button>
            </div>
          ) : (
            <button type="button" onClick={() => setConfirmingDelete(true)} disabled={pending} className={buttonStyles.danger}>
              Delete
            </button>
          )
        ) : (
          <span className="hidden text-xs text-zinc-500 sm:inline dark:text-zinc-400">
            Tip: press <kbd className="rounded border border-zinc-300 px-1 font-sans dark:border-zinc-700">N</kbd> anywhere to add
          </span>
        )}

        <div className="flex gap-2">
          <button type="button" onClick={onDone} className={buttonStyles.secondary}>
            Cancel
          </button>
          <button type="submit" disabled={pending} aria-busy={pending} className={buttonStyles.primary}>
            {pending ? <Spinner /> : null}
            {savedId ? "Save changes" : "Add expense"}
          </button>
        </div>
      </div>
    </form>
  );
}

export function AddExpenseButton() {
  return (
    <button type="button" onClick={openAddExpense} className={buttonStyles.primary} aria-keyshortcuts="N">
      <PlusIcon />
      Add expense
    </button>
  );
}
