import type { ComponentProps, ReactNode } from "react";

export function SubmitButton({
  pending,
  pendingLabel,
  children,
  ...props
}: ComponentProps<"button"> & { pending: boolean; pendingLabel: string }) {
  return (
    <button
      {...props}
      type="submit"
      disabled={pending || props.disabled}
      aria-busy={pending}
      className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600 disabled:cursor-not-allowed disabled:opacity-70"
    >
      {pending ? <Spinner /> : null}
      {pending ? pendingLabel : children}
    </button>
  );
}

export function Spinner() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="size-4 animate-spin" fill="none">
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeOpacity="0.25" strokeWidth="4" />
      <path d="M22 12a10 10 0 0 0-10-10" stroke="currentColor" strokeWidth="4" strokeLinecap="round" />
    </svg>
  );
}

export function FormAlert({
  tone = "error",
  children,
}: {
  tone?: "error" | "success";
  children: ReactNode;
}) {
  const styles =
    tone === "error"
      ? "border-red-200 bg-red-50 text-red-800 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300"
      : "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900/60 dark:bg-emerald-950/40 dark:text-emerald-300";

  return (
    <div role={tone === "error" ? "alert" : "status"} className={`rounded-lg border px-3.5 py-3 text-sm ${styles}`}>
      {children}
    </div>
  );
}

export function AuthHeader({ title, description }: { title: string; description: ReactNode }) {
  return (
    <div className="space-y-2">
      <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">{title}</h1>
      <p className="text-sm text-zinc-600 dark:text-zinc-400">{description}</p>
    </div>
  );
}

export const linkClass =
  "font-medium text-emerald-700 underline-offset-4 hover:underline focus-visible:rounded-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600 dark:text-emerald-400";
