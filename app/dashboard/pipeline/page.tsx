"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { categorizeStatus, formatDateLabel, toIsoDate } from "@/lib/format";
import { useSyncVersion } from "@/lib/useSyncVersion";
import { MiniCalendar, monthOf, type ViewMonth } from "@/components/MiniCalendar";
import { SelectFilter } from "@/components/SelectFilter";
import { computeRange, type DateRangePreset } from "@/lib/dateRange";
import { Table, Th, Td, Tr, EmptyRow, LoadingRow } from "@/components/Table";
import type { CandidateWithCompany } from "@/lib/types";

// "day" = the original single-date view (driven by the calendar); "all" =
// no date limit (what the recruiter table always showed before 2026-10-09).
type RangeMode = "day" | DateRangePreset | "all";

const inputClass =
  "rounded-md border border-line-strong bg-surface text-ink text-sm px-3 py-2 outline-none transition-colors hover:border-ink-muted focus:border-accent focus:ring-2 focus:ring-accent-soft";

type PipelineRow = {
  recruiter: string;
  calls: number;
  interested: number;
  scheduled: number;
  shared: number;
  // Was "offer", read from company_decision — which the sync never fills
  // (mapping.ts: "not tracked in this source; always null"), so it was 0 for
  // everyone, always. hired_status is the real, synced outcome.
  hired: number;
};

type CompanyDayRow = {
  company: string;
  recruiter: string;
  assigned: number;
  attempts: number;
  interested: number;
  P1: number;
  P2: number;
  P3: number;
  Hold: number;
  Reject: number;
};

function emptyCompanyDayRow(company: string, recruiter: string): CompanyDayRow {
  return { company, recruiter, assigned: 0, attempts: 0, interested: 0, P1: 0, P2: 0, P3: 0, Hold: 0, Reject: 0 };
}

