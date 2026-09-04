"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { categorizeStatus, formatDateLabel, parseTimeToMinutes, toIsoDate } from "@/lib/format";
import { fetchAllRows } from "@/lib/fetchAllRows";
import { useSyncVersion } from "@/lib/useSyncVersion";
import { MiniCalendar, monthOf, type ViewMonth } from "@/components/MiniCalendar";
import { SelectFilter } from "@/components/SelectFilter";
import { Table, Th, Td, Tr, EmptyRow, LoadingRow } from "@/components/Table";
import type { CandidateWithCompany } from "@/lib/types";

type CompanyTally = { company: string; completed: number; P1: number; P2: number; Hold: number; Reject: number };
type InterviewerGroup = { interviewer: string; total: number; companies: CompanyTally[] };

type RecruiterTally = {
  recruiter: string;
  assigned: number;
  attempts: number;
  interested: number;
  P1: number;
  P2: number;
  Hold: number;
  Reject: number;
};

const BREAKDOWN_TONE: Record<"P1" | "P2" | "Hold" | "Reject", string> = {
  P1: "text-success",
  P2: "text-success",
  Hold: "text-accent",
  Reject: "text-danger",
};

function hourOf(time: string | null): number | null {
  const minutes = parseTimeToMinutes(time);
  return Number.isFinite(minutes) ? Math.floor(minutes / 60) : null;
}

function formatHourLabel(hour: number): string {
  const period = hour < 12 ? "AM" : "PM";
  const display = hour % 12 === 0 ? 12 : hour % 12;
  return `${display} ${period}`;
}

function emptyTally(): { P1: number; P2: number; Hold: number; Reject: number } {
  return { P1: 0, P2: 0, Hold: 0, Reject: 0 };
}

