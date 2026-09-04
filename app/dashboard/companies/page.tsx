"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useCompanies } from "@/lib/useCompanies";
import { fetchAllRows } from "@/lib/fetchAllRows";
import { useSyncVersion } from "@/lib/useSyncVersion";
import { Table, Th, Td, Tr, EmptyRow, LoadingRow } from "@/components/Table";
import { AccessIssuesBanner } from "@/components/AccessIssuesBanner";
import { StatTile } from "@/components/StatTile";
import { SelectFilter } from "@/components/SelectFilter";
import type { Candidate } from "@/lib/types";

function successTone(pct: number): string {
  if (pct >= 50) return "text-success";
  if (pct >= 20) return "text-warning";
  return "text-ink";
}

// The later-stage funnel (Screening -> TR1 -> TR2 -> HR/MR -> Hired) uses
// "Selected"/"Rejected"/"No Show"/etc. at each stage except the last, which is
// literally "Hired" or blank (confirmed 2026-08-26 against real sheet data —
// Anvi Robotics, Garaaz, Quickwork, and others track this beyond the existing
// tr_status/tech_status columns). Each stage's count is "reached and passed
// this stage" — a standard funnel, monotonically non-increasing left to right.
function isSelected(status: string | null): boolean {
  return (status ?? "").trim().toLowerCase() === "selected";
}
function isHired(status: string | null): boolean {
  return (status ?? "").trim().toLowerCase() === "hired";
}

type CompanyRow = {
  id: string;
  name: string;
  total: number;
  selected: number;
  rejected: number;
  screening: number;
  tr1: number;
  tr2: number;
  hrMr: number;
  hired: number;
};

export default function CompanyAnalyticsPage() {
  const router = useRouter();
  const companies = useCompanies();
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [loading, setLoading] = useState(true);
  const [tr1Filter, setTr1Filter] = useState("");
  const [tr2Filter, setTr2Filter] = useState("");
  const [hrMrFilter, setHrMrFilter] = useState("");
  const syncVersion = useSyncVersion();

  useEffect(() => {
    const supabase = createClient();
    setLoading(true);
    fetchAllRows<Candidate>((start, end) =>
      supabase
        .from("candidates")
        .select("id, company_id, tech_status, screening_status, tr1_status, tr2_status, hr_mr_status, hired_status")
        .range(start, end),
    ).then((data) => {
      setCandidates(data);
      setLoading(false);
    });
  }, [syncVersion]);

  const tr1Options = Array.from(new Set(candidates.map((c) => c.tr1_status).filter(Boolean))) as string[];
  const tr2Options = Array.from(new Set(candidates.map((c) => c.tr2_status).filter(Boolean))) as string[];
  const hrMrOptions = Array.from(new Set(candidates.map((c) => c.hr_mr_status).filter(Boolean))) as string[];

  const filteredCandidates = candidates.filter(
    (c) =>
      (!tr1Filter || c.tr1_status === tr1Filter) &&
      (!tr2Filter || c.tr2_status === tr2Filter) &&
      (!hrMrFilter || c.hr_mr_status === hrMrFilter),
  );

  const totalHired = filteredCandidates.filter((c) => isHired(c.hired_status)).length;

  const rows: CompanyRow[] = companies.map((c) => {
    const forCompany = filteredCandidates.filter((cand) => cand.company_id === c.id);
    const total = forCompany.length;
    const selected = forCompany.filter((cand) => (cand.tech_status ?? "").toLowerCase().includes("select")).length;
    const rejected = forCompany.filter((cand) => (cand.tech_status ?? "").toLowerCase().includes("reject")).length;
    return {
      id: c.id,
      name: c.name,
      total,
      selected,
      rejected,
      screening: forCompany.filter((cand) => isSelected(cand.screening_status)).length,
      tr1: forCompany.filter((cand) => isSelected(cand.tr1_status)).length,
      tr2: forCompany.filter((cand) => isSelected(cand.tr2_status)).length,
      hrMr: forCompany.filter((cand) => isSelected(cand.hr_mr_status)).length,
      hired: forCompany.filter((cand) => isHired(cand.hired_status)).length,
    };
  });

  return (
    <div className="flex flex-col gap-6">
      <AccessIssuesBanner companies={companies} />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3 max-w-xl">
        <StatTile label="Total Hired" value={loading ? "…" : totalHired} accent="success" />
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <SelectFilter value={tr1Filter} onChange={setTr1Filter} options={tr1Options} placeholder="All TR1 statuses" />
        <SelectFilter value={tr2Filter} onChange={setTr2Filter} options={tr2Options} placeholder="All TR2 statuses" />
        <SelectFilter value={hrMrFilter} onChange={setHrMrFilter} options={hrMrOptions} placeholder="All HR/MR statuses" />
      </div>

      <Table>
        <thead>
          <tr>
            <Th>Company</Th>
            <Th>Total</Th>
            <Th>Selected</Th>
            <Th>Rejected</Th>
            <Th>Success %</Th>
            <Th>Screening</Th>
            <Th>TR 1</Th>
            <Th>TR 2</Th>
            <Th>HR/MR</Th>
            <Th>Hired</Th>
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <LoadingRow colSpan={10} />
          ) : rows.length === 0 ? (
            <EmptyRow colSpan={10} />
          ) : (
            rows.map((r) => {
              const successPct = r.total > 0 ? Math.round((r.selected / r.total) * 100) : 0;
              return (
                <Tr key={r.id} onClick={() => router.push(`/dashboard/search?company=${r.id}`)}>
                  <Td>{r.name}</Td>
                  <Td>{r.total}</Td>
                  <Td>{r.selected}</Td>
                  <Td>{r.rejected}</Td>
                  <Td className={`font-medium ${successTone(successPct)}`}>{successPct}%</Td>
                  <Td>{r.screening || "-"}</Td>
                  <Td>{r.tr1 || "-"}</Td>
                  <Td>{r.tr2 || "-"}</Td>
                  <Td>{r.hrMr || "-"}</Td>
                  <Td className={r.hired > 0 ? "text-success font-medium" : undefined}>{r.hired || "-"}</Td>
                </Tr>
              );
            })
          )}
        </tbody>
      </Table>
    </div>
  );
}
