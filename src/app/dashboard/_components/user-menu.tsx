"use client";

import Link from "next/link";
import { useEffect, useTransition } from "react";
import { Menu, menuItemClass } from "@/components/menu";
import { ThemeToggle } from "@/components/theme";
import { authClient } from "@/lib/auth-client";
import { saveDetectedTimezone } from "../actions/account";

export function UserMenu({ name, email, hasTimezone }: { name: string; email: string; hasTimezone: boolean }) {
  const [signingOut, startTransition] = useTransition();

  // First visit: store the browser's time zone so "today" and "this month" are right.
  useEffect(() => {
    if (hasTimezone) return;
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (tz) void saveDetectedTimezone(tz);
  }, [hasTimezone]);

  const initial = (name.trim()[0] ?? email[0] ?? "?").toUpperCase();

  return (
    <Menu
      label="Account menu"
      align="right"
      triggerClassName="grid size-9 place-items-center rounded-full bg-emerald-600 text-sm font-semibold text-white hover:bg-emerald-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600"
      trigger={<span aria-hidden="true">{initial}</span>}
    >
      {(close) => (
        <div className="space-y-1">
          <div className="px-2.5 pt-1.5 pb-2">
            <p className="truncate text-sm font-medium text-zinc-900 dark:text-zinc-50">{name}</p>
            <p className="truncate text-xs text-zinc-500 dark:text-zinc-400">{email}</p>
          </div>
          <div className="px-2.5 pb-2">
            <ThemeToggle />
          </div>
          <div className="h-px bg-zinc-100 dark:bg-zinc-800" />
          <Link href="/dashboard/account" onClick={close} className={menuItemClass}>
            Account settings
          </Link>
          <button
            type="button"
            disabled={signingOut}
            onClick={() =>
              startTransition(async () => {
                await authClient.signOut();
                // Full load so no signed-in data survives in the client router cache.
                window.location.replace("/login");
              })
            }
            className={menuItemClass}
          >
            {signingOut ? "Signing out…" : "Sign out"}
          </button>
        </div>
      )}
    </Menu>
  );
}
