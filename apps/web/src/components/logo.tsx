export function Logo({ className = "", textClassName = "" }: { className?: string; textClassName?: string }) {
  return (
    <span className={`inline-flex items-center gap-2 font-semibold tracking-tight ${className}`}>
      <span
        aria-hidden="true"
        className="grid size-8 place-items-center rounded-lg bg-emerald-600 text-white shadow-sm"
      >
        <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M19 7V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" />
          <path d="M21 12h-5a2 2 0 0 0 0 4h5v-4Z" />
        </svg>
      </span>
      <span className={textClassName}>Expense Tracker</span>
    </span>
  );
}