export default function RecruiterPipelinePage() {
  const [candidates, setCandidates] = useState<CandidateWithCompany[]>([]);
  const [loading, setLoading] = useState(true);
  const [migrationNeeded, setMigrationNeeded] = useState(false);

  const today = toIsoDate(new Date());
  const [selectedDate, setSelectedDate] = useState<string>(today);
  const [viewMonth, setViewMonth] = useState<ViewMonth>(() => monthOf(today));
  const [showCalendar, setShowCalendar] = useState(false);
  const [mode, setMode] = useState<RangeMode>("day");
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");
  const [recruiter, setRecruiter] = useState("");
  const syncVersion = useSyncVersion();

  useEffect(() => {
    const supabase = createClient();
    setLoading(true);

    async function loadAll() {
      const all: CandidateWithCompany[] = [];
      let offset = 0;
      const pageSize = 1000;

      while (true) {
        const { data, error } = await supabase
          .from("candidates")
          .select(
            "recruiter, interested, call_date, call_status, tr_status, tech_screening_date, shared_to_company, hired_status, companies(name)",
          )
          .range(offset, offset + pageSize - 1);

        if (error) {
          setMigrationNeeded(true);
          setLoading(false);
          return;
        }
        const page = (data as unknown as CandidateWithCompany[]) ?? [];
        all.push(...page);
        if (page.length < pageSize) break;
        offset += pageSize;
      }

      setCandidates(all);
      setLoading(false);
    }

    loadAll();
  }, [syncVersion]);

  // Both tables follow the same period (by call date) and recruiter filter.
  const range =
    mode === "all"
      ? null
      : mode === "day"
        ? { start: selectedDate, end: selectedDate }
        : computeRange(mode, customStart, customEnd);
  const inRange = (d: string | null) => !range || (!!d && d >= range.start && d <= range.end);
  const rangeLabel = !range
    ? "All time"
    : range.start === range.end
      ? formatDateLabel(range.start)
      : `${formatDateLabel(range.start)} – ${formatDateLabel(range.end)}`;

  const recruiterOptions = Array.from(
    new Set([
      ...candidates.filter((c) => c.recruiter && c.call_date && inRange(c.call_date)).map((c) => c.recruiter!),
      ...(recruiter ? [recruiter] : []),
    ]),
  ).sort((a, b) => a.localeCompare(b));

  const byRecruiter = new Map<string, PipelineRow>();
  const callsByDate = new Map<string, number>();
  const byCompanyInRange = new Map<string, CompanyDayRow>();

  for (const c of candidates) {
    if (c.call_date) {
      callsByDate.set(c.call_date, (callsByDate.get(c.call_date) ?? 0) + 1);
    }
    if (recruiter && c.recruiter !== recruiter) continue;
    // "All time" keeps the old all-time behaviour (every candidate, dated or
    // not); any real period counts candidates whose call date falls in it.
    if (range && !inRange(c.call_date)) continue;

    const name = c.recruiter;
    if (name) {
      if (!byRecruiter.has(name)) {
        byRecruiter.set(name, { recruiter: name, calls: 0, interested: 0, scheduled: 0, shared: 0, hired: 0 });
      }
      const row = byRecruiter.get(name)!;
      if (c.call_date) row.calls++;
      if (c.interested) row.interested++;
      if (c.tech_screening_date) row.scheduled++;
      if (c.shared_to_company) row.shared++;
      if ((c.hired_status ?? "").trim().toLowerCase() === "hired") row.hired++;
    }

    // Assigned = has a call_date logged for the day (confirmed with the user
    // 2026-08-26: "Call Date" is what "assigned" means here). Attempts is the
    // subset of those where Call Status is actually filled in — call_date can
    // be set before the recruiter has gotten to the candidate, so "assigned"
    // and "attempted" are different counts even though both key off call_date.
    if (c.call_date) {
      const companyName = c.companies?.name ?? "Unknown";
      const recruiterName = c.recruiter ?? "Unknown";
      const key = `${companyName}||${recruiterName}`;
      if (!byCompanyInRange.has(key)) {
        byCompanyInRange.set(key, emptyCompanyDayRow(companyName, recruiterName));
      }
      const companyRow = byCompanyInRange.get(key)!;
      companyRow.assigned++;
      if (c.call_status && c.call_status.trim() !== "") {
        companyRow.attempts++;
        if (c.interested) companyRow.interested++;
        const category = categorizeStatus(c.tr_status);
        if (category !== "Other") companyRow[category]++;
      }
    }
  }

  const recruiterRows = Array.from(byRecruiter.values()).sort((a, b) => b.calls - a.calls);
  const companyDayRows = Array.from(byCompanyInRange.values()).sort(
    (a, b) => a.company.localeCompare(b.company) || b.attempts - a.attempts,
  );
  const companyTotal = companyDayRows.reduce(
    (t, r) => {
      t.assigned += r.assigned;
      t.attempts += r.attempts;
      t.interested += r.interested;
      t.P1 += r.P1;
      t.P2 += r.P2;
      t.P3 += r.P3;
      t.Hold += r.Hold;
      t.Reject += r.Reject;
      return t;
    },
    emptyCompanyDayRow("Total", ""),
  );
  const recruiterTotal = recruiterRows.reduce(
    (t, r) => ({
      ...t,
      calls: t.calls + r.calls,
      interested: t.interested + r.interested,
      scheduled: t.scheduled + r.scheduled,
      shared: t.shared + r.shared,
      hired: t.hired + r.hired,
    }),
    { recruiter: "Total", calls: 0, interested: 0, scheduled: 0, shared: 0, hired: 0 },
  );
  const breakdownToneClass: Record<"P1" | "P2" | "P3" | "Hold" | "Reject", string> = {
    P1: "text-success",
    P2: "text-success",
    P3: "text-success",
    Hold: "text-accent",
    Reject: "text-danger",
  };

  return (
    <div className="flex flex-col gap-8">
      {migrationNeeded && (
        <div className="flex items-start gap-3 rounded-lg border border-warning/40 bg-warning-soft px-4 py-3 text-sm text-ink">
          <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5 shrink-0 text-warning mt-0.5">
            <path d="M10 2.5l8 14H2l8-14z" />
            <path d="M10 8v3.5M10 14.2v.3" />
          </svg>
          <div>
            This view needs the <code className="text-ink-secondary">recruiter</code>,{" "}
            <code className="text-ink-secondary">interested</code>, and{" "}
            <code className="text-ink-secondary">call_status</code> columns on{" "}
            <code className="text-ink-secondary">candidates</code>, which aren&apos;t all in the database yet. Run{" "}
            <code className="text-ink-secondary">migrations/001_recruiter_pipeline.sql</code> and{" "}
            <code className="text-ink-secondary">migrations/009_call_status.sql</code> in the Supabase SQL editor,
            then reload this page.
          </div>
        </div>
      )}

      <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
        <div className="flex flex-1 flex-col gap-3 min-w-0">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-base font-medium text-ink">Companies worked — {rangeLabel}</h2>
            <div className="flex flex-wrap items-center gap-3">
              {mode === "day" && selectedDate !== today && (
                <button
                  onClick={() => {
                    setSelectedDate(today);
                    setViewMonth(monthOf(today));
                  }}
                  className="text-sm text-accent hover:underline"
                >
                  Back to today
                </button>
              )}
              <select
                value={mode}
                onChange={(e) => setMode(e.target.value as RangeMode)}
                className={inputClass}
                suppressHydrationWarning
              >
                <option value="day">Single day</option>
                <option value="this_week">This week</option>
                <option value="this_month">This month</option>
                <option value="custom">Custom range</option>
                <option value="all">All time</option>
              </select>
              {mode === "custom" && (
                <>
                  <input type="date" value={customStart} onChange={(e) => setCustomStart(e.target.value)} className={inputClass} />
                  <span className="text-sm text-ink-muted">to</span>
                  <input type="date" value={customEnd} onChange={(e) => setCustomEnd(e.target.value)} className={inputClass} />
                </>
              )}
              <SelectFilter value={recruiter} onChange={setRecruiter} options={recruiterOptions} placeholder="All recruiters" />
              <button
                onClick={() => setShowCalendar((v) => !v)}
                className="rounded-md border border-line-strong bg-surface text-ink-secondary text-sm px-3 py-2 transition-colors hover:border-ink-muted hover:text-ink"
              >
                {showCalendar ? "Hide calendar" : "Show calendar"}
              </button>
            </div>
          </div>

          <Table>
            <thead>
              <tr>
                <Th>Company</Th>
                <Th>Recruiter</Th>
                <Th>Assigned</Th>
                <Th>Attempts</Th>
                <Th>Interested</Th>
                <Th>P1</Th>
                <Th>P2</Th>
                <Th>P3</Th>
                <Th>Hold</Th>
                <Th>Reject</Th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <LoadingRow colSpan={10} />
              ) : migrationNeeded ? (
                <EmptyRow colSpan={10} label="Run the migrations above to see pipeline data" />
              ) : companyDayRows.length === 0 ? (
                <EmptyRow
                  colSpan={10}
                  label={`No activity logged ${mode === "day" ? "for this day" : "in this period"}${recruiter ? ` for ${recruiter}` : ""}`}
                />
              ) : (
                companyDayRows.map((r) => (
                  <Tr key={`${r.company}||${r.recruiter}`}>
                    <Td className="font-medium">{r.company}</Td>
                    <Td>{r.recruiter}</Td>
                    <Td>{r.assigned || "-"}</Td>
                    <Td>{r.attempts || "-"}</Td>
                    <Td>{r.interested || "-"}</Td>
                    <Td className={r.P1 > 0 ? breakdownToneClass.P1 : undefined}>{r.P1 || "-"}</Td>
                    <Td className={r.P2 > 0 ? breakdownToneClass.P2 : undefined}>{r.P2 || "-"}</Td>
                    <Td className={r.P3 > 0 ? breakdownToneClass.P3 : undefined}>{r.P3 || "-"}</Td>
                    <Td className={r.Hold > 0 ? breakdownToneClass.Hold : undefined}>{r.Hold || "-"}</Td>
                    <Td className={r.Reject > 0 ? breakdownToneClass.Reject : undefined}>{r.Reject || "-"}</Td>
                  </Tr>
                ))
              )}
            </tbody>
            {!loading && companyDayRows.length > 1 && (
              <tfoot className="bg-surface-hover font-semibold">
                <tr>
                  <td className="px-4 py-2.5 text-ink">Total</td>
                  <td className="px-4 py-2.5" />
                  <td className="px-4 py-2.5 text-ink">{companyTotal.assigned || "-"}</td>
                  <td className="px-4 py-2.5 text-ink">{companyTotal.attempts || "-"}</td>
                  <td className="px-4 py-2.5 text-ink">{companyTotal.interested || "-"}</td>
                  {(["P1", "P2", "P3", "Hold", "Reject"] as const).map((k) => (
                    <td key={k} className={`px-4 py-2.5 ${companyTotal[k] > 0 ? breakdownToneClass[k] : "text-ink-muted"}`}>
                      {companyTotal[k] || "-"}
                    </td>
                  ))}
                </tr>
              </tfoot>
            )}
          </Table>
        </div>

        {showCalendar && (
          <MiniCalendar
            view={viewMonth}
            onViewChange={setViewMonth}
            countsByDate={callsByDate}
            selectedDate={selectedDate}
            todayIso={today}
            onSelectDate={(date) => {
              if (!date) return;
              setSelectedDate(date);
              setMode("day"); // Picking a date on the calendar means "show me that day".
            }}
          />
        )}
      </div>

      <div className="flex flex-col gap-3">
        <h2 className="text-base font-medium text-ink">By recruiter — {rangeLabel}</h2>
        <p className="-mt-1 text-xs text-ink-secondary">
          Candidates whose call date falls in the period (every candidate for &ldquo;All time&rdquo;): calls made,
          interested, scheduled for tech screening, shared with the company, and hired.
        </p>
        <Table>
          <thead>
            <tr>
              <Th>Recruiter</Th>
              <Th>Calls</Th>
              <Th>Interested</Th>
              <Th>Scheduled</Th>
              <Th>Shared</Th>
              <Th>Hired</Th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <LoadingRow colSpan={6} />
            ) : migrationNeeded ? (
              <EmptyRow colSpan={6} label="Run the migration above to see pipeline data" />
            ) : recruiterRows.length === 0 ? (
              <EmptyRow colSpan={6} label="No calls in this period" />
            ) : (
              recruiterRows.map((r) => (
                <Tr key={r.recruiter}>
                  <Td className="font-medium">{r.recruiter}</Td>
                  <Td>{r.calls}</Td>
                  <Td>{r.interested}</Td>
                  <Td>{r.scheduled}</Td>
                  <Td>{r.shared}</Td>
                  <Td className={r.hired > 0 ? "text-success font-medium" : undefined}>{r.hired}</Td>
                </Tr>
              ))
            )}
          </tbody>
          {!loading && recruiterRows.length > 1 && (
            <tfoot className="bg-surface-hover font-semibold">
              <tr>
                <td className="px-4 py-2.5 text-ink">Total</td>
                <td className="px-4 py-2.5 text-ink">{recruiterTotal.calls}</td>
                <td className="px-4 py-2.5 text-ink">{recruiterTotal.interested}</td>
                <td className="px-4 py-2.5 text-ink">{recruiterTotal.scheduled}</td>
                <td className="px-4 py-2.5 text-ink">{recruiterTotal.shared}</td>
                <td className={`px-4 py-2.5 ${recruiterTotal.hired > 0 ? "text-success" : "text-ink"}`}>{recruiterTotal.hired}</td>
              </tr>
            </tfoot>
          )}
        </Table>
      </div>
    </div>
  );
}
