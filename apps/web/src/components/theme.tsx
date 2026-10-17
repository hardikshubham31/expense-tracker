"use client";

import { useSyncExternalStore } from "react";

export type ThemePreference = "system" | "light" | "dark";

declare global {
  interface Window {
    __setTheme?: (pref: ThemePreference) => void;
  }
}

/**
 * Runs synchronously in <head> before first paint: applies the saved theme (or
 * the OS preference), follows OS changes while on "system", and exposes
 * window.__setTheme for the toggle.
 */
export const THEME_SCRIPT = `(function(){var m=matchMedia("(prefers-color-scheme: dark)");function p(){try{return localStorage.getItem("theme")||"system"}catch(e){return"system"}}function a(){var t=p(),d=t==="dark"||(t==="system"&&m.matches),r=document.documentElement;r.dataset.theme=d?"dark":"light";r.dataset.themePref=t;window.dispatchEvent(new Event("themechange"))}window.__setTheme=function(t){try{localStorage.setItem("theme",t)}catch(e){}a()};m.addEventListener("change",a);a()})()`;

/** Inline script that only executes on the server-rendered HTML (React warns about client <script>). */
export function ThemeScript() {
  return (
    <script
      type={typeof window === "undefined" ? "text/javascript" : "text/plain"}
      suppressHydrationWarning
      dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }}
    />
  );
}

function subscribe(onChange: () => void) {
  window.addEventListener("themechange", onChange);
  return () => window.removeEventListener("themechange", onChange);
}

const getPref = () => (document.documentElement.dataset.themePref as ThemePreference | undefined) ?? "system";

export function useThemePreference() {
  const pref = useSyncExternalStore(subscribe, getPref, () => "system" as ThemePreference);
  return [pref, (next: ThemePreference) => window.__setTheme?.(next)] as const;
}

const OPTIONS: { value: ThemePreference; label: string; icon: React.ReactNode }[] = [
  {
    value: "light",
    label: "Light",
    icon: (
      <svg aria-hidden="true" viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
        <circle cx="12" cy="12" r="4" />
        <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
      </svg>
    ),
  },
  {
    value: "dark",
    label: "Dark",
    icon: (
      <svg aria-hidden="true" viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z" />
      </svg>
    ),
  },
  {
    value: "system",
    label: "System",
    icon: (
      <svg aria-hidden="true" viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="2" y="4" width="20" height="13" rx="2" />
        <path d="M8 21h8M12 17v4" />
      </svg>
    ),
  },
];

/** Segmented Light / Dark / System control. */
export function ThemeToggle({ compact = false }: { compact?: boolean }) {
  const [pref, setPref] = useThemePreference();
  return (
    <div role="radiogroup" aria-label="Theme" className="inline-flex rounded-lg border border-zinc-200 bg-zinc-50 p-0.5 dark:border-zinc-700 dark:bg-zinc-800">
      {OPTIONS.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={pref === o.value}
          aria-label={compact ? `${o.label} theme` : undefined}
          title={compact ? `${o.label} theme` : undefined}
          onClick={() => setPref(o.value)}
          className={`inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium transition focus-visible:outline-2 focus-visible:outline-emerald-600 ${
            pref === o.value
              ? "bg-white text-zinc-900 shadow-xs dark:bg-zinc-950 dark:text-zinc-50"
              : "text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200"
          }`}
        >
          {o.icon}
          {compact ? null : o.label}
        </button>
      ))}
    </div>
  );
}
