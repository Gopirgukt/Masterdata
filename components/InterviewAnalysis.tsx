"use client";

import { useEffect, useState } from "react";
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

type StageTally = { selected: number; rejected: number; pending: number };
type Row = {
  company: string;
  interactions: number;
  shared: number;
  sharedBy: Record<Shareable, number>;
  stages: Record<StageKey, StageTally>;
  hired: number;
};

function emptyRow(company: string): Row {
  return {
    company,
    interactions: 0,
    shared: 0,
    sharedBy: { P1: 0, P2: 0, P3: 0, Hold: 0 },
    stages: {
      screening: { selected: 0, rejected: 0, pending: 0 },
      tr1: { selected: 0, rejected: 0, pending: 0 },
      tr2: { selected: 0, rejected: 0, pending: 0 },
      hrMr: { selected: 0, rejected: 0, pending: 0 },
    },
    hired: 0,
  };
}

function addInto(into: Row, r: Row) {
  into.interactions += r.interactions;
  into.shared += r.shared;
  for (const k of SHAREABLE) into.sharedBy[k] += r.sharedBy[k];
  for (const s of STAGES) {
    into.stages[s.key].selected += r.stages[s.key].selected;
    into.stages[s.key].rejected += r.stages[s.key].rejected;
    into.stages[s.key].pending += r.stages[s.key].pending;
  }
  into.hired += r.hired;
}

function pct(part: number, whole: number): string {
  return whole > 0 ? `${Math.round((part / whole) * 100)}%` : "-";
}

const th = "px-3 py-2.5 text-left font-medium text-ink-secondary whitespace-nowrap";
const groupTh = "px-3 py-1.5 text-left text-xs font-medium uppercase tracking-wide text-ink-muted";
const td = "px-3 py-2.5 border-t border-line whitespace-nowrap";

/** One round's result in a single cell: selected (green) / rejected (red),
 * with the select % of completed underneath. */
