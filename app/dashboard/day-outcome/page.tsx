"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { categorizeStatus, formatDateLabel, parseTimeToMinutes, toIsoDate } from "@/lib/format";
import { fetchAllRows } from "@/lib/fetchAllRows";
import { useSyncVersion } from "@/lib/useSyncVersion";
import { MiniCalendar, monthOf, type ViewMonth } from "@/components/MiniCalendar";
import { SelectFilter } from "@/components/SelectFilter";
import { Table, Th, Td, Tr, EmptyRow, LoadingRow } from "@/components/Table";
import { ColumnChartCard, type ColumnSeries } from "@/components/ColumnChartCard";
import { SERIES as OUTCOMES, LIGHT_COLORS, DARK_COLORS } from "@/components/StackedOutcomeChart";
import { computeRange, type DateRangePreset } from "@/lib/dateRange";
import type { CandidateWithCompany } from "@/lib/types";

// "day" is this page's original single-date view (driven by the calendar);
// the rest reuse the dashboard-wide presets from lib/dateRange.
type RangeMode = "day" | DateRangePreset;

const OUTCOME_SERIES: ColumnSeries[] = OUTCOMES.map((key) => ({
  key,
  label: key,
  light: LIGHT_COLORS[key],
  dark: DARK_COLORS[key],
}));

// Categorical slots 1-3 of the dataviz reference palette (validated light +
// dark; light aqua is under 3:1 on the surface, so the recruiter table right
// below the chart is the required exact-number view).
const CALL_SERIES: ColumnSeries[] = [
  { key: "assigned", label: "Assigned", light: "#2a78d6", dark: "#3987e5" },
  { key: "attempts", label: "Attempts", light: "#eb6834", dark: "#d95926" },
  { key: "interested", label: "Interested", light: "#1baf7a", dark: "#199e70" },
];

const inputClass =
  "rounded-md border border-line-strong bg-surface text-ink text-sm px-3 py-2 outline-none transition-colors hover:border-ink-muted focus:border-accent focus:ring-2 focus:ring-accent-soft";

