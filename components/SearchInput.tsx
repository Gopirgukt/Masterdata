export function SearchInput({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
}) {
  return (
    <div className="relative w-full max-w-md">
      <svg
        viewBox="0 0 20 20"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-muted"
      >
        <circle cx="8.5" cy="8.5" r="5.5" />
        <path d="M17 17l-4-4" />
      </svg>
      <input
        type="text"
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-md border border-line-strong bg-surface text-ink text-sm pl-9 pr-3 py-2 outline-none transition-colors placeholder:text-ink-muted hover:border-ink-muted focus:border-accent focus:ring-2 focus:ring-accent-soft"
        suppressHydrationWarning
      />
    </div>
  );
}
