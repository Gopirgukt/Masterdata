"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Table, Th, Td, Tr, EmptyRow, LoadingRow } from "@/components/Table";
import type { Candidate } from "@/lib/types";

type PipelineRow = {
  recruiter: string;
  calls: number;
  interested: number;
  scheduled: number;
  shared: number;
  offer: number;
};

export default function RecruiterPipelinePage() {
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [loading, setLoading] = useState(true);
  const [migrationNeeded, setMigrationNeeded] = useState(false);

  useEffect(() => {
    const supabase = createClient();
    setLoading(true);

    async function loadAll() {
      const all: Candidate[] = [];
      let offset = 0;
      const pageSize = 1000;

      while (true) {
        const { data, error } = await supabase
          .from("candidates")
          .select("recruiter, interested, call_date, tech_screening_date, shared_to_company, company_decision")
          .range(offset, offset + pageSize - 1);

        if (error) {
          setMigrationNeeded(true);
          setLoading(false);
          return;
        }
        const page = (data as unknown as Candidate[]) ?? [];
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
  for (const c of candidates) {
    const name = c.recruiter;
    if (!name) continue;
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
  const rows = Array.from(byRecruiter.values()).sort((a, b) => b.calls - a.calls);

  return (
    <div className="flex flex-col gap-6">
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
          ) : rows.length === 0 ? (
            <EmptyRow colSpan={6} />
          ) : (
            rows.map((r) => (
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
  );
}
