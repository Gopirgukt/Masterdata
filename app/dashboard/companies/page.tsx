"use client";

import { Fragment, Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useCompanies } from "@/lib/useCompanies";
import { fetchAllRows } from "@/lib/fetchAllRows";
import { useSyncVersion } from "@/lib/useSyncVersion";
import { usePagedReveal } from "@/lib/usePagedReveal";
import { computeRange } from "@/lib/dateRange";
import { categorizeStatus, dashIfEmpty, statusToneClass } from "@/lib/format";
import { CompanyFilter } from "@/components/CompanyFilter";
import { SelectFilter } from "@/components/SelectFilter";
import { StatTile } from "@/components/StatTile";
import { Badge } from "@/components/Badge";
import { ShowMoreButton } from "@/components/ShowMoreButton";
import { CandidateFeedbackModal } from "@/components/CandidateFeedbackModal";
import { Table, Th, Td, Tr, EmptyRow, LoadingRow } from "@/components/Table";
import type { CandidateWithCompany } from "@/lib/types";

// One page for what used to be two (merged 2026-10-08): "Summary" is one row
// per company (formerly Company Analytics), "Candidates" one row per shared
// candidate (formerly the Company Sheet page, which now redirects here).
// Both views share the period + company filters, and every number in the
// summary opens the candidate list behind it, so the two always agree.

type View = "summary" | "candidates";

const ROUNDS = [
  { key: "screening_status", label: "Initial screening" },
  { key: "tr1_status", label: "TR 1" },
  { key: "tr2_status", label: "TR 2" },
  { key: "hr_mr_status", label: "HR/MR" },
] as const;
type RoundKey = (typeof ROUNDS)[number]["key"];
const ROUND_FILTER_FIELDS = [...ROUNDS, { key: "hired_status", label: "Hired" }] as const;
type RoundFilterKey = (typeof ROUND_FILTER_FIELDS)[number]["key"];

// Tech result of a shared candidate. "Other" = no tech result recorded, or
// rejected at tech but shared anyway — confirmed 2026-10-08 that 879 of 2,003
// shared candidates have no tech result at all, so leaving them out (as the
// Interviewer Report's tech-focused Analysis does) would hide half of them.
const TECH_BUCKETS = ["P1", "P2", "P3", "Hold", "Other"] as const;
type TechBucket = (typeof TECH_BUCKETS)[number];
function techBucket(status: string | null): TechBucket {
  const c = categorizeStatus(status);
  return c === "Reject" || c === "Other" ? "Other" : c;
}

const norm = (s: string | null | undefined) => (s ?? "").trim().toLowerCase();

// The date a shared candidate is filtered by: tech screening, else the call,
// else sourcing — whichever the sheet actually has (tech-screening date alone
// covers only ~60% of shared candidates).
function activityDate(c: CandidateWithCompany): string | null {
  return c.tech_screening_date ?? c.call_date ?? c.sourced_date ?? null;
}

function notMarkedInternally(c: CandidateWithCompany): boolean {
  return !!c.in_company_sheet && c.shared_in_internal_sheet === false;
}

function shortDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function monthLabel(key: string): string {
  const [y, m] = key.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString("en-US", { month: "long", year: "numeric" });
}

function pct(part: number, whole: number): string {
  return whole > 0 ? `${Math.round((part / whole) * 100)}%` : "-";
}

type SummaryRow = {
  id: string;
  name: string;
  shared: number;
  tech: Record<TechBucket, number>;
  notMarked: number;
  rounds: Record<RoundKey, { selected: number; rejected: number }>;
  hired: number;
};

function emptySummary(id: string, name: string): SummaryRow {
  return {
    id,
    name,
    shared: 0,
    tech: { P1: 0, P2: 0, P3: 0, Hold: 0, Other: 0 },
    notMarked: 0,
    rounds: {
      screening_status: { selected: 0, rejected: 0 },
      tr1_status: { selected: 0, rejected: 0 },
      tr2_status: { selected: 0, rejected: 0 },
      hr_mr_status: { selected: 0, rejected: 0 },
    },
    hired: 0,
  };
}

/** Where a click in the summary takes you in the Candidates view. */
type Drill = { companyId: string; tech?: TechBucket; notMarked?: boolean; round?: [RoundFilterKey, string] };

const th = "px-3 py-2.5 text-left font-medium text-ink-secondary whitespace-nowrap";
const groupTh = "px-3 pt-2 pb-1 text-left text-xs font-semibold uppercase tracking-wide text-ink-secondary";
const td = "px-3 py-2.5 border-t border-line whitespace-nowrap";
const SUMMARY_COLS = 1 + 1 + TECH_BUCKETS.length + 1 + ROUNDS.length * 3 + 1;

