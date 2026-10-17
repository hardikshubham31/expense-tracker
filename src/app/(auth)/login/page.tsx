import type { Metadata } from "next";
import { Suspense } from "react";
import { isGoogleConfigured } from "@/lib/auth-config";
import { GoogleButton } from "@/components/auth/google-button";
import { AuthHeader, Divider } from "@/components/auth/ui";
import { AuthSwitchLink } from "@/components/auth/switch-link";
import { LoginForm } from "./login-form";
import { OAuthErrorNotice } from "./oauth-error-notice";

export const metadata: Metadata = { title: "Sign in" };

export default function LoginPage() {
  return (
    <div className="space-y-8">
      <AuthHeader
        title="Welcome back"
        description="Sign in to keep tracking your expenses."
      />

      <Suspense fallback={null}>
        <OAuthErrorNotice />
      </Suspense>

      <div className="space-y-6">
        <GoogleButton enabled={isGoogleConfigured} label="Continue with Google" />
        <Divider label="or" />
        <LoginForm />
      </div>

      <p className="text-center text-sm text-zinc-600 dark:text-zinc-400">
        Don&apos;t have an account?{" "}
        <AuthSwitchLink href="/signup">Create one</AuthSwitchLink>
      </p>
    </div>
  );
}
