import type { Company } from "@/lib/types";

export function AccessIssuesBanner({ companies }: { companies: Company[] }) {
  const broken = companies.filter((c) => c.sync_status === "error");
  if (broken.length === 0) return null;

  return (
    <div className="flex items-start gap-3 rounded-lg border border-danger/40 bg-danger-soft px-4 py-3 text-sm text-ink">
      <svg
        viewBox="0 0 20 20"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="h-5 w-5 shrink-0 text-danger mt-0.5"
      >
        <path d="M10 2.5l8 14H2l8-14z" />
        <path d="M10 8v3.5M10 14.2v.3" />
      </svg>
      <div className="flex flex-col gap-1.5">
        <div className="font-medium">
          {broken.length} {broken.length === 1 ? "company" : "companies"} not syncing
        </div>
        <ul className="flex flex-col gap-1">
          {broken.map((c) => (
            <li key={c.id} className="text-ink-secondary">
              <span className="font-medium text-ink">{c.name}</span> — {c.sync_error ?? "Unknown error"}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
