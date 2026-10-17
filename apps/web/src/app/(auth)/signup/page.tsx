import type { Metadata } from "next";
import { isGoogleConfigured } from "@/lib/auth-config";
import { GoogleButton } from "@/components/auth/google-button";
import { AuthHeader, Divider } from "@/components/auth/ui";
import { AuthSwitchLink } from "@/components/auth/switch-link";
import { SignupForm } from "./signup-form";

export const metadata: Metadata = { title: "Create account" };

export default function SignupPage() {
  return (
    <div className="space-y-8">
      <AuthHeader
        title="Create your account"
        description="Start tracking your spending in under a minute."
      />

      <div className="space-y-6">
        <GoogleButton enabled={isGoogleConfigured} label="Sign up with Google" />
        <Divider label="or" />
        <SignupForm />
      </div>

      <p className="text-center text-sm text-zinc-600 dark:text-zinc-400">
        Already have an account?{" "}
        <AuthSwitchLink href="/login">Sign in</AuthSwitchLink>
      </p>
    </div>
  );
}
