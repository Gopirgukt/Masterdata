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

// Same rules as Company Analytics: a later round counts as cleared only when
// its status is literally "Selected" (other values seen: Rejected, No Show,
// Hold, Yet to Schedule, Scheduled, Completed & Waiting for the Results), and
// the last stage is literally "Hired".
function cleared(status: string | null): boolean {
  return (status ?? "").trim().toLowerCase() === "selected";
}
function hired(status: string | null): boolean {
  return (status ?? "").trim().toLowerCase() === "hired";
}

type Row = {
  company: string;
  interactions: number;
  P1: number;
  P2: number;
  P3: number;
  Hold: number;
  Reject: number;
  shared: number;
  sharedP1: number;
  sharedP2: number;
  sharedP3: number;
  screening: number;
  tr1: number;
  tr2: number;
  hrMr: number;
  hired: number;
};

function emptyRow(company: string): Row {
  return {
    company,
    interactions: 0,
    P1: 0,
    P2: 0,
    P3: 0,
    Hold: 0,
    Reject: 0,
    shared: 0,
    sharedP1: 0,
    sharedP2: 0,
    sharedP3: 0,
    screening: 0,
    tr1: 0,
    tr2: 0,
    hrMr: 0,
    hired: 0,
  };
}

const NUMERIC_KEYS = Object.keys(emptyRow("")).filter((k) => k !== "company") as Exclude<keyof Row, "company">[];

function pct(part: number, whole: number): string {
  return whole > 0 ? `${Math.round((part / whole) * 100)}%` : "-";
}

const th = "px-3 py-2.5 text-left font-medium text-ink-secondary whitespace-nowrap";
const groupTh = "px-3 py-1.5 text-left text-xs font-medium uppercase tracking-wide text-ink-muted border-l border-line";
const td = "px-3 py-2.5 border-t border-line whitespace-nowrap";

