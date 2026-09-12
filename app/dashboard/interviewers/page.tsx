"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { computeRange, type DateRangePreset } from "@/lib/dateRange";
import { categorizeStatus } from "@/lib/format";
import { fetchAllRows } from "@/lib/fetchAllRows";
import { useSyncVersion } from "@/lib/useSyncVersion";
import { DateRangeFilter } from "@/components/DateRangeFilter";
import { StackedOutcomeChart } from "@/components/StackedOutcomeChart";
import { Table, Th, Td, Tr, EmptyRow, LoadingRow } from "@/components/Table";
import type { Candidate } from "@/lib/types";

type InterviewerRow = {
  interviewer: string;
  completed: number;
  p1: number;
  p2: number;
  p3: number;
  hold: number;
  reject: number;
};

// Capped the same way Skills/Rejections cap their bar charts — a chart with
// every interviewer who's ever taken a screening in the selected range would
// run off the page; the table below still shows everyone.
const CHART_LIMIT = 15;

export default function InterviewerReportPage() {
  const [preset, setPreset] = useState<DateRangePreset>("this_month");
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [loading, setLoading] = useState(true);
  const syncVersion = useSyncVersion();

  useEffect(() => {
    const range = computeRange(preset, customStart, customEnd);
    const supabase = createClient();
    setLoading(true);
    let cancelled = false;

    fetchAllRows<Candidate>((start, end) =>
      supabase
        .from("candidates")
        .select("tech_screening_taken_by, tech_status, call_date")
        .gte("call_date", range.start)
        .lte("call_date", range.end)
        .range(start, end),
    ).then((data) => {
      if (cancelled) return;
      setCandidates(data);
      setLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, [preset, customStart, customEnd, syncVersion]);

  const byInterviewer = new Map<string, InterviewerRow>();
  for (const c of candidates) {
    const name = c.tech_screening_taken_by;
    if (!name) continue;
    if (!byInterviewer.has(name)) {
      byInterviewer.set(name, { interviewer: name, completed: 0, p1: 0, p2: 0, p3: 0, hold: 0, reject: 0 });
    }
    const row = byInterviewer.get(name)!;
    // "Completed" = an actual outcome was recorded (P1/P2/P3/Hold/Reject) —
    // matches Day Outcome's definition (confirmed with the user 2026-09-04),
    // not just "this candidate was on the schedule" regardless of whether the
    // tech team ever screened them.
    const category = categorizeStatus(c.tech_status);
    if (category === "Other") continue;
    row.completed++;
    if (category === "P1") row.p1++;
    else if (category === "P2") row.p2++;
    else if (category === "P3") row.p3++;
    else if (category === "Hold") row.hold++;
    else if (category === "Reject") row.reject++;
  }
  const rows = Array.from(byInterviewer.values()).sort((a, b) => b.completed - a.completed);
  const chartData = rows.slice(0, CHART_LIMIT).map((r) => ({
    label: r.interviewer,
    P1: r.p1,
    P2: r.p2,
    P3: r.p3,
    Hold: r.hold,
    Reject: r.reject,
  }));

  return (
    <div className="flex flex-col gap-6">
      <DateRangeFilter
        preset={preset}
        customStart={customStart}
        customEnd={customEnd}
        onPresetChange={setPreset}
        onCustomStartChange={setCustomStart}
        onCustomEndChange={setCustomEnd}
      />

      {!loading && rows.length > 0 && (
        <StackedOutcomeChart title="Outcomes by interviewer" data={chartData} />
      )}

      <Table>
        <thead>
          <tr>
            <Th>Interviewer</Th>
            <Th>Completed</Th>
            <Th>P1</Th>
            <Th>P2</Th>
            <Th>P3</Th>
            <Th>Hold</Th>
            <Th>Reject</Th>
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <LoadingRow colSpan={7} />
          ) : rows.length === 0 ? (
            <EmptyRow colSpan={7} />
          ) : (
            rows.map((r) => (
              <Tr key={r.interviewer}>
                <Td className="font-medium">{r.interviewer}</Td>
                <Td>{r.completed}</Td>
                <Td className={r.p1 > 0 ? "text-success" : undefined}>{r.p1}</Td>
                <Td className={r.p2 > 0 ? "text-success" : undefined}>{r.p2}</Td>
                <Td className={r.p3 > 0 ? "text-success" : undefined}>{r.p3}</Td>
                <Td className={r.hold > 0 ? "text-accent" : undefined}>{r.hold}</Td>
                <Td className={r.reject > 0 ? "text-danger" : undefined}>{r.reject}</Td>
              </Tr>
            ))
          )}
        </tbody>
      </Table>
    </div>
  );
}
