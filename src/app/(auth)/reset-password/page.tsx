import type { Metadata } from "next";
import { Suspense } from "react";
import { AuthHeader } from "@/components/auth/ui";
import { ResetPasswordForm } from "./reset-password-form";

export const metadata: Metadata = { title: "Choose a new password" };

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={<AuthHeader title="Choose a new password" description="Loading…" />}>
      <ResetPasswordForm />
    </Suspense>
  );
}
