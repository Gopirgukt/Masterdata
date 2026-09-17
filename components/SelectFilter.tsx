export function SelectFilter({
  value,
  onChange,
  options,
  placeholder,
  getLabel,
}: {
  value: string;
  onChange: (value: string) => void;
  options: string[];
  placeholder: string;
  /** Displays a friendlier label than the raw option value (e.g. a "2026-09"
   * month key rendered as "September 2026") without changing what's stored. */
  getLabel?: (option: string) => string;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="rounded-md border border-line-strong bg-surface text-ink text-sm px-3 py-2 outline-none transition-colors hover:border-ink-muted focus:border-accent focus:ring-2 focus:ring-accent-soft"
      suppressHydrationWarning
    >
      <option value="">{placeholder}</option>
      {options.map((o) => (
        <option key={o} value={o}>
          {getLabel ? getLabel(o) : o}
        </option>
      ))}
    </select>
  );
}
