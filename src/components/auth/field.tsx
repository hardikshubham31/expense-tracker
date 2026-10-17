import type { ComponentProps, ReactNode } from "react";

export const inputClass =
  "block w-full rounded-lg border bg-white px-3 py-2.5 text-sm text-zinc-900 shadow-xs outline-none transition " +
  "placeholder:text-zinc-400 focus-visible:ring-2 focus-visible:ring-emerald-500/40 " +
  "disabled:cursor-not-allowed disabled:opacity-60 " +
  "dark:bg-zinc-900 dark:text-zinc-100 dark:placeholder:text-zinc-500 " +
  "border-zinc-300 focus-visible:border-emerald-500 dark:border-zinc-700 " +
  "aria-invalid:border-red-500 aria-invalid:focus-visible:ring-red-500/30 dark:aria-invalid:border-red-400";

type FieldProps = {
  id: string;
  label: string;
  error?: string;
  hint?: string;
  labelAside?: ReactNode;
  children: (props: {
    id: string;
    "aria-invalid": boolean | undefined;
    "aria-describedby": string | undefined;
  }) => ReactNode;
};

export function Field({ id, label, error, hint, labelAside, children }: FieldProps) {
  const describedBy = error ? `${id}-error` : hint ? `${id}-hint` : undefined;

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <label htmlFor={id} className="text-sm font-medium text-zinc-800 dark:text-zinc-200">
          {label}
        </label>
        {labelAside}
      </div>
      {children({ id, "aria-invalid": error ? true : undefined, "aria-describedby": describedBy })}
      {error ? (
        <p id={`${id}-error`} className="text-sm text-red-600 dark:text-red-400">
          {error}
        </p>
      ) : hint ? (
        <p id={`${id}-hint`} className="text-xs text-zinc-500 dark:text-zinc-400">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

export function TextInput(props: ComponentProps<"input">) {
  return <input {...props} className={`${inputClass} ${props.className ?? ""}`} />;
}