/**
 * Per-company view of tech-screened candidates in the selected range (by
 * interview date) and how far they got after being shared with the company:
 * tech outcome (P1/P2/P3/Hold/Reject, select/reject %) → shared to company
 * (split by P1/P2/P3) → cleared Screening/TR1/TR2/HR-MR → Hired.
 * "Interactions" = screenings with a recorded outcome — the same "completed"
 * rule as the table above and Day Outcome.
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
  for (const c of candidates) {
    if (interviewer && c.tech_screening_taken_by !== interviewer) continue;
    const outcome = categorizeStatus(c.tech_status);
    if (outcome === "Other") continue; // Not completed yet.
    const company = c.companies?.name ?? "Unknown";
    const row = byCompany.get(company) ?? emptyRow(company);
    row.interactions++;
    row[outcome]++;
    if (c.shared_to_company) {
      row.shared++;
      if (outcome === "P1") row.sharedP1++;
      if (outcome === "P2") row.sharedP2++;
      if (outcome === "P3") row.sharedP3++;
    }
    if (cleared(c.screening_status)) row.screening++;
    if (cleared(c.tr1_status)) row.tr1++;
    if (cleared(c.tr2_status)) row.tr2++;
    if (cleared(c.hr_mr_status)) row.hrMr++;
    if (hired(c.hired_status)) row.hired++;
    byCompany.set(company, row);
  }
  const rows = Array.from(byCompany.values()).sort((a, b) => b.interactions - a.interactions);
  const total = rows.reduce((sum, r) => {
    for (const k of NUMERIC_KEYS) sum[k] += r[k];
    return sum;
  }, emptyRow("Total"));
  const selected = (r: Row) => r.P1 + r.P2 + r.P3;

  // No "Selected" step: Hold/Reject candidates are sometimes shared too
  // (confirmed 2026-10-08: 36 rejected-but-shared), so Selected < Shared and
  // a funnel with both would rise mid-way. Select % lives in the tiles.
  const funnel = [
    { label: "Interactions", value: total.interactions },
    { label: "Shared to company", value: total.shared },
    { label: "Cleared screening", value: total.screening },
    { label: "Cleared TR 1", value: total.tr1 },
    { label: "Cleared TR 2", value: total.tr2 },
    { label: "Cleared HR/MR", value: total.hrMr },
    { label: "Hired", value: total.hired },
  ];

  const renderCells = (r: Row, bold = false) => {
    const tone = (n: number, cls: string) => (n > 0 ? cls : "text-ink-muted");
    const b = bold ? " font-semibold" : "";
    return (
      <>
        <td className={`${td} text-ink${b}`}>{r.interactions}</td>
        <td className={`${td} border-l border-line ${tone(r.P1, "text-success")}${b}`}>{r.P1 || "-"}</td>
        <td className={`${td} ${tone(r.P2, "text-success")}${b}`}>{r.P2 || "-"}</td>
        <td className={`${td} ${tone(r.P3, "text-success")}${b}`}>{r.P3 || "-"}</td>
        <td className={`${td} ${tone(r.Hold, "text-accent")}${b}`}>{r.Hold || "-"}</td>
        <td className={`${td} ${tone(r.Reject, "text-danger")}${b}`}>{r.Reject || "-"}</td>
        <td className={`${td} text-ink${b}`}>{pct(selected(r), r.interactions)}</td>
        <td className={`${td} text-ink${b}`}>{pct(r.Reject, r.interactions)}</td>
        <td className={`${td} border-l border-line text-ink${b}`}>{r.shared || "-"}</td>
        <td className={`${td} text-ink${b}`}>{r.sharedP1 || "-"}</td>
        <td className={`${td} text-ink${b}`}>{r.sharedP2 || "-"}</td>
        <td className={`${td} text-ink${b}`}>{r.sharedP3 || "-"}</td>
        <td className={`${td} border-l border-line text-ink${b}`}>{r.screening || "-"}</td>
        <td className={`${td} text-ink${b}`}>{r.tr1 || "-"}</td>
        <td className={`${td} text-ink${b}`}>{r.tr2 || "-"}</td>
        <td className={`${td} text-ink${b}`}>{r.hrMr || "-"}</td>
        <td className={`${td} ${tone(r.hired, "text-success")} font-medium${b}`}>{r.hired || "-"}</td>
      </>
    );
  };

  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-base font-medium text-ink">Analysis</h2>
          <p className="mt-1 text-sm text-ink-secondary">
            Completed tech screenings in this date range (by interview date) per company, and how far those candidates
            got after being shared.
          </p>
        </div>
        <SelectFilter
          value={interviewer}
          onChange={setInterviewer}
          options={interviewerOptions}
          placeholder="All interviewers"
        />
      </div>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-5">
        <StatTile label="Interactions" value={loading ? "…" : total.interactions} accent="accent" />
        <StatTile label="Select %" value={loading ? "…" : pct(selected(total), total.interactions)} accent="success" />
        <StatTile label="Reject %" value={loading ? "…" : pct(total.Reject, total.interactions)} accent="danger" />
        <StatTile label="Shared to company" value={loading ? "…" : total.shared} accent="warning" />
        <StatTile label="Hired" value={loading ? "…" : total.hired} accent="success" />
      </div>

      {!loading && total.interactions > 0 && <BarChartCard title="Interaction → hire funnel" data={funnel} />}

      <div className="overflow-x-auto rounded-lg border border-line bg-surface">
        <table className="w-full text-sm">
          <thead className="bg-surface-hover">
            <tr>
              <th className={`${groupTh.replace(" border-l border-line", "")} sticky left-0 z-10 bg-surface-hover`} />
              <th className={groupTh.replace(" border-l border-line", "")} />
              <th className={groupTh} colSpan={7}>
                Tech outcome
              </th>
              <th className={groupTh} colSpan={4}>
                Shared to company
              </th>
              <th className={groupTh} colSpan={5}>
                Cleared after sharing
              </th>
            </tr>
            <tr className="border-b border-line">
              <th className={`${th} sticky left-0 z-10 bg-surface-hover`}>Company</th>
              <th className={th}>Interactions</th>
              <th className={`${th} border-l border-line`}>P1</th>
              <th className={th}>P2</th>
              <th className={th}>P3</th>
              <th className={th}>Hold</th>
              <th className={th}>Reject</th>
              <th className={th}>Select %</th>
              <th className={th}>Reject %</th>
              <th className={`${th} border-l border-line`}>Total</th>
              <th className={th}>P1</th>
              <th className={th}>P2</th>
              <th className={th}>P3</th>
              <th className={`${th} border-l border-line`}>Screening</th>
              <th className={th}>TR 1</th>
              <th className={th}>TR 2</th>
              <th className={th}>HR/MR</th>
              <th className={th}>Hired</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <LoadingRow colSpan={18} />
            ) : rows.length === 0 ? (
              <EmptyRow colSpan={18} label="No completed tech screenings in this range" />
            ) : (
              rows.map((r) => (
                <tr key={r.company} className="transition-colors hover:bg-surface-hover">
                  <td className={`${td} sticky left-0 z-10 bg-surface font-medium text-ink`}>{r.company}</td>
                  {renderCells(r)}
                </tr>
              ))
            )}
          </tbody>
          {!loading && rows.length > 1 && (
            <tfoot className="bg-surface-hover">
              <tr>
                <td className={`${td} sticky left-0 z-10 bg-surface-hover font-semibold text-ink`}>Total</td>
                {renderCells(total, true)}
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </section>
  );
}
