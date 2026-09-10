"use client";

import { useState } from "react";
import { useCompanies } from "@/lib/useCompanies";
import { AccessIssuesBanner } from "@/components/AccessIssuesBanner";

/** Site-wide "why isn't this synced" alert — shown on every dashboard page
 * (not just Company Analytics) so a sync problem or an unregistered new tab
 * is visible the moment it happens, instead of only surfacing when someone
 * happens to be looking at the one page that used to show it. Collapsed to a
 * one-line summary by default since it can appear on every page; expands to
 * the full per-company breakdown on click. */
export function GlobalSyncAlert() {
  const companies = useCompanies();
  const [expanded, setExpanded] = useState(false);

  const broken = companies.filter((c) => c.sync_status === "error");
  const newTabs = companies.filter((c) => c.new_tabs_detected);
  const total = broken.length + newTabs.length;
  if (total === 0) return null;

  return (
    <div className="border-b border-line bg-warning-soft px-8 py-2">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-center gap-2 text-sm font-medium text-ink"
      >
        <svg
          viewBox="0 0 20 20"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="h-4 w-4 shrink-0 text-warning"
        >
          <path d="M10 2.5l8 14H2l8-14z" />
          <path d="M10 8v3.5M10 14.2v.3" />
        </svg>
        <span>
          {total} {total === 1 ? "company needs" : "companies need"} attention — data may not be fully synced
        </span>
        <span className="ml-auto text-ink-muted">{expanded ? "Hide details" : "Show details"}</span>
      </button>
      {expanded && (
        <div className="pt-3">
          <AccessIssuesBanner companies={companies} />
        </div>
      )}
    </div>
  );
}
