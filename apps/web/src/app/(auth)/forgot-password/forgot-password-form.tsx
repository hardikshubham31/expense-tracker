"use client";

import Link from "next/link";
import { useState, useTransition, type FormEvent } from "react";
import { authRequest } from "@/lib/auth-api";
import { EMAIL_PATTERN } from "@/components/auth/errors";
import { Field, TextInput } from "@/components/auth/field";
import { AuthHeader, FormAlert, SubmitButton, linkClass } from "@/components/auth/ui";

export function ForgotPasswordForm() {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<{ field?: string; form?: string }>({});
  const [sentTo, setSentTo] = useState<string | null>(null);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const email = String(new FormData(event.currentTarget).get("email") ?? "").trim();

    if (!EMAIL_PATTERN.test(email)) {
      setError({ field: email ? "Enter a valid email address." : "Enter your email address." });
      event.currentTarget.querySelector<HTMLInputElement>("input")?.focus();
      return;
    }

    setError({});
    startTransition(async () => {
      const res = await authRequest("forgot-password", { email });
      if (!res.ok) {
        setError({ form: res.error });
        return;
      }
      setSentTo(email);
    });
  }

  if (sentTo) {
    return (
      <div className="space-y-8">
        <AuthHeader
          title="Check your email"
          description={
            <>
              If an account exists for <strong className="font-medium text-zinc-900 dark:text-zinc-100">{sentTo}</strong>,
              we&apos;ve sent a link to reset your password. It expires in 1 hour.
            </>
          }
        />
        <FormAlert tone="success">Didn&apos;t get it? Check your spam folder, or try again in a few minutes.</FormAlert>
        <p className="text-center text-sm">
          <Link href="/login" className={linkClass}>
            Back to sign in
          </Link>
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <AuthHeader
        title="Forgot your password?"
        description="Enter the email you signed up with and we'll send you a reset link."
      />

      <form onSubmit={handleSubmit} noValidate className="space-y-5">
        {error.form ? <FormAlert>{error.form}</FormAlert> : null}
        <Field id="email" label="Email" error={error.field}>
          {(a11y) => (
            <TextInput
              {...a11y}
              name="email"
              type="email"
              autoComplete="email"
              inputMode="email"
              spellCheck={false}
              placeholder="you@example.com"
              required
              disabled={pending}
            />
          )}
        </Field>
        <SubmitButton pending={pending} pendingLabel="Sending link…">
          Send reset link
        </SubmitButton>
      </form>

      <p className="text-center text-sm text-zinc-600 dark:text-zinc-400">
        Remembered it?{" "}
        <Link href="/login" className={linkClass}>
          Back to sign in
        </Link>
      </p>
    </div>
  );
}
