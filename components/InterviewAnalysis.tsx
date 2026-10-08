"use client";

import { Fragment, useCallback, useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { categorizeStatus } from "@/lib/format";
import { fetchAllRows } from "@/lib/fetchAllRows";
import { BarChartCard } from "@/components/BarChartCard";
import { SelectFilter } from "@/components/SelectFilter";
import { StatTile } from "@/components/StatTile";
import { LoadingRow, EmptyRow } from "@/components/Table";
import type { CandidateWithCompany } from "@/lib/types";

// The company's own rounds after we share a profile, in order. A round counts
// as completed only with a decision — "Selected" or "Rejected" (same literal
// values Company Analytics uses); No Show, Hold, Scheduled, Yet to Schedule,
// "Completed & Waiting for the Results" etc. are still pending.
const STAGES = [
  { key: "screening", label: "Initial screening", field: "screening_status" },
  { key: "tr1", label: "TR 1", field: "tr1_status" },
  { key: "tr2", label: "TR 2", field: "tr2_status" },
  { key: "hrMr", label: "HR/MR", field: "hr_mr_status" },
] as const;
type StageKey = (typeof STAGES)[number]["key"];

// Only these tech outcomes get shared with the company (confirmed with the
// user 2026-10-08) — a Reject that's also flagged shared is a data slip and
// is counted separately, not mixed into the funnel.
const SHAREABLE = ["P1", "P2", "P3", "Hold"] as const;
type Shareable = (typeof SHAREABLE)[number];

// Every count is kept as the list of candidate names behind it, so hovering a
// number can show exactly who it is (asked for 2026-10-08) and the number and
// the list can never disagree.
type Names = string[];
type StageTally = { selected: Names; rejected: Names; pending: Names };
type Row = {
  company: string;
  interactions: Names;
  shared: Names;
  sharedBy: Record<Shareable, Names>;
  stages: Record<StageKey, StageTally>;
  hired: Names;
};

function emptyStage(): StageTally {
  return { selected: [], rejected: [], pending: [] };
}

function emptyRow(company: string): Row {
  return {
    company,
    interactions: [],
    shared: [],
    sharedBy: { P1: [], P2: [], P3: [], Hold: [] },
    stages: { screening: emptyStage(), tr1: emptyStage(), tr2: emptyStage(), hrMr: emptyStage() },
    hired: [],
  };
}

function addInto(into: Row, r: Row) {
  into.interactions.push(...r.interactions);
  into.shared.push(...r.shared);
  for (const k of SHAREABLE) into.sharedBy[k].push(...r.sharedBy[k]);
  for (const s of STAGES) {
    into.stages[s.key].selected.push(...r.stages[s.key].selected);
    into.stages[s.key].rejected.push(...r.stages[s.key].rejected);
    into.stages[s.key].pending.push(...r.stages[s.key].pending);
  }
  into.hired.push(...r.hired);
}

function pct(part: number, whole: number): string {
  return whole > 0 ? `${Math.round((part / whole) * 100)}%` : "-";
}

const th = "px-3 py-2.5 text-left font-medium text-ink-secondary whitespace-nowrap";
const groupTh = "px-3 pt-2 pb-1 text-left text-xs font-semibold uppercase tracking-wide text-ink-secondary";
const td = "px-3 py-2.5 border-t border-line whitespace-nowrap";

const COMPANY_TABLE_COLS = 2 + 5 + STAGES.length * 3 + 1;

// Anchored below the number, or above it when there isn't room (rows near
// the bottom of the screen — the Total row especially).
type Popover = { title: string; names: Names; x: number; top?: number; bottom?: number; pinned: boolean };
const POPOVER_MAX_HEIGHT = 320;

/**
 * What happens after we share a profile: per company, tech-screened
 * candidates in the selected range (by interview date) → shared (P1/P2/P3/
 * Hold) → each company round (Initial screening, TR 1, TR 2, HR/MR) with
 * selected/rejected and select/reject % of those who completed it → Hired.
 */
export function InterviewAnalysis({
  start,
  end,
  syncVersion,
}: {
  start: string;
  end: string;
  syncVersion: string | null;
}) {
  const [candidates, setCandidates] = useState<CandidateWithCompany[]>([]);
  const [loading, setLoading] = useState(true);
  const [interviewer, setInterviewer] = useState("");
  const [popover, setPopover] = useState<Popover | null>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const supabase = createClient();
    setLoading(true);
    let cancelled = false;
    fetchAllRows<CandidateWithCompany>((from, to) =>
      supabase
        .from("candidates")
        .select(
          "name, tech_screening_date, tech_screening_taken_by, tech_status, shared_to_company, screening_status, tr1_status, tr2_status, hr_mr_status, hired_status, companies(name)",
        )
        .gte("tech_screening_date", start)
        .lte("tech_screening_date", end)
        .not("tech_screening_taken_by", "is", null)
        .range(from, to),
    ).then((data) => {
      if (cancelled) return;
      setCandidates(data);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [start, end, syncVersion]);

  // The card is position:fixed (so the table's horizontal scroll can't clip
  // it) — close it on scroll instead of letting it drift away from its number.
  useEffect(() => {
    if (!popover) return;
    const close = () => setPopover(null);
    window.addEventListener("scroll", close, true);
    return () => window.removeEventListener("scroll", close, true);
  }, [popover]);

  const cancelClose = () => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
  };
  const scheduleClose = useCallback(() => {
    cancelClose();
    // Short grace period so the pointer can move from the number onto the
    // card (to scroll a long list) without it vanishing.
    closeTimer.current = setTimeout(() => setPopover((p) => (p?.pinned ? p : null)), 150);
  }, []);
  const open = (el: HTMLElement, title: string, names: Names, pinned: boolean) => {
    cancelClose();
    const rect = el.getBoundingClientRect();
    const roomBelow = window.innerHeight - rect.bottom;
    const place = roomBelow < POPOVER_MAX_HEIGHT && rect.top > roomBelow
      ? { bottom: window.innerHeight - rect.top + 6 }
      : { top: rect.bottom + 6 };
    setPopover({ title, names, x: rect.left, ...place, pinned });
  };

  /** A number that lists its candidates on hover (or tap). Zero renders as a
   * plain "-" with nothing to show. */
  const count = (names: Names, title: string) => {
    if (names.length === 0) return <span className="text-ink-muted">-</span>;
    return (
      <button
        type="button"
        className="cursor-help underline decoration-dotted decoration-ink-muted underline-offset-4"
        onMouseEnter={(e) => open(e.currentTarget, title, names, false)}
        onMouseLeave={scheduleClose}
        onFocus={(e) => open(e.currentTarget, title, names, false)}
        onBlur={scheduleClose}
        onClick={(e) => {
          const same = popover?.title === title && popover.pinned;
          if (same) setPopover(null);
          else open(e.currentTarget, title, names, true);
        }}
      >
        {names.length}
      </button>
    );
  };

  // Only interviewers with at least one completed screening in range —
  // otherwise picking them just shows an all-zero table.
  const interviewerOptions = Array.from(
    new Set([
      ...candidates.filter((c) => categorizeStatus(c.tech_status) !== "Other").map((c) => c.tech_screening_taken_by!),
      ...(interviewer ? [interviewer] : []),
    ]),
  ).sort((a, b) => a.localeCompare(b));

  const byCompany = new Map<string, Row>();
  let rejectedButShared = 0;
  for (const c of candidates) {
    if (interviewer && c.tech_screening_taken_by !== interviewer) continue;
    const outcome = categorizeStatus(c.tech_status);
    if (outcome === "Other") continue; // Tech screening not completed yet.
    const company = c.companies?.name ?? "Unknown";
    const name = c.name?.trim() || "(no name)";
    const row = byCompany.get(company) ?? emptyRow(company);
    byCompany.set(company, row);
    row.interactions.push(name);

    if (!c.shared_to_company) continue;
    if (outcome === "Reject") {
      rejectedButShared++;
      continue;
    }
    row.shared.push(name);
    row.sharedBy[outcome].push(name);
    for (const s of STAGES) {
      const status = (c[s.field] ?? "").trim().toLowerCase();
      if (!status) continue; // Hasn't reached this round.
      if (status === "selected") row.stages[s.key].selected.push(name);
      else if (status === "rejected") row.stages[s.key].rejected.push(name);
      else row.stages[s.key].pending.push(name);
    }
    if ((c.hired_status ?? "").trim().toLowerCase() === "hired") row.hired.push(name);
  }
  const rows = Array.from(byCompany.values()).sort(
    (a, b) => b.shared.length - a.shared.length || b.interactions.length - a.interactions.length,
  );
  const total = emptyRow("All companies");
  for (const r of rows) addInto(total, r);

  const funnel = [
    { label: "Tech completed", value: total.interactions.length },
    { label: "Shared to company", value: total.shared.length },
    ...STAGES.map((s) => ({ label: `${s.label} selected`, value: total.stages[s.key].selected.length })),
    { label: "Hired", value: total.hired.length },
  ];

  /** Selected / Rejected / Select % for one round, as three labelled columns. */
  const stageCells = (r: Row, s: (typeof STAGES)[number], bold = false) => {
    const t = r.stages[s.key];
    const done = t.selected.length + t.rejected.length;
    const b = bold ? " font-semibold" : "";
    return (
      <Fragment key={s.key}>
        <td className={`${td} border-l border-line text-success${b}`}>
          {count(t.selected, `${r.company} · ${s.label} · Selected`)}
        </td>
        <td className={`${td} text-danger${b}`}>
          {count(t.rejected, `${r.company} · ${s.label} · Rejected`)}
        </td>
        <td className={`${td} ${done ? "text-ink" : "text-ink-muted"}${b}`}>{pct(t.selected.length, done)}</td>
      </Fragment>
    );
  };

  const rowCells = (r: Row, bold = false) => {
    const b = bold ? " font-semibold" : "";
    return (
      <>
        <td className={`${td} text-ink${b}`}>
          {count(r.interactions, `${r.company} · Tech completed`)}
        </td>
        <td className={`${td} border-l border-line text-ink${b}`}>
          {count(r.shared, `${r.company} · Shared to company`)}
        </td>
        {SHAREABLE.map((k) => (
          <td key={k} className={`${td} text-ink${b}`}>
            {count(r.sharedBy[k], `${r.company} · Shared · ${k}`)}
          </td>
        ))}
        {STAGES.map((s) => stageCells(r, s, bold))}
        <td className={`${td} border-l border-line font-medium text-success${b}`}>
          {count(r.hired, `${r.company} · Hired`)}
        </td>
      </>
    );
  };

  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-base font-medium text-ink">Analysis — after sharing to company</h2>
          <p className="mt-1 text-sm text-ink-secondary">
            Candidates tech-screened in this date range (by interview date), the P1/P2/P3/Hold profiles shared with
            each company, and how they did in the company&rsquo;s own rounds.
          </p>
        </div>
        <SelectFilter
          value={interviewer}
          onChange={setInterviewer}
          options={interviewerOptions}
          placeholder="All interviewers"
        />
      </div>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <StatTile label="Tech completed" value={loading ? "…" : total.interactions.length} accent="accent" />
        <StatTile label="Shared to company" value={loading ? "…" : total.shared.length} accent="warning" />
        <StatTile label="Hired" value={loading ? "…" : total.hired.length} accent="success" />
        <StatTile
          label="Shared → hired"
          value={loading ? "…" : pct(total.hired.length, total.shared.length)}
          accent="success"
        />
      </div>

      {/* Round-by-round selection vs rejection — the headline view. */}
      <div className="overflow-x-auto rounded-lg border border-line bg-surface">
        <table className="w-full text-sm">
          <thead className="bg-surface-hover">
            <tr className="border-b border-line">
              <th className={th}>Company round</th>
              <th className={th}>Completed</th>
              <th className={th}>Selected</th>
              <th className={th}>Rejected</th>
              <th className={th}>Pending</th>
              <th className={th}>Select %</th>
              <th className={th}>Reject %</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <LoadingRow colSpan={7} />
            ) : (
              <>
                {STAGES.map((s) => {
                  const t = total.stages[s.key];
                  const done = t.selected.length + t.rejected.length;
                  return (
                    <tr key={s.key} className="transition-colors hover:bg-surface-hover">
                      <td className={`${td} font-medium text-ink`}>{s.label}</td>
                      <td className={`${td} text-ink`}>{done || "-"}</td>
                      <td className={`${td} text-success`}>
                        {count(t.selected, `${s.label} · Selected`)}
                      </td>
                      <td className={`${td} text-danger`}>
                        {count(t.rejected, `${s.label} · Rejected`)}
                      </td>
                      <td className={`${td} text-ink-secondary`}>
                        {count(t.pending, `${s.label} · Pending`)}
                      </td>
                      <td className={`${td} font-medium text-success`}>{pct(t.selected.length, done)}</td>
                      <td className={`${td} font-medium text-danger`}>{pct(t.rejected.length, done)}</td>
                    </tr>
                  );
                })}
                <tr>
                  <td className={`${td} font-medium text-ink`}>Hired</td>
                  <td className={`${td} font-semibold text-success`} colSpan={6}>
                    {count(total.hired, "Hired")} of {total.shared.length} shared (
                    {pct(total.hired.length, total.shared.length)})
                  </td>
                </tr>
              </>
            )}
          </tbody>
        </table>
      </div>

      {!loading && total.interactions.length > 0 && <BarChartCard title="Tech completed → hired" data={funnel} />}

      {/* Per company. */}
      <div className="flex flex-col gap-1">
        <h3 className="text-sm font-medium text-ink">By company</h3>
        <p className="text-xs text-ink-secondary">
          For each company round: <span className="text-success">Selected</span> = candidates the company passed in
          that round, <span className="text-danger">Rejected</span> = candidates the company rejected, Select % =
          Selected ÷ (Selected + Rejected). &ldquo;-&rdquo; means no candidate has a result in that round yet.{" "}
          <span className="text-ink">Hover over (or tap) any underlined number to see the candidate names.</span>
        </p>
      </div>
      <div className="overflow-x-auto rounded-lg border border-line bg-surface">
        <table className="w-full text-sm">
          <thead className="bg-surface-hover">
            <tr>
              <th className={`${groupTh} sticky left-0 z-10 bg-surface-hover`} />
              <th className={groupTh} />
              <th className={`${groupTh} border-l border-line`} colSpan={5}>
                Shared to company
              </th>
              {STAGES.map((s) => (
                <th key={s.key} className={`${groupTh} border-l border-line`} colSpan={3}>
                  {s.label}
                </th>
              ))}
              <th className={`${groupTh} border-l border-line`} />
            </tr>
            <tr className="border-b border-line">
              <th className={`${th} sticky left-0 z-10 bg-surface-hover`}>Company</th>
              <th className={th}>Tech completed</th>
              <th className={`${th} border-l border-line`}>Total</th>
              {SHAREABLE.map((k) => (
                <th key={k} className={th}>
                  {k}
                </th>
              ))}
              {STAGES.map((s) => (
                <Fragment key={s.key}>
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
              <LoadingRow colSpan={COMPANY_TABLE_COLS} />
            ) : rows.length === 0 ? (
              <EmptyRow colSpan={COMPANY_TABLE_COLS} label="No completed tech screenings in this range" />
            ) : (
              rows.map((r) => (
                <tr key={r.company} className="transition-colors hover:bg-surface-hover">
                  <td className={`${td} sticky left-0 z-10 bg-surface font-medium text-ink`}>{r.company}</td>
                  {rowCells(r)}
                </tr>
              ))
            )}
          </tbody>
          {!loading && rows.length > 1 && (
            <tfoot className="bg-surface-hover">
              <tr>
                <td className={`${td} sticky left-0 z-10 bg-surface-hover font-semibold text-ink`}>Total</td>
                {rowCells(total, true)}
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      {!loading && rejectedButShared > 0 && (
        <p className="text-xs text-ink-muted">
          {rejectedButShared} candidate{rejectedButShared === 1 ? " was" : "s were"} rejected at tech screening but
          also marked &ldquo;shared with the company&rdquo; in the sheet — left out of the counts above. Worth checking
          the sheet for those rows.
        </p>
      )}

      {popover && (
        <div
          role="dialog"
          aria-label={popover.title}
          onMouseEnter={cancelClose}
          onMouseLeave={scheduleClose}
          className="fixed z-50 w-72 rounded-lg border border-line bg-surface p-3 text-sm shadow-lg"
          style={{
            left: Math.max(8, Math.min(popover.x, (typeof window !== "undefined" ? window.innerWidth : 1200) - 296)),
            top: popover.top,
            bottom: popover.bottom,
          }}
        >
          <div className="mb-2 flex items-start justify-between gap-2">
            <div className="text-xs font-medium text-ink-secondary">
              {popover.title} · {popover.names.length}
            </div>
            {popover.pinned && (
              <button
                type="button"
                onClick={() => setPopover(null)}
                className="text-xs text-ink-muted hover:text-ink"
                aria-label="Close"
              >
                ✕
              </button>
            )}
          </div>
          <ol className="max-h-64 list-decimal overflow-y-auto pl-5 text-ink">
            {[...popover.names]
              .sort((a, b) => a.localeCompare(b))
              .map((n, i) => (
                <li key={i} className="py-0.5">
                  {n}
                </li>
              ))}
          </ol>
        </div>
      )}
    </section>
  );
}
