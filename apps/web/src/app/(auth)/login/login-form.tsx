"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition, type FormEvent } from "react";
import { authRequest } from "@/lib/auth-api";
import { safeRedirect } from "@expense/shared/redirect";
import { EMAIL_PATTERN } from "@/components/auth/errors";
import { Field, TextInput } from "@/components/auth/field";
import { PasswordInput } from "@/components/auth/password-input";
import { FormAlert, SubmitButton, linkClass } from "@/components/auth/ui";

type Errors = { email?: string; password?: string; form?: string };

function validate(email: string, password: string): Errors {
  const errors: Errors = {};
  if (!email) errors.email = "Enter your email address.";
  else if (!EMAIL_PATTERN.test(email)) errors.email = "Enter a valid email address.";
  if (!password) errors.password = "Enter your password.";
  return errors;
}

export function LoginForm() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [errors, setErrors] = useState<Errors>({});

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const email = String(data.get("email") ?? "").trim();
    const password = String(data.get("password") ?? "");
    const rememberMe = data.get("remember") === "on";

    const fieldErrors = validate(email, password);
    setErrors(fieldErrors);
    if (fieldErrors.email || fieldErrors.password) {
      form.querySelector<HTMLInputElement>("[aria-invalid=true]")?.focus();
      return;
    }

    startTransition(async () => {
      const redirectTo = safeRedirect(new URLSearchParams(window.location.search).get("redirectTo"));
      const res = await authRequest("login", { email, password, remember: rememberMe });
      if (!res.ok) {
        setErrors({ form: res.error });
        return;
      }
      router.replace(redirectTo);
    });
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-5">
      {errors.form ? <FormAlert>{errors.form}</FormAlert> : null}

      <Field id="email" label="Email" error={errors.email}>
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

      <Field
        id="password"
        label="Password"
        error={errors.password}
        labelAside={
          <Link href="/forgot-password" className={`text-sm ${linkClass}`}>
            Forgot password?
          </Link>
        }
      >
        {(a11y) => (
          <PasswordInput
            {...a11y}
            name="password"
            autoComplete="current-password"
            required
            disabled={pending}
          />
        )}
      </Field>

      <label className="flex items-center gap-2.5 text-sm text-zinc-700 dark:text-zinc-300">
        <input
          type="checkbox"
          name="remember"
          defaultChecked
          className="size-4 rounded border-zinc-300 accent-emerald-600 dark:border-zinc-600"
        />
        Keep me signed in
      </label>

      <SubmitButton pending={pending} pendingLabel="Signing in…">
        Sign in
      </SubmitButton>
    </form>
  );
}

