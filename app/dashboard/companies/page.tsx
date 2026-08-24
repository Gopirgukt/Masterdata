"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useCompanies } from "@/lib/useCompanies";
import { fetchAllRows } from "@/lib/fetchAllRows";
import { Table, Th, Td, Tr, EmptyRow, LoadingRow } from "@/components/Table";
import { AccessIssuesBanner } from "@/components/AccessIssuesBanner";
import type { Candidate } from "@/lib/types";

function successTone(pct: number): string {
  if (pct >= 50) return "text-success";
  if (pct >= 20) return "text-warning";
  return "text-ink";
}

type CompanyRow = {
  id: string;
  name: string;
  total: number;
  selected: number;
  rejected: number;
};

export default function CompanyAnalyticsPage() {
  const router = useRouter();
  const companies = useCompanies();
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const supabase = createClient();
    setLoading(true);
    fetchAllRows<Candidate>((start, end) =>
      supabase.from("candidates").select("id, company_id, tech_status").range(start, end),
    ).then((data) => {
      setCandidates(data);
      setLoading(false);
    });
  }, []);

  const rows: CompanyRow[] = companies.map((c) => {
    const forCompany = candidates.filter((cand) => cand.company_id === c.id);
    const total = forCompany.length;
    const selected = forCompany.filter((cand) => (cand.tech_status ?? "").toLowerCase().includes("select")).length;
    const rejected = forCompany.filter((cand) => (cand.tech_status ?? "").toLowerCase().includes("reject")).length;
    return { id: c.id, name: c.name, total, selected, rejected };
  });

  return (
    <div className="flex flex-col gap-6">
      <AccessIssuesBanner companies={companies} />

      <Table>
        <thead>
          <tr>
            <Th>Company</Th>
            <Th>Total</Th>
            <Th>Selected</Th>
            <Th>Rejected</Th>
            <Th>Success %</Th>
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <LoadingRow colSpan={5} />
          ) : rows.length === 0 ? (
            <EmptyRow colSpan={5} />
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
                </Tr>
              );
            })
          )}
        </tbody>
      </Table>
    </div>
  );
}