const inputClass =
  "rounded-md border border-line-strong bg-surface text-ink text-sm px-3 py-2 outline-none transition-colors hover:border-ink-muted focus:border-accent focus:ring-2 focus:ring-accent-soft";

function CompaniesInner() {
  const router = useRouter();
  const params = useSearchParams();
  const companies = useCompanies();
  const syncVersion = useSyncVersion();
  const [candidates, setCandidates] = useState<CandidateWithCompany[]>([]);
  const [loading, setLoading] = useState(true);

  // Shared filters (both views).
  const [view, setView] = useState<View>(params.get("view") === "candidates" ? "candidates" : "summary");
  const [period, setPeriod] = useState(params.get("period") ?? "all");
  const [customStart, setCustomStart] = useState(params.get("from") ?? "");
  const [customEnd, setCustomEnd] = useState(params.get("to") ?? "");
  const [companyId, setCompanyId] = useState(params.get("company") ?? "");
  // Candidates-view filters.
  const [tech, setTech] = useState(params.get("tech") ?? "");
  const [onlyNotMarked, setOnlyNotMarked] = useState(params.get("notMarked") === "1");
  const [roundFilters, setRoundFilters] = useState<Record<string, string>>(() =>
    Object.fromEntries(ROUND_FILTER_FIELDS.map(({ key }) => [key, params.get(key) ?? ""]).filter(([, v]) => v)),
  );
  const [feedbackFor, setFeedbackFor] = useState<CandidateWithCompany | null>(null);

  useEffect(() => {
    const supabase = createClient();
    setLoading(true);
    fetchAllRows<CandidateWithCompany>((start, end) =>
      supabase
        .from("candidates")
        .select(
          "id, name, company_id, companies(name), shared_in_internal_sheet, in_company_sheet, tech_screening_date, call_date, sourced_date, screening_status, tr1_status, tr2_status, hr_mr_status, hired_status, job_role, call_done_by, call_status, call_remarks, interested, tr_status, tr_tech_rating, tr_comm_rating, tr_remarks, tech_screening_taken_by, tech_status, tech_tech_rating, tech_comm_rating, tech_remarks",
        )
        .eq("shared_to_company", true)
        .range(start, end),
    ).then((data) => {
      setCandidates(data);
      setLoading(false);
    });
  }, [syncVersion]);

  // Keep the URL in step so a filtered view can be bookmarked or shared.
  useEffect(() => {
    const q = new URLSearchParams();
    if (view === "candidates") q.set("view", "candidates");
    if (period !== "all") q.set("period", period);
    if (period === "custom" && customStart) q.set("from", customStart);
    if (period === "custom" && customEnd) q.set("to", customEnd);
    if (companyId) q.set("company", companyId);
    if (view === "candidates") {
      if (tech) q.set("tech", tech);
      if (onlyNotMarked) q.set("notMarked", "1");
      for (const [k, v] of Object.entries(roundFilters)) if (v) q.set(k, v);
    }
    const qs = q.toString();
    router.replace(qs ? `?${qs}` : "?", { scroll: false });
  }, [view, period, customStart, customEnd, companyId, tech, onlyNotMarked, roundFilters, router]);

  // Period → date range. "month:YYYY-MM" entries come from the data itself.
  const range = (() => {
    if (period === "all") return null;
    if (period.startsWith("month:")) {
      const m = period.slice(6);
      const [y, mo] = m.split("-").map(Number);
      const last = new Date(Date.UTC(y, mo, 0)).getUTCDate();
      return { start: `${m}-01`, end: `${m}-${String(last).padStart(2, "0")}` };
    }
    return computeRange(period as "this_week" | "this_month" | "custom", customStart, customEnd);
  })();
  const thisYear = new Date().getFullYear();
  const monthOptions = Array.from(
    new Set(
      candidates
        .map((c) => activityDate(c)?.slice(0, 7))
        .filter((m): m is string => !!m && Number(m.slice(0, 4)) <= thisYear && Number(m.slice(0, 4)) >= thisYear - 2),
    ),
  ).sort((a, b) => (a < b ? 1 : -1));

  const inPeriod = candidates.filter((c) => {
    if (!range) return true;
    const d = activityDate(c);
    return !!d && d >= range.start && d <= range.end;
  });
  const inScope = inPeriod.filter((c) => !companyId || c.company_id === companyId);

  // ----- Summary -----
  const byCompany = new Map<string, SummaryRow>();
  for (const c of inScope) {
    const row = byCompany.get(c.company_id) ?? emptySummary(c.company_id, c.companies?.name ?? "Unknown");
    byCompany.set(c.company_id, row);
    row.shared++;
    row.tech[techBucket(c.tech_status)]++;
    if (notMarkedInternally(c)) row.notMarked++;
    for (const r of ROUNDS) {
      const s = norm(c[r.key]);
      if (s === "selected") row.rounds[r.key].selected++;
      else if (s === "rejected") row.rounds[r.key].rejected++;
    }
    if (norm(c.hired_status) === "hired") row.hired++;
  }
  const summaryRows = Array.from(byCompany.values()).sort((a, b) => b.shared - a.shared);
  const total = emptySummary("", "Total");
  for (const r of summaryRows) {
    total.shared += r.shared;
    for (const b of TECH_BUCKETS) total.tech[b] += r.tech[b];
    total.notMarked += r.notMarked;
    for (const k of ROUNDS) {
      total.rounds[k.key].selected += r.rounds[k.key].selected;
      total.rounds[k.key].rejected += r.rounds[k.key].rejected;
    }
    total.hired += r.hired;
  }

  const drill = (d: Drill) => {
    setCompanyId(d.companyId);
    setTech(d.tech ?? "");
    setOnlyNotMarked(!!d.notMarked);
    setRoundFilters(d.round ? { [d.round[0]]: d.round[1] } : {});
    setView("candidates");
    window.scrollTo({ top: 0 });
  };

  const num = (n: number, d: Drill, className = "") =>
    n === 0 ? (
      <span className="text-ink-muted">-</span>
    ) : (
      <button
        type="button"
        onClick={() => drill(d)}
        title="Click to see these candidates"
        className={`underline decoration-dotted decoration-ink-muted underline-offset-4 hover:decoration-current ${className}`}
      >
        {n}
      </button>
    );

  const summaryCells = (r: SummaryRow, bold = false) => {
    const b = bold ? " font-semibold" : "";
    const id = r.id; // "" on the Total row → all companies
    return (
      <>
        <td className={`${td} text-ink${b}`}>{num(r.shared, { companyId: id })}</td>
        {TECH_BUCKETS.map((k) => (
          <td key={k} className={`${td} text-ink${b} ${k === "P1" ? "border-l border-line" : ""}`}>
            {num(r.tech[k], { companyId: id, tech: k })}
          </td>
        ))}
        <td className={`${td} border-l border-line text-warning${b}`}>
          {num(r.notMarked, { companyId: id, notMarked: true })}
        </td>
        {ROUNDS.map((k) => {
          const t = r.rounds[k.key];
          const done = t.selected + t.rejected;
          return (
            <Fragment key={k.key}>
              <td className={`${td} border-l border-line text-success${b}`}>
                {num(t.selected, { companyId: id, round: [k.key, "Selected"] })}
              </td>
              <td className={`${td} text-danger${b}`}>{num(t.rejected, { companyId: id, round: [k.key, "Rejected"] })}</td>
              <td className={`${td} ${done ? "text-ink" : "text-ink-muted"}${b}`}>{pct(t.selected, done)}</td>
            </Fragment>
          );
        })}
        <td className={`${td} border-l border-line font-medium text-success${b}`}>
          {num(r.hired, { companyId: id, round: ["hired_status", "Hired"] })}
        </td>
      </>
    );
  };

  // ----- Candidates -----
  const roundOptions: Record<string, string[]> = {};
  for (const { key } of ROUND_FILTER_FIELDS) {
    roundOptions[key] = Array.from(new Set(inScope.map((c) => (c[key] ?? "").trim()).filter(Boolean))).sort();
  }
  const candidateRows = inScope
    .filter((c) => {
      if (tech && techBucket(c.tech_status) !== tech) return false;
      if (onlyNotMarked && !notMarkedInternally(c)) return false;
      for (const { key } of ROUND_FILTER_FIELDS) {
        const wanted = roundFilters[key];
        if (wanted && norm(c[key]) !== norm(wanted)) return false;
      }
      return true;
    })
    .sort((a, b) => (activityDate(b) ?? "").localeCompare(activityDate(a) ?? ""));
  const filterKey = `${period}|${customStart}|${customEnd}|${companyId}|${tech}|${onlyNotMarked}|${JSON.stringify(roundFilters)}`;
  const { visible, showMore, total: candidateTotal, visibleCount } = usePagedReveal(candidateRows, 30, filterKey);
  const notMarkedCount = inScope.filter(notMarkedInternally).length;
  const anyCandidateFilter = !!tech || onlyNotMarked || Object.values(roundFilters).some(Boolean);

  const tabClass = (active: boolean) =>
    `rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
      active ? "bg-surface text-ink shadow-sm" : "text-ink-secondary hover:text-ink"
    }`;

  return (
    <div className="flex flex-col gap-6">
      {/* Shared filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="inline-flex rounded-lg border border-line bg-surface-hover p-1" role="tablist">
          <button role="tab" aria-selected={view === "summary"} onClick={() => setView("summary")} className={tabClass(view === "summary")}>
            Summary
          </button>
          <button
            role="tab"
            aria-selected={view === "candidates"}
            onClick={() => setView("candidates")}
            className={tabClass(view === "candidates")}
          >
            Candidates
          </button>
        </div>
        <select value={period} onChange={(e) => setPeriod(e.target.value)} className={inputClass} suppressHydrationWarning>
          <option value="all">All time</option>
          <option value="this_week">This week</option>
          <option value="this_month">This month</option>
          <option value="custom">Custom range</option>
          {monthOptions.length > 0 && (
            <optgroup label="Month">
              {monthOptions.map((m) => (
                <option key={m} value={`month:${m}`}>
                  {monthLabel(m)}
                </option>
              ))}
            </optgroup>
          )}
        </select>
        {period === "custom" && (
          <>
            <input type="date" value={customStart} onChange={(e) => setCustomStart(e.target.value)} className={inputClass} />
            <span className="text-sm text-ink-muted">to</span>
            <input type="date" value={customEnd} onChange={(e) => setCustomEnd(e.target.value)} className={inputClass} />
          </>
        )}
        <CompanyFilter companies={companies} value={companyId} onChange={setCompanyId} />
      </div>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <StatTile label="Shared to company" value={loading ? "…" : total.shared} accent="accent" />
        <StatTile
          label="Not marked in internal sheet"
          value={loading ? "…" : total.notMarked}
          accent="warning"
          onClick={total.notMarked ? () => drill({ companyId, notMarked: true }) : undefined}
        />
        <StatTile label="Hired" value={loading ? "…" : total.hired} accent="success" />
        <StatTile label="Shared → hired" value={loading ? "…" : pct(total.hired, total.shared)} accent="success" />
      </div>

      <p className="-mt-2 text-xs text-ink-secondary">
        Counts every candidate shared with a company — marked &ldquo;Yes&rdquo; in the internal sheet or found in the
        Company Sheet. The period uses the tech-screening date, else the call date, else the sourcing date.
        {view === "summary" && " Click any underlined number to see those candidates."} (The Interviewer Report&rsquo;s
        Analysis counts only tech-screened P1/P2/P3/Hold candidates, so its totals are smaller.)
      </p>

      {view === "summary" ? (
        <div className="overflow-x-auto rounded-lg border border-line bg-surface">
          <table className="w-full text-sm">
            <thead className="bg-surface-hover">
              <tr>
                <th className={`${groupTh} sticky left-0 z-10 bg-surface-hover`} />
                <th className={groupTh} />
                <th className={`${groupTh} border-l border-line`} colSpan={TECH_BUCKETS.length}>
                  Tech result
                </th>
                <th className={`${groupTh} border-l border-line`} />
                {ROUNDS.map((r) => (
                  <th key={r.key} className={`${groupTh} border-l border-line`} colSpan={3}>
                    {r.label}
                  </th>
                ))}
                <th className={`${groupTh} border-l border-line`} />
              </tr>
              <tr className="border-b border-line">
                <th className={`${th} sticky left-0 z-10 bg-surface-hover`}>Company</th>
                <th className={th}>Shared</th>
                {TECH_BUCKETS.map((k) => (
                  <th
                    key={k}
                    className={`${th} ${k === "P1" ? "border-l border-line" : ""}`}
                    title={k === "Other" ? "No tech result recorded, or rejected at tech but shared anyway" : undefined}
                  >
                    {k}
                  </th>
                ))}
                <th className={`${th} border-l border-line`}>Not marked internally</th>
                {ROUNDS.map((r) => (
                  <Fragment key={r.key}>
                    <th className={`${th} border-l border-line`}>Selected</th>
                    <th className={th}>Rejected</th>
                    <th className={th}>Select %</th>
                  </Fragment>
                ))}
                <th className={`${th} border-l border-line`}>Hired</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <LoadingRow colSpan={SUMMARY_COLS} />
              ) : summaryRows.length === 0 ? (
                <EmptyRow colSpan={SUMMARY_COLS} label="No shared candidates in this period" />
              ) : (
                summaryRows.map((r) => (
                  <tr key={r.id} className="transition-colors hover:bg-surface-hover">
                    <td className={`${td} sticky left-0 z-10 bg-surface font-medium text-ink`}>
                      <button
                        type="button"
                        onClick={() => drill({ companyId: r.id })}
                        className="hover:text-accent hover:underline"
                        title="See this company's shared candidates"
                      >
                        {r.name}
                      </button>
                    </td>
                    {summaryCells(r)}
                  </tr>
                ))
              )}
            </tbody>
            {!loading && summaryRows.length > 1 && (
              <tfoot className="bg-surface-hover">
                <tr>
                  <td className={`${td} sticky left-0 z-10 bg-surface-hover font-semibold text-ink`}>Total</td>
                  {summaryCells({ ...total, id: companyId }, true)}
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-3">
            <SelectFilter value={tech} onChange={setTech} options={[...TECH_BUCKETS]} placeholder="All tech results" />
            {ROUND_FILTER_FIELDS.map(({ key, label }) => (
              <SelectFilter
                key={key}
                value={roundFilters[key] ?? ""}
                onChange={(v) => setRoundFilters((prev) => ({ ...prev, [key]: v }))}
                options={roundOptions[key]}
                placeholder={`All ${label}`}
              />
            ))}
            <button
              onClick={() => setOnlyNotMarked((v) => !v)}
              aria-pressed={onlyNotMarked}
              className={`rounded-md border px-3 py-2 text-sm transition-colors ${
                onlyNotMarked
                  ? "border-warning bg-warning-soft text-warning"
                  : "border-line-strong bg-surface text-ink-secondary hover:border-ink-muted hover:text-ink"
              }`}
            >
              Not marked &ldquo;Yes&rdquo; in internal sheet{loading ? "" : ` (${notMarkedCount})`}
            </button>
            {anyCandidateFilter && (
              <button
                onClick={() => {
                  setTech("");
                  setOnlyNotMarked(false);
                  setRoundFilters({});
                }}
                className="text-sm text-accent hover:underline"
              >
                Clear filters
              </button>
            )}
          </div>

          <div className="text-sm text-ink-secondary">
            Showing {visibleCount} of {candidateTotal} shared candidates
          </div>

          <Table>
            <thead>
              <tr>
                <Th>Candidate</Th>
                <Th>Company</Th>
                <Th>Date</Th>
                <Th>Tech result</Th>
                <Th>Internal sheet</Th>
                {ROUND_FILTER_FIELDS.map(({ key, label }) => (
                  <Th key={key}>{label}</Th>
                ))}
                <Th>Feedback</Th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <LoadingRow colSpan={6 + ROUND_FILTER_FIELDS.length} />
              ) : visible.length === 0 ? (
                <EmptyRow colSpan={6 + ROUND_FILTER_FIELDS.length} />
              ) : (
                visible.map((c) => {
                  const d = activityDate(c);
                  return (
                    <Tr key={c.id}>
                      <Td className="font-medium">{dashIfEmpty(c.name)}</Td>
                      <Td>{c.companies?.name ?? "-"}</Td>
                      <Td className="whitespace-nowrap">{d ? shortDate(d) : "-"}</Td>
                      <Td>{dashIfEmpty(c.tech_status)}</Td>
                      <Td>
                        {notMarkedInternally(c) ? (
                          <Badge tone="warning">Not marked</Badge>
                        ) : c.shared_in_internal_sheet ? (
                          "Yes"
                        ) : (
                          "-"
                        )}
                      </Td>
                      {ROUND_FILTER_FIELDS.map(({ key }) => (
                        <Td key={key} className={statusToneClass(c[key])}>
                          {dashIfEmpty(c[key])}
                        </Td>
                      ))}
                      <Td>
                        <button
                          onClick={() => setFeedbackFor(c)}
                          className="text-accent hover:text-accent-hover hover:underline"
                        >
                          View
                        </button>
                      </Td>
                    </Tr>
                  );
                })
              )}
            </tbody>
          </Table>

          <ShowMoreButton visibleCount={visibleCount} total={candidateTotal} onClick={showMore} />
        </>
      )}

      {feedbackFor && (
        <CandidateFeedbackModal
          candidate={{ ...feedbackFor, companyName: feedbackFor.companies?.name }}
          onClose={() => setFeedbackFor(null)}
        />
      )}
    </div>
  );
}

export default function CompaniesPage() {
  return (
    <Suspense>
      <CompaniesInner />
    </Suspense>
  );
}
