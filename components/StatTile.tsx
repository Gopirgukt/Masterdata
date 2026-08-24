export function StatTile({
  label,
  value,
  accent = "accent",
  onClick,
  active = false,
}: {
  label: string;
  value: string | number;
  accent?: "accent" | "success" | "warning" | "danger";
  onClick?: () => void;
  active?: boolean;
}) {
  const barColor = {
    accent: "bg-accent",
    success: "bg-success",
    warning: "bg-warning",
    danger: "bg-danger",
  }[accent];

  const Tag = onClick ? "button" : "div";

  return (
    <Tag
      onClick={onClick}
      className={`relative w-full overflow-hidden rounded-lg border bg-surface px-5 py-4 text-left transition-shadow ${
        onClick ? "cursor-pointer hover:shadow-sm" : ""
      } ${active ? "border-accent ring-1 ring-accent" : "border-line"}`}
    >
      <span className={`absolute inset-y-0 left-0 w-1 ${barColor}`} />
      <div className="text-sm text-ink-secondary">{label}</div>
      <div className="mt-1 text-3xl font-semibold text-ink">{value}</div>
    </Tag>
  );
}
