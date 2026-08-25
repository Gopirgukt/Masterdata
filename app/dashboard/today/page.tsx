"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useCompanies } from "@/lib/useCompanies";
import { dashIfEmpty, formatStartTime, parseTimeToMinutes, statusToneClass } from "@/lib/format";
import { fetchAllRows } from "@/lib/fetchAllRows";
import { CompanyFilter } from "@/components/CompanyFilter";
import { MiniCalendar, monthOf, type ViewMonth } from "@/components/MiniCalendar";
import { Table, Th, Td, Tr, EmptyRow, LoadingRow } from "@/components/Table";
import type { CandidateWithCompany } from "@/lib/types";

type Bucket = "today" | "tomorrow" | "missed";

// Local date components, not `.toISOString()` — that converts to UTC first,
// which silently shifts "today" back a day for IST users in the early-morning
// hours (confirmed 2026-08-21: this app's users are all IST-based).
function toIsoDate(d: Date): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatDateLabel(iso: string): string {
  const [year, month, day] = iso.split("-").map(Number);
  return new Date(year, month - 1, day).toLocaleDateString(undefined, {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

export default function TodayInterviewsPage() {
  const companies = useCompanies();
  const [companyId, setCompanyId] = useState("");
  const [interviewer, setInterviewer] = useState("");
  const [rows, setRows] = useState<CandidateWithCompany[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeBucket, setActiveBucket] = useState<Bucket>("today");
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  const today = useMemo(() => toIsoDate(new Date()), []);
  const tomorrow = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    return toIsoDate(d);
  }, []);
  const [viewMonth, setViewMonth] = useState<ViewMonth>(() => monthOf(today));

  useEffect(() => {
    let cancelled = false;
    const supabase = createClient();
    setLoading(true);

    async function loadAll() {
      const all = await fetchAllRows<CandidateWithCompany>((start, end) => {
        let query = supabase
          .from("candidates")
          .select("*, companies(name)")
          .not("tech_screening_date", "is", null)
          .range(start, end);

        if (companyId) query = query.eq("company_id", companyId);
        if (interviewer) query = query.eq("tech_screening_taken_by", interviewer);

        return query;
      });

      if (!cancelled) {
        setRows(all);
        setLoading(false);
      }
    }

    loadAll();
    return () => {
      cancelled = true;
    };
  }, [companyId, interviewer]);

  const bucketOf = (dateStr: string | null): Bucket | null => {
    if (!dateStr) return null;
    if (dateStr === today) return "today";
    if (dateStr === tomorrow) return "tomorrow";
    if (dateStr < today) return "missed";
    return null;
  };

  const counts = { today: 0, tomorrow: 0, missed: 0 };
  const countsByDate = new Map<string, number>();
  for (const r of rows) {
    const b = bucketOf(r.tech_screening_date);
    if (b) counts[b]++;
    if (r.tech_screening_date) {
      countsByDate.set(r.tech_screening_date, (countsByDate.get(r.tech_screening_date) ?? 0) + 1);
    }
  }

  const interviewers = Array.from(new Set(rows.map((r) => r.tech_screening_taken_by).filter(Boolean))) as string[];
  const filteredRows = rows
    .filter((r) => (selectedDate ? r.tech_screening_date === selectedDate : bucketOf(r.tech_screening_date) === activeBucket))
    .sort((a, b) => parseTimeToMinutes(a.tech_screening_time) - parseTimeToMinutes(b.tech_screening_time));

  const chips: { key: Bucket; label: string; tone: "accent" | "neutral" | "danger" }[] = [
    { key: "today", label: "Today", tone: "accent" },
    { key: "tomorrow", label: "Tomorrow", tone: "neutral" },
    { key: "missed", label: "Missed", tone: "danger" },
  ];

  const toneClasses: Record<string, { active: string; dot: string }> = {
    accent: { active: "border-accent bg-accent-soft", dot: "bg-accent" },
    neutral: { active: "border-ink-muted bg-surface-hover", dot: "bg-ink-muted" },
    danger: { active: "border-danger bg-danger-soft", dot: "bg-danger" },
  };

  return (
    <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
      <div className="flex flex-1 flex-col gap-6 min-w-0">
        <div className="flex items-center gap-3">
          {chips.map((c) => {
            const tone = toneClasses[c.tone];
            const isActive = !selectedDate && activeBucket === c.key;
            return (
              <button
                key={c.key}
                onClick={() => {
                  setSelectedDate(null);
                  setActiveBucket(c.key);
                }}
                className={`min-w-[140px] rounded-lg border px-4 py-3 text-left transition-colors ${
                  isActive ? tone.active : "border-line bg-surface hover:bg-surface-hover"
                }`}
              >
                <div className="flex items-center gap-2 text-sm text-ink-secondary">
                  <span className={`h-1.5 w-1.5 rounded-full ${tone.dot}`} />
                  {c.label}
                </div>
                <div className="text-2xl font-semibold text-ink">{counts[c.key]}</div>
              </button>
            );
          })}
        </div>

        <div className="flex items-center gap-3">
          <CompanyFilter companies={companies} value={companyId} onChange={setCompanyId} />
          <select
            value={interviewer}
            onChange={(e) => setInterviewer(e.target.value)}
            className="rounded-md border border-line-strong bg-surface text-ink text-sm px-3 py-2 outline-none transition-colors hover:border-ink-muted focus:border-accent focus:ring-2 focus:ring-accent-soft"
            suppressHydrationWarning
          >
            <option value="">All interviewers</option>
            {interviewers.map((i) => (
              <option key={i} value={i}>
                {i}
              </option>
            ))}
          </select>
        </div>

        {selectedDate && (
          <div className="flex items-center gap-3 rounded-md border border-accent bg-accent-soft px-3 py-2 text-sm text-ink">
            <span>
              Showing interviews for <span className="font-medium">{formatDateLabel(selectedDate)}</span>
            </span>
            <button onClick={() => setSelectedDate(null)} className="text-accent hover:underline">
              Clear
            </button>
          </div>
        )}

        <Table>
          <thead>
            <tr>
              <Th>Date</Th>
              <Th>Time</Th>
              <Th>Candidate</Th>
              <Th>Company</Th>
              <Th>Interviewer</Th>
              <Th>Tech team status</Th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <LoadingRow colSpan={6} />
            ) : filteredRows.length === 0 ? (
              <EmptyRow colSpan={6} />
            ) : (
              filteredRows.map((r) => (
                <Tr key={r.id}>
                  <Td>{dashIfEmpty(r.tech_screening_date)}</Td>
                  <Td>{formatStartTime(r.tech_screening_time)}</Td>
                  <Td>{dashIfEmpty(r.name)}</Td>
                  <Td>{r.companies?.name ?? "-"}</Td>
                  <Td>{dashIfEmpty(r.tech_screening_taken_by)}</Td>
                  <Td className={statusToneClass(r.tech_status)}>{dashIfEmpty(r.tech_status)}</Td>
                </Tr>
              ))
            )}
          </tbody>
        </Table>
      </div>

      <MiniCalendar
        view={viewMonth}
        onViewChange={setViewMonth}
        countsByDate={countsByDate}
        selectedDate={selectedDate}
        todayIso={today}
        onSelectDate={(date) => {
          setSelectedDate(date);
          if (date) setViewMonth(monthOf(date));
        }}
      />
    </div>
  );
}
