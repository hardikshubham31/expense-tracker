"use client";

import { useState, useTransition, type FormEvent } from "react";
import { Field, TextInput } from "@/components/auth/field";
import { PasswordInput } from "@/components/auth/password-input";
import { FormAlert, Spinner } from "@/components/auth/ui";
import { authErrorMessage } from "@/components/auth/errors";
import { buttonStyles, selectClass } from "@/components/ui";
import { authClient } from "@/lib/auth-client";
import type { ActionResult } from "@/lib/action-utils";
import { updateAccount } from "../actions/account";

export function AccountForm({
  name,
  email,
  timezone,
  budgetAlerts,
  timezones,
}: {
  name: string;
  email: string;
  timezone: string;
  budgetAlerts: boolean;
  timezones: string[];
}) {
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<ActionResult | null>(null);
  const errors = result && !result.ok ? (result.fieldErrors ?? {}) : {};

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    startTransition(async () => setResult(await updateAccount(data)));
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-5">
      {result?.ok ? <FormAlert tone="success">Saved.</FormAlert> : null}
      <Field id="account-name" label="Name" error={errors.name}>
        {(a11y) => <TextInput {...a11y} name="name" autoComplete="name" maxLength={80} defaultValue={name} required />}
      </Field>
      <Field id="account-email" label="Email">
        {(a11y) => <TextInput {...a11y} value={email} readOnly disabled />}
      </Field>
      <Field id="account-tz" label="Time zone" hint="Decides what “today” and “this month” mean for you." error={errors.timezone}>
        {(a11y) => (
          <select {...a11y} name="timezone" defaultValue={timezone} className={selectClass}>
            {(timezones.includes(timezone) ? timezones : [timezone, ...timezones]).map((tz) => (
              <option key={tz} value={tz}>
                {tz.replaceAll("_", " ")}
              </option>
            ))}
          </select>
        )}
      </Field>
      <label className="flex items-start gap-3 text-sm">
        <input type="checkbox" name="budgetAlerts" defaultChecked={budgetAlerts} className="mt-0.5 size-4 accent-emerald-600" />
        <span>
          <span className="font-medium text-zinc-800 dark:text-zinc-200">Email me budget alerts</span>
          <span className="block text-zinc-500 dark:text-zinc-400">When a budget reaches 80% and when it goes over, once per month.</span>
        </span>
      </label>
      <button type="submit" disabled={pending} aria-busy={pending} className={buttonStyles.primary}>
        {pending ? <Spinner /> : null}
        Save
      </button>
    </form>
  );
}

export function PasswordSection({ hasPassword, providers, email }: { hasPassword: boolean; providers: string[]; email: string }) {
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ tone: "error" | "success"; text: string } | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});

  if (!hasPassword) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          You sign in with {providers.map((p) => p[0].toUpperCase() + p.slice(1)).join(" and ") || "a linked account"}. You can also set a password to sign in
          with your email.
        </p>
        {message ? <FormAlert tone={message.tone}>{message.text}</FormAlert> : null}
        <button
          type="button"
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              const { error } = await authClient.requestPasswordReset({ email, redirectTo: "/reset-password" });
              setMessage(error ? { tone: "error", text: authErrorMessage(error) } : { tone: "success", text: `We sent a link to ${email} to set your password.` });
            })
          }
          className={buttonStyles.secondary}
        >
          {pending ? <Spinner /> : null}
          Email me a link to set a password
        </button>
      </div>
    );
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const currentPassword = String(data.get("currentPassword") ?? "");
    const newPassword = String(data.get("newPassword") ?? "");
    const next: Record<string, string> = {};
    if (!currentPassword) next.currentPassword = "Enter your current password.";
    if (newPassword.length < 8) next.newPassword = "Use at least 8 characters.";
    setErrors(next);
    setMessage(null);
    if (Object.keys(next).length) return;

    startTransition(async () => {
      const { error } = await authClient.changePassword({
        currentPassword,
        newPassword,
        revokeOtherSessions: data.get("revokeOthers") === "on",
      });
      if (error) {
        setMessage({ tone: "error", text: error.code === "INVALID_PASSWORD" ? "Your current password is incorrect." : authErrorMessage(error) });
        return;
      }
      form.reset();
      setMessage({ tone: "success", text: "Password changed." });
    });
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-4">
      {message ? <FormAlert tone={message.tone}>{message.text}</FormAlert> : null}
      <Field id="current-password" label="Current password" error={errors.currentPassword}>
        {(a11y) => <PasswordInput {...a11y} name="currentPassword" autoComplete="current-password" />}
      </Field>
      <Field id="new-password" label="New password" hint="At least 8 characters." error={errors.newPassword}>
        {(a11y) => <PasswordInput {...a11y} name="newPassword" autoComplete="new-password" />}
      </Field>
      <label className="flex items-center gap-2 text-sm text-zinc-700 dark:text-zinc-300">
        <input type="checkbox" name="revokeOthers" defaultChecked className="size-4 accent-emerald-600" />
        Sign out of other devices
      </label>
      <button type="submit" disabled={pending} aria-busy={pending} className={buttonStyles.primary}>
        {pending ? <Spinner /> : null}
        Change password
      </button>
    </form>
  );
}

export function DeleteAccount({ email, hasPassword }: { email: string; hasPassword: boolean }) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [confirmText, setConfirmText] = useState("");

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const password = String(new FormData(event.currentTarget).get("password") ?? "");
    setError(null);
    startTransition(async () => {
      const { error } = await authClient.deleteUser(hasPassword ? { password } : {});
      if (error) {
        setError(
          error.code === "SESSION_EXPIRED" || error.status === 401
            ? "For your security, sign out and sign back in, then try again."
            : error.code === "INVALID_PASSWORD"
              ? "That password is incorrect."
              : authErrorMessage(error),
        );
        return;
      }
      window.location.replace("/login");
    });
  }

  if (!open) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          Permanently deletes your account and personal ledger. You&apos;ll leave any households; their shared history stays for the other members.
        </p>
        <button type="button" onClick={() => setOpen(true)} className={buttonStyles.danger}>
          Delete my account…
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-4">
      {error ? <FormAlert>{error}</FormAlert> : null}
      <p className="text-sm text-zinc-700 dark:text-zinc-300">
        This can&apos;t be undone. Download your data first if you want a copy. Type <strong>{email}</strong> to confirm.
      </p>
      <Field id="confirm-email" label="Your email">
        {(a11y) => <TextInput {...a11y} value={confirmText} onChange={(e) => setConfirmText(e.target.value)} autoComplete="off" spellCheck={false} />}
      </Field>
      {hasPassword ? (
        <Field id="delete-password" label="Password">
          {(a11y) => <PasswordInput {...a11y} name="password" autoComplete="current-password" />}
        </Field>
      ) : null}
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={pending || confirmText.trim().toLowerCase() !== email.toLowerCase()}
          className="inline-flex items-center gap-2 rounded-lg bg-[var(--status-critical)] px-3.5 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {pending ? <Spinner /> : null}
          Delete account permanently
        </button>
        <button type="button" onClick={() => setOpen(false)} className={buttonStyles.secondary}>
          Cancel
        </button>
      </div>
    </form>
  );
}
