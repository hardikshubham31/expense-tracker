"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useState, useTransition, type FormEvent } from "react";
import { authRequest } from "@/lib/auth-api";
import { Field } from "@/components/auth/field";
import { PasswordInput } from "@/components/auth/password-input";
import { AuthHeader, FormAlert, SubmitButton, linkClass } from "@/components/auth/ui";

type Errors = { password?: string; confirm?: string; form?: string };

export function ResetPasswordForm() {
  const searchParams = useSearchParams();
  // The emailed link is /reset-password?token=...
  const token = searchParams.get("token");
  const linkError = searchParams.get("error");

  const [pending, startTransition] = useTransition();
  const [errors, setErrors] = useState<Errors>({});
  const [done, setDone] = useState(false);

  if (!token || linkError) {
    return (
      <div className="space-y-8">
        <AuthHeader title="Link expired" description="This password reset link is invalid or has already been used." />
        <p className="text-center text-sm">
          <Link href="/forgot-password" className={linkClass}>
            Request a new link
          </Link>
        </p>
      </div>
    );
  }

  if (done) {
    return (
      <div className="space-y-8">
        <AuthHeader title="Password updated" description="Your password has been changed and other sessions were signed out." />
        <Link
          href="/login"
          className="inline-flex w-full items-center justify-center rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-emerald-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600"
        >
          Sign in with new password
        </Link>
      </div>
    );
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const password = String(data.get("password") ?? "");
    const confirm = String(data.get("confirm") ?? "");

    const fieldErrors: Errors = {};
    if (password.length < 8) fieldErrors.password = "Password must be at least 8 characters.";
    else if (password !== confirm) fieldErrors.confirm = "Passwords don't match.";
    setErrors(fieldErrors);
    if (fieldErrors.password || fieldErrors.confirm) {
      form.querySelector<HTMLInputElement>("[aria-invalid=true]")?.focus();
      return;
    }

    startTransition(async () => {
      const res = await authRequest("reset-password", { token, password });
      if (!res.ok) {
        setErrors(res.fieldErrors?.password ? { password: res.fieldErrors.password } : { form: res.error });
        return;
      }
      setDone(true);
    });
  }

  return (
    <div className="space-y-8">
      <AuthHeader title="Choose a new password" description="Make it at least 8 characters. You'll use it next time you sign in." />

      <form onSubmit={handleSubmit} noValidate className="space-y-5">
        {errors.form ? <FormAlert>{errors.form}</FormAlert> : null}
        <Field id="password" label="New password" error={errors.password}>
          {(a11y) => (
            <PasswordInput {...a11y} name="password" autoComplete="new-password" minLength={8} required disabled={pending} />
          )}
        </Field>
        <Field id="confirm" label="Confirm new password" error={errors.confirm}>
          {(a11y) => (
            <PasswordInput {...a11y} name="confirm" autoComplete="new-password" required disabled={pending} />
          )}
        </Field>
        <SubmitButton pending={pending} pendingLabel="Updating…">
          Update password
        </SubmitButton>
      </form>
    </div>
  );
}
