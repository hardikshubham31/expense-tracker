"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition, type FormEvent } from "react";
import { authRequest } from "@/lib/auth-api";
import { safeRedirect } from "@expense/shared/redirect";
import { EMAIL_PATTERN } from "@/components/auth/errors";
import { Field, TextInput } from "@/components/auth/field";
import { PasswordInput } from "@/components/auth/password-input";
import { FormAlert, SubmitButton } from "@/components/auth/ui";

type Errors = { name?: string; email?: string; password?: string; form?: string };

function validate(name: string, email: string, password: string): Errors {
  const errors: Errors = {};
  if (!name) errors.name = "Enter your name.";
  if (!email) errors.email = "Enter your email address.";
  else if (!EMAIL_PATTERN.test(email)) errors.email = "Enter a valid email address.";
  if (password.length < 8) errors.password = "Password must be at least 8 characters.";
  return errors;
}

export function SignupForm() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [errors, setErrors] = useState<Errors>({});

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const name = String(data.get("name") ?? "").trim();
    const email = String(data.get("email") ?? "").trim();
    const password = String(data.get("password") ?? "");

    const fieldErrors = validate(name, email, password);
    setErrors(fieldErrors);
    if (Object.keys(fieldErrors).length > 0) {
      form.querySelector<HTMLInputElement>("[aria-invalid=true]")?.focus();
      return;
    }

    startTransition(async () => {
      const res = await authRequest("signup", { name, email, password });
      if (!res.ok) {
        // Field problems (e.g. email already registered) show under the field
        setErrors(res.fieldErrors ? { ...res.fieldErrors } : { form: res.error });
        return;
      }
      // Signed in right away; go back to where they came from (e.g. an invite)
      router.replace(safeRedirect(new URLSearchParams(window.location.search).get("redirectTo")));
    });
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-5">
      {errors.form ? <FormAlert>{errors.form}</FormAlert> : null}

      <Field id="name" label="Name" error={errors.name}>
        {(a11y) => (
          <TextInput {...a11y} name="name" autoComplete="name" placeholder="Alex Morgan" required disabled={pending} />
        )}
      </Field>

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

      <Field id="password" label="Password" error={errors.password} hint="At least 8 characters.">
        {(a11y) => (
          <PasswordInput {...a11y} name="password" autoComplete="new-password" minLength={8} required disabled={pending} />
        )}
      </Field>

      <SubmitButton pending={pending} pendingLabel="Creating account…">
        Create account
      </SubmitButton>
    </form>
  );
}
