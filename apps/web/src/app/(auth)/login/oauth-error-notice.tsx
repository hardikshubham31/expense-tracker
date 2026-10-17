"use client";

import { useSearchParams } from "next/navigation";
import { FormAlert } from "@/components/auth/ui";

export function OAuthErrorNotice() {
  const error = useSearchParams().get("error");
  // Set by errorCallbackURL in the Google button
  return error === "oauth" ? <FormAlert>We couldn&apos;t sign you in with Google. Please try again.</FormAlert> : null;
}
