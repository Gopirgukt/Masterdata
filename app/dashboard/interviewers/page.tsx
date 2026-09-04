"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { computeRange, type DateRangePreset } from "@/lib/dateRange";
import { fetchAllRows } from "@/lib/fetchAllRows";
import { useSyncVersion } from "@/lib/useSyncVersion";
import { DateRangeFilter } from "@/components/DateRangeFilter";
import { Table, Th, Td, Tr, EmptyRow, LoadingRow } from "@/components/Table";
import type { Candidate } from "@/lib/types";

type InterviewerRow = {
  interviewer: string;
  interviews: number;
  p1: number;
  p2: number;
  hold: number;
  reject: number;
};

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
      byInterviewer.set(name, { interviewer: name, interviews: 0, p1: 0, p2: 0, hold: 0, reject: 0 });
    }
    const row = byInterviewer.get(name)!;
    row.interviews++;
    const status = (c.tech_status ?? "").toLowerCase();
    if (status.includes("p1")) row.p1++;
    if (status.includes("p2")) row.p2++;
    if (status.includes("hold")) row.hold++;
    if (status.includes("reject")) row.reject++;
  }
  const rows = Array.from(byInterviewer.values()).sort((a, b) => b.interviews - a.interviews);

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

      <Table>
        <thead>
          <tr>
            <Th>Interviewer</Th>
            <Th>Interviews</Th>
            <Th>P1</Th>
            <Th>P2</Th>
            <Th>Hold</Th>
            <Th>Reject</Th>
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <LoadingRow colSpan={6} />
          ) : rows.length === 0 ? (
            <EmptyRow colSpan={6} />
          ) : (
            rows.map((r) => (
              <Tr key={r.interviewer}>
                <Td className="font-medium">{r.interviewer}</Td>
                <Td>{r.interviews}</Td>
                <Td className={r.p1 > 0 ? "text-success" : undefined}>{r.p1}</Td>
                <Td className={r.p2 > 0 ? "text-success" : undefined}>{r.p2}</Td>
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
