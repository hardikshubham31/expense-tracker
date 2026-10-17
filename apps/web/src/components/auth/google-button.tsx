"use client";

import { useState } from "react";
import { safeRedirect } from "@expense/shared/redirect";
import { Spinner } from "./ui";

export function GoogleButton({ enabled, label }: { enabled: boolean; label: string }) {
  const [pending, setPending] = useState(false);

  // The API runs the whole Google OAuth flow and redirects back here when done
  function handleClick() {
    setPending(true);
    const redirectTo = safeRedirect(new URLSearchParams(window.location.search).get("redirectTo"));
    // A full page load on purpose: /api/auth/google is the API (via rewrite), not a Next.js page
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
    window.location.assign(`/api/auth/google?redirectTo=${encodeURIComponent(redirectTo)}`);
  }

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={handleClick}
        disabled={!enabled || pending}
        aria-busy={pending}
        aria-describedby={enabled ? undefined : "google-unavailable"}
        className="inline-flex w-full items-center justify-center gap-2.5 rounded-lg border border-zinc-300 bg-white px-4 py-2.5 text-sm font-medium text-zinc-800 shadow-xs transition hover:bg-zinc-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600 disabled:cursor-not-allowed disabled:opacity-60 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:bg-zinc-800"
      >
        {pending ? <Spinner /> : <GoogleIcon />}
        {label}
      </button>
      {enabled ? null : (
        <p id="google-unavailable" className="text-center text-xs text-zinc-500 dark:text-zinc-400">
          Google sign-in isn&apos;t configured yet.
        </p>
      )}
    </div>
  );
}

function GoogleIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="size-4.5">
      <path fill="#4285F4" d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.5h6.5a5.6 5.6 0 0 1-2.4 3.6v3h3.9c2.2-2.1 3.5-5.1 3.5-8.8Z" />
      <path fill="#34A853" d="M12 24c3.2 0 6-1.1 7.9-2.9l-3.9-3c-1 .7-2.4 1.2-4 1.2-3.1 0-5.7-2.1-6.7-4.9h-4v3.1A12 12 0 0 0 12 24Z" />
      <path fill="#FBBC05" d="M5.3 14.4a7.2 7.2 0 0 1 0-4.7V6.6h-4a12 12 0 0 0 0 10.8l4-3Z" />
      <path fill="#EA4335" d="M12 4.8c1.8 0 3.3.6 4.6 1.8l3.4-3.4A11.9 11.9 0 0 0 1.3 6.6l4 3.1C6.3 6.9 8.9 4.8 12 4.8Z" />
    </svg>
  );
}
