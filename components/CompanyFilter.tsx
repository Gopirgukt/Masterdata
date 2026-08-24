export function CompanyFilter({
  companies,
  value,
  onChange,
}: {
  companies: { id: string; name: string }[];
  value: string;
  onChange: (companyId: string) => void;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="rounded-md border border-line-strong bg-surface text-ink text-sm px-3 py-2 outline-none transition-colors hover:border-ink-muted focus:border-accent focus:ring-2 focus:ring-accent-soft"
      suppressHydrationWarning
    >
      <option value="">All companies</option>
      {companies.map((c) => (
        <option key={c.id} value={c.id}>
          {c.name}
        </option>
      ))}
    </select>
  );
}
