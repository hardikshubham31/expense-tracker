"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, type ReactNode } from "react";
import { linkClass } from "./ui";

function Inner({ href, children }: { href: string; children: ReactNode }) {
  const redirectTo = useSearchParams().get("redirectTo");
  return (
    <Link href={redirectTo ? `${href}?redirectTo=${encodeURIComponent(redirectTo)}` : href} className={linkClass}>
      {children}
    </Link>
  );
}

/** Link between /login and /signup that carries ?redirectTo= along (e.g. from an invite). */
export function AuthSwitchLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Suspense
      fallback={
        <Link href={href} className={linkClass}>
          {children}
        </Link>
      }
    >
      <Inner href={href}>{children}</Inner>
    </Suspense>
  );
}