export default function DayOutcomePage() {
  const [candidates, setCandidates] = useState<CandidateWithCompany[]>([]);
  const [loading, setLoading] = useState(true);
  const syncVersion = useSyncVersion();

  const today = toIsoDate(new Date());
  const [selectedDate, setSelectedDate] = useState(today);
  const [viewMonth, setViewMonth] = useState<ViewMonth>(() => monthOf(today));
  const [showCalendar, setShowCalendar] = useState(false);
  const [hourFilter, setHourFilter] = useState("");

  useEffect(() => {
    const supabase = createClient();
    setLoading(true);
    fetchAllRows<CandidateWithCompany>((start, end) =>
      supabase
        .from("candidates")
        .select(
          "tech_screening_date, tech_screening_time, tech_screening_taken_by, tech_status, call_date, call_status, recruiter, tr_status, interested, companies(name)",
        )
        .range(start, end),
    ).then((data) => {
      setCandidates(data);
      setLoading(false);
    });
  }, [syncVersion]);

  const interviewsToday = candidates.filter((c) => c.tech_screening_date === selectedDate && c.tech_screening_taken_by);
  const hourOptions = Array.from(
    new Set(interviewsToday.map((c) => hourOf(c.tech_screening_time)).filter((h): h is number => h !== null)),
  )
    .sort((a, b) => a - b)
    .map((h) => formatHourLabel(h));

  const interviewsFiltered = interviewsToday.filter((c) => {
    if (!hourFilter) return true;
    const h = hourOf(c.tech_screening_time);
    return h !== null && formatHourLabel(h) === hourFilter;
  });

  const interviewerMap = new Map<string, Map<string, CompanyTally>>();
  for (const c of interviewsFiltered) {
    const interviewer = c.tech_screening_taken_by!;
    const companyName = c.companies?.name ?? "Unknown";
    if (!interviewerMap.has(interviewer)) interviewerMap.set(interviewer, new Map());
    const byCompany = interviewerMap.get(interviewer)!;
    if (!byCompany.has(companyName)) {
      byCompany.set(companyName, { company: companyName, completed: 0, P1: 0, P2: 0, Hold: 0, Reject: 0 });
    }
    const tally = byCompany.get(companyName)!;
    // "Completed" = has an actual outcome (P1/P2/Hold/Reject), not just
    // scheduled/assigned — a row with no tech_status yet is still pending,
    // not completed, even though it's on the calendar for today (confirmed
    // with the user 2026-09-04).
    const category = categorizeStatus(c.tech_status);
    if (category !== "Other") {
      tally.completed++;
      tally[category]++;
    }
  }
  const interviewerGroups: InterviewerGroup[] = Array.from(interviewerMap.entries())
    .map(([interviewer, byCompany]) => {
      // Only companies with at least one actual completed outcome — a
      // company where every interview that day is still pending shouldn't
      // count toward "across N companies" once "completed" means P1/P2/
      // Hold/Reject rather than just scheduled.
      const companies = Array.from(byCompany.values())
        .filter((t) => t.completed > 0)
        .sort((a, b) => b.completed - a.completed);
      return {
        interviewer,
        total: companies.reduce((sum, t) => sum + t.completed, 0),
        companies,
      };
    })
    .filter((group) => group.companies.length > 0)
    .sort((a, b) => b.total - a.total);

  const callsToday = candidates.filter((c) => c.call_date === selectedDate && c.recruiter);
  const recruiterMap = new Map<string, RecruiterTally>();
  for (const c of callsToday) {
    const recruiter = c.recruiter!;
    if (!recruiterMap.has(recruiter)) {
      recruiterMap.set(recruiter, { recruiter, assigned: 0, attempts: 0, interested: 0, ...emptyTally() });
    }
    const tally = recruiterMap.get(recruiter)!;
    tally.assigned++;
    if (c.call_status && c.call_status.trim() !== "") {
      tally.attempts++;
      if (c.interested) tally.interested++;
      const category = categorizeStatus(c.tr_status);
      if (category !== "Other") tally[category]++;
    }
  }
  const recruiterRows = Array.from(recruiterMap.values()).sort((a, b) => b.attempts - a.attempts);

  const callsByDate = new Map<string, number>();
  for (const c of candidates) {
    if (!c.call_date) continue;
    callsByDate.set(c.call_date, (callsByDate.get(c.call_date) ?? 0) + 1);
  }

  return (
    <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
      <div className="flex flex-1 flex-col gap-8 min-w-0">
        <div className="flex items-center justify-between">
          <div className="text-sm text-ink-secondary">{formatDateLabel(selectedDate)}</div>
          <div className="flex items-center gap-3">
            {selectedDate !== today && (
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
            <SelectFilter value={hourFilter} onChange={setHourFilter} options={hourOptions} placeholder="All hours" />
            <button
              onClick={() => setShowCalendar((v) => !v)}
              className="rounded-md border border-line-strong bg-surface text-ink-secondary text-sm px-3 py-2 transition-colors hover:border-ink-muted hover:text-ink"
            >
              {showCalendar ? "Hide calendar" : "Show calendar"}
            </button>
          </div>
        </div>

        <div className="flex flex-col gap-4">
          <h2 className="text-base font-medium text-ink">Interviewers</h2>
          {loading ? (
            <div className="text-sm text-ink-muted">Loading…</div>
          ) : interviewerGroups.length === 0 ? (
            <div className="text-sm text-ink-muted">No tech screenings on this day.</div>
          ) : (
            interviewerGroups.map((group) => (
              <div key={group.interviewer} className="flex flex-col gap-2">
                <div className="flex items-baseline gap-2">
                  <span className="font-medium text-ink">{group.interviewer}</span>
                  <span className="text-sm text-ink-secondary">
                    completed {group.total} {group.total === 1 ? "interaction" : "interactions"} across{" "}
                    {group.companies.length} {group.companies.length === 1 ? "company" : "companies"}
                  </span>
                </div>
                <Table>
                  <thead>
                    <tr>
                      <Th>Company</Th>
                      <Th>Completed</Th>
                      <Th>P1</Th>
                      <Th>P2</Th>
                      <Th>Hold</Th>
                      <Th>Reject</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {group.companies.map((c) => (
                      <Tr key={c.company}>
                        <Td className="font-medium">{c.company}</Td>
                        <Td>{c.completed}</Td>
                        <Td className={c.P1 > 0 ? BREAKDOWN_TONE.P1 : undefined}>{c.P1 || "-"}</Td>
                        <Td className={c.P2 > 0 ? BREAKDOWN_TONE.P2 : undefined}>{c.P2 || "-"}</Td>
                        <Td className={c.Hold > 0 ? BREAKDOWN_TONE.Hold : undefined}>{c.Hold || "-"}</Td>
                        <Td className={c.Reject > 0 ? BREAKDOWN_TONE.Reject : undefined}>{c.Reject || "-"}</Td>
                      </Tr>
                    ))}
                  </tbody>
                </Table>
              </div>
            ))
          )}
        </div>

        <div className="flex flex-col gap-3">
          <h2 className="text-base font-medium text-ink">Recruiters (calls)</h2>
          <Table>
            <thead>
              <tr>
                <Th>Recruiter</Th>
                <Th>Assigned</Th>
                <Th>Attempts</Th>
                <Th>Interested</Th>
                <Th>P1</Th>
                <Th>P2</Th>
                <Th>Hold</Th>
                <Th>Reject</Th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <LoadingRow colSpan={8} />
              ) : recruiterRows.length === 0 ? (
                <EmptyRow colSpan={8} label="No calls logged for this day" />
              ) : (
                recruiterRows.map((r) => (
                  <Tr key={r.recruiter}>
                    <Td className="font-medium">{r.recruiter}</Td>
                    <Td>{r.assigned || "-"}</Td>
                    <Td>{r.attempts || "-"}</Td>
                    <Td>{r.interested || "-"}</Td>
                    <Td className={r.P1 > 0 ? BREAKDOWN_TONE.P1 : undefined}>{r.P1 || "-"}</Td>
                    <Td className={r.P2 > 0 ? BREAKDOWN_TONE.P2 : undefined}>{r.P2 || "-"}</Td>
                    <Td className={r.Hold > 0 ? BREAKDOWN_TONE.Hold : undefined}>{r.Hold || "-"}</Td>
                    <Td className={r.Reject > 0 ? BREAKDOWN_TONE.Reject : undefined}>{r.Reject || "-"}</Td>
                  </Tr>
                ))
              )}
            </tbody>
          </Table>
        </div>
      </div>

      {showCalendar && (
        <MiniCalendar
          view={viewMonth}
          onViewChange={setViewMonth}
          countsByDate={callsByDate}
          selectedDate={selectedDate}
          todayIso={today}
          onSelectDate={(date) => {
            if (date) setSelectedDate(date);
          }}
        />
      )}
    </div>
  );
}
