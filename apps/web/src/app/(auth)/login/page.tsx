import type { Metadata } from "next";
import { AuthHeader } from "@/components/auth/ui";
import { AuthSwitchLink } from "@/components/auth/switch-link";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Sign in" };

export default function LoginPage() {
  return (
    <div className="space-y-8">
      <AuthHeader
        title="Welcome back"
        description="Sign in to keep tracking your expenses."
      />

      <LoginForm />

      <p className="text-center text-sm text-zinc-600 dark:text-zinc-400">
        Don&apos;t have an account?{" "}
        <AuthSwitchLink href="/signup">Create one</AuthSwitchLink>
      </p>
    </div>
  );
}
