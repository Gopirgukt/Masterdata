"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { formatDateLabel, toIsoDate } from "@/lib/format";
import { MiniCalendar, monthOf, type ViewMonth } from "@/components/MiniCalendar";
import { Table, Th, Td, Tr, EmptyRow, LoadingRow } from "@/components/Table";
import type { CandidateWithCompany } from "@/lib/types";

type PipelineRow = {
  recruiter: string;
  calls: number;
  interested: number;
  scheduled: number;
  shared: number;
  offer: number;
};

type CompanyDayRow = {
  company: string;
  attempts: number;
  interested: number;
};

export default function RecruiterPipelinePage() {
  const [candidates, setCandidates] = useState<CandidateWithCompany[]>([]);
  const [loading, setLoading] = useState(true);
  const [migrationNeeded, setMigrationNeeded] = useState(false);

  const today = toIsoDate(new Date());
  const [selectedDate, setSelectedDate] = useState<string>(today);
  const [viewMonth, setViewMonth] = useState<ViewMonth>(() => monthOf(today));
  const [showCalendar, setShowCalendar] = useState(false);

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
          .select("recruiter, interested, call_date, tech_screening_date, shared_to_company, company_decision, companies(name)")
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
  }, []);

  const byRecruiter = new Map<string, PipelineRow>();
  const callsByDate = new Map<string, number>();
  const byCompanyOnSelectedDate = new Map<string, CompanyDayRow>();

  for (const c of candidates) {
    const name = c.recruiter;
    if (name) {
      if (!byRecruiter.has(name)) {
        byRecruiter.set(name, { recruiter: name, calls: 0, interested: 0, scheduled: 0, shared: 0, offer: 0 });
      }
      const row = byRecruiter.get(name)!;
      if (c.call_date) row.calls++;
      if (c.interested) row.interested++;
      if (c.tech_screening_date) row.scheduled++;
      if (c.shared_to_company) row.shared++;
      if ((c.company_decision ?? "").toLowerCase().includes("offer")) row.offer++;
    }

    if (c.call_date) {
      callsByDate.set(c.call_date, (callsByDate.get(c.call_date) ?? 0) + 1);

      if (c.call_date === selectedDate) {
        const companyName = c.companies?.name ?? "Unknown";
        if (!byCompanyOnSelectedDate.has(companyName)) {
          byCompanyOnSelectedDate.set(companyName, { company: companyName, attempts: 0, interested: 0 });
        }
        const companyRow = byCompanyOnSelectedDate.get(companyName)!;
        companyRow.attempts++;
        if (c.interested) companyRow.interested++;
      }
    }
  }

  const recruiterRows = Array.from(byRecruiter.values()).sort((a, b) => b.calls - a.calls);
  const companyDayRows = Array.from(byCompanyOnSelectedDate.values()).sort((a, b) => b.attempts - a.attempts);

  return (
    <div className="flex flex-col gap-8">
      {migrationNeeded && (
        <div className="flex items-start gap-3 rounded-lg border border-warning/40 bg-warning-soft px-4 py-3 text-sm text-ink">
          <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5 shrink-0 text-warning mt-0.5">
            <path d="M10 2.5l8 14H2l8-14z" />
            <path d="M10 8v3.5M10 14.2v.3" />
          </svg>
          <div>
            This view needs the <code className="text-ink-secondary">recruiter</code> and{" "}
            <code className="text-ink-secondary">interested</code> columns on{" "}
            <code className="text-ink-secondary">candidates</code>, which aren&apos;t in the database yet. Run{" "}
            <code className="text-ink-secondary">migrations/001_recruiter_pipeline.sql</code> in the Supabase SQL
            editor, then reload this page.
          </div>
        </div>
      )}

      <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
        <div className="flex flex-1 flex-col gap-3 min-w-0">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-medium text-ink">Companies worked — {formatDateLabel(selectedDate)}</h2>
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
                <Th>Attempts</Th>
                <Th>Interested</Th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <LoadingRow colSpan={3} />
              ) : migrationNeeded ? (
                <EmptyRow colSpan={3} label="Run the migration above to see pipeline data" />
              ) : companyDayRows.length === 0 ? (
                <EmptyRow colSpan={3} label="No calls logged for this day" />
              ) : (
                companyDayRows.map((r) => (
                  <Tr key={r.company}>
                    <Td className="font-medium">{r.company}</Td>
                    <Td>{r.attempts}</Td>
                    <Td>{r.interested}</Td>
                  </Tr>
                ))
              )}
            </tbody>
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
              if (date) setSelectedDate(date);
            }}
          />
        )}
      </div>

      <div className="flex flex-col gap-3">
        <h2 className="text-base font-medium text-ink">All-time by recruiter</h2>
        <Table>
          <thead>
            <tr>
              <Th>Recruiter</Th>
              <Th>Calls</Th>
              <Th>Interested</Th>
              <Th>Scheduled</Th>
              <Th>Shared</Th>
              <Th>Offer</Th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <LoadingRow colSpan={6} />
            ) : migrationNeeded ? (
              <EmptyRow colSpan={6} label="Run the migration above to see pipeline data" />
            ) : recruiterRows.length === 0 ? (
              <EmptyRow colSpan={6} />
            ) : (
              recruiterRows.map((r) => (
                <Tr key={r.recruiter}>
                  <Td className="font-medium">{r.recruiter}</Td>
                  <Td>{r.calls}</Td>
                  <Td>{r.interested}</Td>
                  <Td>{r.scheduled}</Td>
                  <Td>{r.shared}</Td>
                  <Td className={r.offer > 0 ? "text-success font-medium" : undefined}>{r.offer}</Td>
                </Tr>
              ))
            )}
          </tbody>
        </Table>
      </div>
    </div>
  );
}