function shortDate(iso: string): string {
  const [year, month, day] = iso.split("-").map(Number);
  return new Date(year, month - 1, day).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

type CompanyTally = {
  company: string;
  completed: number;
  P1: number;
  P2: number;
  P3: number;
  Hold: number;
  Reject: number;
};
type InterviewerGroup = { interviewer: string; total: number; companies: CompanyTally[] };

type RecruiterTally = {
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

const BREAKDOWN_TONE: Record<"P1" | "P2" | "P3" | "Hold" | "Reject", string> = {
  P1: "text-success",
  P2: "text-success",
  P3: "text-success",
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

function emptyTally(): { P1: number; P2: number; P3: number; Hold: number; Reject: number } {
  return { P1: 0, P2: 0, P3: 0, Hold: 0, Reject: 0 };
}

/** One interviewer's totals across every company in the table above it —
 * the at-a-glance line for tracking a single person over a week/month. */
function InterviewerTotalRow({ companies }: { companies: CompanyTally[] }) {
  const total = companies.reduce(
    (sum, c) => ({
      completed: sum.completed + c.completed,
      P1: sum.P1 + c.P1,
      P2: sum.P2 + c.P2,
      P3: sum.P3 + c.P3,
      Hold: sum.Hold + c.Hold,
      Reject: sum.Reject + c.Reject,
    }),
    { completed: 0, ...emptyTally() },
  );
  const cell = "px-4 py-2.5 font-semibold";
  return (
    <tfoot className="bg-surface-hover">
      <tr>
        <td className={`${cell} text-ink`}>Total</td>
        <td className={`${cell} text-ink`}>{total.completed}</td>
        {(["P1", "P2", "P3", "Hold", "Reject"] as const).map((key) => (
          <td key={key} className={`${cell} ${total[key] > 0 ? BREAKDOWN_TONE[key] : "text-ink-muted"}`}>
            {total[key] || "-"}
          </td>
        ))}
      </tr>
    </tfoot>
  );
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
  const [mode, setMode] = useState<RangeMode>("day");
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");
  const [person, setPerson] = useState("");
  const [showGraph, setShowGraph] = useState(false);

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

  const range = mode === "day" ? { start: selectedDate, end: selectedDate } : computeRange(mode, customStart, customEnd);
  const inRange = (date: string | null) => !!date && date >= range.start && date <= range.end;
  const rangeLabel =
    mode === "day" || range.start === range.end
      ? formatDateLabel(range.start)
      : `${formatDateLabel(range.start)} – ${formatDateLabel(range.end)}`;

  const interviewsInRange = candidates.filter((c) => inRange(c.tech_screening_date) && c.tech_screening_taken_by);
  const callsInRange = candidates.filter((c) => inRange(c.call_date) && c.recruiter);

  // One list for both roles — someone who both interviews and calls shows up
  // once, and picking them narrows both sections to just their own rows.
  const personOptions = Array.from(
    new Set([
      ...interviewsInRange.map((c) => c.tech_screening_taken_by!),
      ...callsInRange.map((c) => c.recruiter!),
      ...(person ? [person] : []),
    ]),
  ).sort((a, b) => a.localeCompare(b));

  const hourOptions = Array.from(
    new Set(interviewsInRange.map((c) => hourOf(c.tech_screening_time)).filter((h): h is number => h !== null)),
  )
    .sort((a, b) => a - b)
    .map((h) => formatHourLabel(h));

  const interviewsFiltered = interviewsInRange.filter((c) => {
    if (person && c.tech_screening_taken_by !== person) return false;
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
      byCompany.set(companyName, { company: companyName, completed: 0, P1: 0, P2: 0, P3: 0, Hold: 0, Reject: 0 });
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

  const callsFiltered = callsInRange.filter((c) => !person || c.recruiter === person);

  // Same counting rules for the table (grouped by recruiter) and the chart
  // (grouped by recruiter, or by day once a single person is picked).
  function tallyCalls(rows: CandidateWithCompany[], keyOf: (c: CandidateWithCompany) => string) {
    const map = new Map<string, RecruiterTally>();
    for (const c of rows) {
      const key = keyOf(c);
      if (!map.has(key)) map.set(key, { recruiter: key, assigned: 0, attempts: 0, interested: 0, ...emptyTally() });
      const tally = map.get(key)!;
      tally.assigned++;
      if (c.call_status && c.call_status.trim() !== "") {
        tally.attempts++;
        if (c.interested) tally.interested++;
        const category = categorizeStatus(c.tr_status);
        if (category !== "Other") tally[category]++;
      }
    }
    return Array.from(map.values());
  }

  const recruiterRows = tallyCalls(callsFiltered, (c) => c.recruiter!).sort((a, b) => b.attempts - a.attempts);

  // Chart x-axis: one column per person normally; once a single person is
  // picked over a multi-day range, one column per day shows their trend.
  const chartByDay = !!person && mode !== "day";
  const interviewOutcomeRows = (() => {
    const map = new Map<string, Record<string, string | number>>();
    for (const c of interviewsFiltered) {
      const category = categorizeStatus(c.tech_status);
      if (category === "Other") continue; // Same "completed" rule as the tables.
      const key = chartByDay ? c.tech_screening_date! : c.tech_screening_taken_by!;
      const row = map.get(key) ?? { key, label: chartByDay ? shortDate(key) : key, total: 0, ...emptyTally() };
      row[category] = (row[category] as number) + 1;
      row.total = (row.total as number) + 1;
      map.set(key, row);
    }
    return Array.from(map.values()).sort((a, b) =>
      chartByDay ? String(a.key).localeCompare(String(b.key)) : (b.total as number) - (a.total as number),
    );
  })();
  const callRows = tallyCalls(callsFiltered, (c) => (chartByDay ? c.call_date! : c.recruiter!))
    .sort((a, b) => (chartByDay ? a.recruiter.localeCompare(b.recruiter) : b.attempts - a.attempts))
    .map((t) => ({
      label: chartByDay ? shortDate(t.recruiter) : t.recruiter,
      assigned: t.assigned,
      attempts: t.attempts,
      interested: t.interested,
    }));

  const callsByDate = new Map<string, number>();
  for (const c of candidates) {
    if (!c.call_date) continue;
    callsByDate.set(c.call_date, (callsByDate.get(c.call_date) ?? 0) + 1);
  }

  return (
    <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
      <div className="flex flex-1 flex-col gap-8 min-w-0">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="text-sm text-ink-secondary">{rangeLabel}</div>
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
            </select>
            {mode === "custom" && (
              <>
                <input
                  type="date"
                  value={customStart}
                  onChange={(e) => setCustomStart(e.target.value)}
                  className={inputClass}
                  suppressHydrationWarning
                />
                <span className="text-ink-muted text-sm">to</span>
                <input
                  type="date"
                  value={customEnd}
                  onChange={(e) => setCustomEnd(e.target.value)}
                  className={inputClass}
                  suppressHydrationWarning
                />
              </>
            )}
            <SelectFilter value={person} onChange={setPerson} options={personOptions} placeholder="All people" />
            <SelectFilter value={hourFilter} onChange={setHourFilter} options={hourOptions} placeholder="All hours" />
            <button
              onClick={() => setShowGraph((v) => !v)}
              aria-pressed={showGraph}
              className={`rounded-md border text-sm px-3 py-2 transition-colors ${
                showGraph
                  ? "border-accent bg-accent-soft text-accent"
                  : "border-line-strong bg-surface text-ink-secondary hover:border-ink-muted hover:text-ink"
              }`}
            >
              {showGraph ? "Hide graph" : "Show graph"}
            </button>
            <button
              onClick={() => setShowCalendar((v) => !v)}
              className="rounded-md border border-line-strong bg-surface text-ink-secondary text-sm px-3 py-2 transition-colors hover:border-ink-muted hover:text-ink"
            >
              {showCalendar ? "Hide calendar" : "Show calendar"}
            </button>
          </div>
        </div>

        {showGraph && !loading && (
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
            <ColumnChartCard
              title={chartByDay ? `${person} — interview outcomes by day` : "Interview outcomes by interviewer"}
              subtitle="Completed tech screenings, split by outcome"
              data={interviewOutcomeRows}
              series={OUTCOME_SERIES}
              stacked
            />
            <ColumnChartCard
              title={chartByDay ? `${person} — calls by day` : "Calls by recruiter"}
              subtitle="Assigned, attempted and interested calls"
              data={callRows}
              series={CALL_SERIES}
            />
          </div>
        )}

        <div className="flex flex-col gap-4">
          <h2 className="text-base font-medium text-ink">Interviewers</h2>
          {loading ? (
            <div className="text-sm text-ink-muted">Loading…</div>
          ) : interviewerGroups.length === 0 ? (
            <div className="text-sm text-ink-muted">
              No tech screenings {mode === "day" ? "on this day" : "in this range"}
              {person ? ` for ${person}` : ""}.
            </div>
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
                      <Th>P3</Th>
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
                        <Td className={c.P3 > 0 ? BREAKDOWN_TONE.P3 : undefined}>{c.P3 || "-"}</Td>
                        <Td className={c.Hold > 0 ? BREAKDOWN_TONE.Hold : undefined}>{c.Hold || "-"}</Td>
                        <Td className={c.Reject > 0 ? BREAKDOWN_TONE.Reject : undefined}>{c.Reject || "-"}</Td>
                      </Tr>
                    ))}
                  </tbody>
                  {(person || group.companies.length > 1) && <InterviewerTotalRow companies={group.companies} />}
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
                <Th>P3</Th>
                <Th>Hold</Th>
                <Th>Reject</Th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <LoadingRow colSpan={9} />
              ) : recruiterRows.length === 0 ? (
                <EmptyRow
                  colSpan={9}
                  label={`No calls logged ${mode === "day" ? "for this day" : "in this range"}${person ? ` for ${person}` : ""}`}
                />
              ) : (
                recruiterRows.map((r) => (
                  <Tr key={r.recruiter}>
                    <Td className="font-medium">{r.recruiter}</Td>
                    <Td>{r.assigned || "-"}</Td>
                    <Td>{r.attempts || "-"}</Td>
                    <Td>{r.interested || "-"}</Td>
                    <Td className={r.P1 > 0 ? BREAKDOWN_TONE.P1 : undefined}>{r.P1 || "-"}</Td>
                    <Td className={r.P2 > 0 ? BREAKDOWN_TONE.P2 : undefined}>{r.P2 || "-"}</Td>
                    <Td className={r.P3 > 0 ? BREAKDOWN_TONE.P3 : undefined}>{r.P3 || "-"}</Td>
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
            if (!date) return;
            setSelectedDate(date);
            setMode("day"); // Picking a date on the calendar means "show me that day".
          }}
        />
      )}
    </div>
  );
}
