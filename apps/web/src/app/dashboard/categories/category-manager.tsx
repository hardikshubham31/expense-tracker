"use client";

import { useState, useTransition, type FormEvent } from "react";
import { Dialog } from "@/components/dialog";
import { AmountInput } from "@/components/amount-input";
import { Field, TextInput } from "@/components/auth/field";
import { FormAlert, Spinner } from "@/components/auth/ui";
import { CategoryDot, PlusIcon, buttonStyles } from "@/components/ui";
import { COLOR_SLOTS, nextColorSlot, seriesColor } from "@expense/shared/categories";
import { currencySymbol, formatMoney, toAmountInput } from "@expense/shared/money";
import type { ActionResult } from "@/lib/action-utils";
import { createCategory, deleteCategory, updateCategory } from "../actions/categories";

export type ManagedCategory = {
  id: string;
  name: string;
  color: string;
  budget: number | null;
  spent: number;
  count: number;
};

export function NewCategoryButton({ usedColors, currency }: { usedColors: string[]; currency: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={buttonStyles.primary}>
        <PlusIcon />
        New category
      </button>
      <Dialog open={open} onClose={() => setOpen(false)} title="New category">
        <CategoryForm defaultColor={nextColorSlot(usedColors)} currency={currency} onDone={() => setOpen(false)} />
      </Dialog>
    </>
  );
}

export function CategoryList({ categories, currency }: { categories: ManagedCategory[]; currency: string }) {
  const [editing, setEditing] = useState<ManagedCategory | null>(null);

  if (categories.length === 0) {
    return <p className="py-10 text-center text-sm text-zinc-500 dark:text-zinc-400">No categories yet. Create one to start organizing.</p>;
  }

  return (
    <>
      <ul className="divide-y divide-zinc-100 dark:divide-zinc-800">
        {categories.map((c) => (
          <li key={c.id}>
            <button
              type="button"
              onClick={() => setEditing(c)}
              className="flex w-full items-center gap-3 px-1 py-3.5 text-left transition hover:bg-zinc-50 focus-visible:rounded-lg focus-visible:outline-2 focus-visible:outline-emerald-600 dark:hover:bg-zinc-800/50"
            >
              <CategoryDot color={c.color} className="size-3" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium text-zinc-900 dark:text-zinc-100">{c.name}</span>
                <span className="text-xs text-zinc-500 dark:text-zinc-400">
                  {c.count} {c.count === 1 ? "expense" : "expenses"} this month
                </span>
              </span>
              <span className="text-right text-sm tabular-nums">
                <span className="block font-medium text-zinc-900 dark:text-zinc-100">{formatMoney(c.spent, currency)}</span>
                <span className="text-xs text-zinc-500 dark:text-zinc-400">
                  {c.budget ? `of ${formatMoney(c.budget, currency)} budget` : "No budget"}
                </span>
              </span>
              <span className="sr-only">, edit</span>
            </button>
          </li>
        ))}
      </ul>

      <Dialog open={editing !== null} onClose={() => setEditing(null)} title="Edit category">
        {editing ? (
          <CategoryForm key={editing.id} category={editing} currency={currency} onDone={() => setEditing(null)} />
        ) : null}
      </Dialog>
    </>
  );
}

function CategoryForm({
  category,
  defaultColor = "blue",
  currency,
  onDone,
}: {
  category?: ManagedCategory;
  defaultColor?: string;
  currency: string;
  onDone: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<ActionResult | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const errors = result && !result.ok ? (result.fieldErrors ?? {}) : {};
  const symbol = currencySymbol(currency);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    startTransition(async () => {
      const res = category ? await updateCategory(category.id, data) : await createCategory(data);
      setResult(res);
      if (res.ok) onDone();
      else requestAnimationFrame(() => form.querySelector<HTMLElement>("[aria-invalid=true]")?.focus());
    });
  }

  function handleDelete() {
    if (!category) return;
    startTransition(async () => {
      const res = await deleteCategory(category.id);
      setResult(res);
      if (res.ok) onDone();
    });
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-5">
      {result && !result.ok && result.error ? <FormAlert>{result.error}</FormAlert> : null}

      <Field id="name" label="Name" error={errors.name}>
        {(a11y) => (
          <TextInput {...a11y} name="name" maxLength={40} defaultValue={category?.name} placeholder="e.g. Subscriptions" autoFocus required />
        )}
      </Field>

      <fieldset>
        <legend className="mb-2 text-sm font-medium text-zinc-800 dark:text-zinc-200">Color</legend>
        <div className="flex flex-wrap gap-2">
          {COLOR_SLOTS.map((slot) => (
            <label key={slot} className="relative cursor-pointer">
              <input
                type="radio"
                name="color"
                value={slot}
                defaultChecked={(category?.color ?? defaultColor) === slot}
                className="peer sr-only"
              />
              <span className="sr-only">{slot}</span>
              <span
                aria-hidden="true"
                className="block size-8 rounded-full ring-offset-2 ring-offset-white transition peer-checked:ring-2 peer-checked:ring-zinc-900 peer-focus-visible:outline-2 peer-focus-visible:outline-offset-4 peer-focus-visible:outline-emerald-600 dark:ring-offset-zinc-900 dark:peer-checked:ring-zinc-100"
                style={{ backgroundColor: seriesColor(slot) }}
              />
            </label>
          ))}
        </div>
        {errors.color ? <p className="mt-1.5 text-sm text-red-600 dark:text-red-400">{errors.color}</p> : null}
      </fieldset>

      <Field id="budget" label="Monthly budget" hint="Optional. Leave empty for no budget." error={errors.budget}>
        {(a11y) => (
          <AmountInput
            symbol={symbol}
            {...a11y}
            name="budget"
            placeholder="No budget"
            defaultValue={category?.budget ? toAmountInput(category.budget, currency) : ""}
          />
        )}
      </Field>

      {confirmingDelete && category ? (
        <FormAlert>
          <p>
            Delete <strong>{category.name}</strong>?{" "}
            {category.count > 0 ? "Its expenses will be kept as Uncategorized." : ""}
          </p>
          <div className="mt-3 flex gap-2">
            <button type="button" onClick={handleDelete} disabled={pending} className="rounded-md bg-[var(--status-critical)] px-3 py-1.5 text-sm font-medium text-white hover:opacity-90">
              Delete category
            </button>
            <button type="button" onClick={() => setConfirmingDelete(false)} className={buttonStyles.ghost}>
              Keep it
            </button>
          </div>
        </FormAlert>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
        {category && !confirmingDelete ? (
          <button type="button" onClick={() => setConfirmingDelete(true)} className={buttonStyles.danger}>
            Delete
          </button>
        ) : (
          <span />
        )}
        <div className="flex gap-2">
          <button type="button" onClick={onDone} className={buttonStyles.secondary}>
            Cancel
          </button>
          <button type="submit" disabled={pending} aria-busy={pending} className={buttonStyles.primary}>
            {pending ? <Spinner /> : null}
            {category ? "Save changes" : "Create category"}
          </button>
        </div>
      </div>
    </form>
  );
}