function StageCell({ t, bold }: { t: StageTally; bold?: boolean }) {
  const done = t.selected + t.rejected;
  if (done === 0 && t.pending === 0) return <td className={`${td} border-l border-line text-ink-muted`}>-</td>;
  return (
    <td className={`${td} border-l border-line ${bold ? "font-semibold" : ""}`}>
      <span className={t.selected > 0 ? "text-success" : "text-ink-muted"}>{t.selected}</span>
      <span className="text-ink-muted"> / </span>
      <span className={t.rejected > 0 ? "text-danger" : "text-ink-muted"}>{t.rejected}</span>
      <div className="text-xs font-normal text-ink-muted">
        {done > 0 ? `${pct(t.selected, done)} sel` : ""}
        {t.pending > 0 ? `${done > 0 ? " · " : ""}${t.pending} pending` : ""}
      </div>
    </td>
  );
}

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

  useEffect(() => {
    const supabase = createClient();
    setLoading(true);
    let cancelled = false;
    fetchAllRows<CandidateWithCompany>((from, to) =>
      supabase
        .from("candidates")
        .select(
          "tech_screening_date, tech_screening_taken_by, tech_status, shared_to_company, screening_status, tr1_status, tr2_status, hr_mr_status, hired_status, companies(name)",
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
    const row = byCompany.get(company) ?? emptyRow(company);
    byCompany.set(company, row);
    row.interactions++;

    if (!c.shared_to_company) continue;
    if (outcome === "Reject") {
      rejectedButShared++;
      continue;
    }
    row.shared++;
    row.sharedBy[outcome]++;
    for (const s of STAGES) {
      const status = (c[s.field] ?? "").trim().toLowerCase();
      if (!status) continue; // Hasn't reached this round.
      if (status === "selected") row.stages[s.key].selected++;
      else if (status === "rejected") row.stages[s.key].rejected++;
      else row.stages[s.key].pending++;
    }
    if ((c.hired_status ?? "").trim().toLowerCase() === "hired") row.hired++;
  }
  const rows = Array.from(byCompany.values()).sort((a, b) => b.shared - a.shared || b.interactions - a.interactions);
  const total = emptyRow("Total");
  for (const r of rows) addInto(total, r);

  const funnel = [
    { label: "Tech completed", value: total.interactions },
    { label: "Shared to company", value: total.shared },
    ...STAGES.map((s) => ({ label: `${s.label} selected`, value: total.stages[s.key].selected })),
    { label: "Hired", value: total.hired },
  ];

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
        <StatTile label="Tech completed" value={loading ? "…" : total.interactions} accent="accent" />
        <StatTile label="Shared to company" value={loading ? "…" : total.shared} accent="warning" />
        <StatTile label="Hired" value={loading ? "…" : total.hired} accent="success" />
        <StatTile label="Shared → hired" value={loading ? "…" : pct(total.hired, total.shared)} accent="success" />
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
                  const done = t.selected + t.rejected;
                  return (
                    <tr key={s.key} className="transition-colors hover:bg-surface-hover">
                      <td className={`${td} font-medium text-ink`}>{s.label}</td>
                      <td className={`${td} text-ink`}>{done || "-"}</td>
                      <td className={`${td} ${t.selected ? "text-success" : "text-ink-muted"}`}>{t.selected || "-"}</td>
                      <td className={`${td} ${t.rejected ? "text-danger" : "text-ink-muted"}`}>{t.rejected || "-"}</td>
                      <td className={`${td} text-ink-secondary`}>{t.pending || "-"}</td>
                      <td className={`${td} font-medium text-success`}>{pct(t.selected, done)}</td>
                      <td className={`${td} font-medium text-danger`}>{pct(t.rejected, done)}</td>
                    </tr>
                  );
                })}
                <tr>
                  <td className={`${td} font-medium text-ink`}>Hired</td>
                  <td className={`${td} font-semibold text-success`} colSpan={6}>
                    {total.hired} of {total.shared} shared ({pct(total.hired, total.shared)})
                  </td>
                </tr>
              </>
            )}
          </tbody>
        </table>
      </div>

      {!loading && total.interactions > 0 && <BarChartCard title="Tech completed → hired" data={funnel} />}

      {/* Per company. */}
      <div className="overflow-x-auto rounded-lg border border-line bg-surface">
        <table className="w-full text-sm">
          <thead className="bg-surface-hover">
            <tr>
              <th className={`${groupTh} sticky left-0 z-10 bg-surface-hover`} />
              <th className={groupTh} />
              <th className={`${groupTh} border-l border-line`} colSpan={5}>
                Shared to company
              </th>
              <th className={`${groupTh} border-l border-line`} colSpan={STAGES.length}>
                Company rounds — selected / rejected
              </th>
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
                <th key={s.key} className={`${th} border-l border-line`}>
                  {s.label}
                </th>
              ))}
              <th className={`${th} border-l border-line`}>Hired</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <LoadingRow colSpan={7 + STAGES.length + 1} />
            ) : rows.length === 0 ? (
              <EmptyRow colSpan={7 + STAGES.length + 1} label="No completed tech screenings in this range" />
            ) : (
              rows.map((r) => (
                <tr key={r.company} className="transition-colors hover:bg-surface-hover">
                  <td className={`${td} sticky left-0 z-10 bg-surface font-medium text-ink`}>{r.company}</td>
                  <td className={`${td} text-ink`}>{r.interactions}</td>
                  <td className={`${td} border-l border-line text-ink`}>{r.shared || "-"}</td>
                  {SHAREABLE.map((k) => (
                    <td key={k} className={`${td} ${r.sharedBy[k] ? "text-ink" : "text-ink-muted"}`}>
                      {r.sharedBy[k] || "-"}
                    </td>
                  ))}
                  {STAGES.map((s) => (
                    <StageCell key={s.key} t={r.stages[s.key]} />
                  ))}
                  <td className={`${td} border-l border-line ${r.hired ? "font-medium text-success" : "text-ink-muted"}`}>
                    {r.hired || "-"}
                  </td>
                </tr>
              ))
            )}
          </tbody>
          {!loading && rows.length > 1 && (
            <tfoot className="bg-surface-hover">
              <tr>
                <td className={`${td} sticky left-0 z-10 bg-surface-hover font-semibold text-ink`}>Total</td>
                <td className={`${td} font-semibold text-ink`}>{total.interactions}</td>
                <td className={`${td} border-l border-line font-semibold text-ink`}>{total.shared}</td>
                {SHAREABLE.map((k) => (
                  <td key={k} className={`${td} font-semibold text-ink`}>
                    {total.sharedBy[k] || "-"}
                  </td>
                ))}
                {STAGES.map((s) => (
                  <StageCell key={s.key} t={total.stages[s.key]} bold />
                ))}
                <td className={`${td} border-l border-line font-semibold text-success`}>{total.hired || "-"}</td>
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
    </section>
  );
}
