"use client";

import { useState, useTransition, type FormEvent } from "react";
import { Dialog } from "@/components/dialog";
import { AmountInput } from "@/components/amount-input";
import { Field, TextInput } from "@/components/auth/field";
import { FormAlert, Spinner } from "@/components/auth/ui";
import { buttonStyles, selectClass } from "@/components/ui";
import type { ActionResult } from "@/lib/action-utils";
import { currencySymbol, toAmountInput } from "@/lib/money";
import { todayInput } from "@/lib/dates";
import { deleteSettlement, recordSettlement } from "../actions/settlements";
import { useLedgerUI } from "../_components/ledger-context";

type Preset = { from: string; to: string; amount: number };

export function RecordPaymentButton({ preset, compact = false }: { preset?: Preset; compact?: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={compact ? buttonStyles.secondary : buttonStyles.primary}>
        {compact ? "Record" : "Record a payment"}
      </button>
      <Dialog open={open} onClose={() => setOpen(false)} title="Record a payment" description="When someone pays another member back.">
        <PaymentForm preset={preset} onDone={() => setOpen(false)} />
      </Dialog>
    </>
  );
}

function PaymentForm({ preset, onDone }: { preset?: Preset; onDone: () => void }) {
  const ui = useLedgerUI();
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<ActionResult | null>(null);
  const errors = result && !result.ok ? (result.fieldErrors ?? {}) : {};
  const other = ui.members.find((m) => m.id !== ui.meId)?.id ?? "";

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    startTransition(async () => {
      const res = await recordSettlement(data);
      setResult(res);
      if (res.ok) onDone();
    });
  }

  const memberOptions = ui.members.map((m) => (
    <option key={m.id} value={m.id}>
      {m.id === ui.meId ? `${m.name} (you)` : m.name}
    </option>
  ));

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-4">
      {result && !result.ok && result.error ? <FormAlert>{result.error}</FormAlert> : null}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="from" label="Who paid" error={errors.fromMemberId}>
          {(a11y) => (
            <select {...a11y} name="fromMemberId" defaultValue={preset?.from ?? ui.meId} className={selectClass}>
              {memberOptions}
            </select>
          )}
        </Field>
        <Field id="to" label="Paid to" error={errors.toMemberId}>
          {(a11y) => (
            <select {...a11y} name="toMemberId" defaultValue={preset?.to ?? other} className={selectClass}>
              {memberOptions}
            </select>
          )}
        </Field>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="settle-amount" label="Amount" error={errors.amount}>
          {(a11y) => (
            <AmountInput
              symbol={currencySymbol(ui.currency)}
              {...a11y}
              name="amount"
              defaultValue={preset ? toAmountInput(preset.amount, ui.currency) : ""}
              autoFocus
              required
            />
          )}
        </Field>
        <Field id="settle-date" label="Date">
          {(a11y) => <TextInput {...a11y} name="date" type="date" defaultValue={todayInput()} />}
        </Field>
      </div>
      <Field id="settle-note" label="Note" hint="Optional, e.g. UPI, cash">
        {(a11y) => <TextInput {...a11y} name="note" maxLength={200} />}
      </Field>
      <div className="flex justify-end gap-2 pt-2">
        <button type="button" onClick={onDone} className={buttonStyles.secondary}>
          Cancel
        </button>
        <button type="submit" disabled={pending} aria-busy={pending} className={buttonStyles.primary}>
          {pending ? <Spinner /> : null}
          Record payment
        </button>
      </div>
    </form>
  );
}

export function DeleteSettlementButton({ id }: { id: string }) {
  const [confirming, setConfirming] = useState(false);
  const [pending, startTransition] = useTransition();
  return confirming ? (
    <span className="flex items-center gap-1">
      <button type="button" disabled={pending} onClick={() => startTransition(async () => void (await deleteSettlement(id)))} className={buttonStyles.danger}>
        Delete
      </button>
      <button type="button" onClick={() => setConfirming(false)} className={buttonStyles.ghost}>
        Keep
      </button>
    </span>
  ) : (
    <button type="button" onClick={() => setConfirming(true)} className={buttonStyles.ghost} aria-label="Delete payment">
      <svg aria-hidden="true" viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
        <path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6" />
      </svg>
    </button>
  );
}
