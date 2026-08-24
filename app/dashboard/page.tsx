"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { useCompanies } from "@/lib/useCompanies";
import { computeRange, type DateRangePreset } from "@/lib/dateRange";
import { dashIfEmpty, statusToneClass } from "@/lib/format";
import { fetchAllRows } from "@/lib/fetchAllRows";
import { CompanyFilter } from "@/components/CompanyFilter";
import { DateRangeFilter } from "@/components/DateRangeFilter";
import { StatTile } from "@/components/StatTile";
import { Table, Th, Td, Tr, EmptyRow, LoadingRow } from "@/components/Table";
import { Badge } from "@/components/Badge";
import { ShowMoreButton } from "@/components/ShowMoreButton";
import { usePagedReveal } from "@/lib/usePagedReveal";
import type { CandidateWithCompany } from "@/lib/types";

type StatFilter = "all" | "techScreened" | "shared" | "hired";

export default function OverviewPage() {
  const companies = useCompanies();
  const [companyId, setCompanyId] = useState("");
  const [preset, setPreset] = useState<DateRangePreset>("this_month");
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");
  const [rows, setRows] = useState<CandidateWithCompany[]>([]);
  const [loading, setLoading] = useState(true);
  const [statFilter, setStatFilter] = useState<StatFilter>("all");

  useEffect(() => {
    const range = computeRange(preset, customStart, customEnd);
    const supabase = createClient();
    setLoading(true);
    let cancelled = false;

    fetchAllRows<CandidateWithCompany>((start, end) => {
      let query = supabase
        .from("candidates")
        .select("*, companies(name)")
        .gte("call_date", range.start)
        .lte("call_date", range.end)
        .range(start, end);

      if (companyId) query = query.eq("company_id", companyId);
      return query;
    }).then((data) => {
      if (cancelled) return;
      setRows(data);
      setLoading(false);
      setStatFilter("all");
    });

    return () => {
      cancelled = true;
    };
  }, [companyId, preset, customStart, customEnd]);

  const candidatesAdded = rows.length;
  const techScreenedRows = rows.filter((r) => r.tech_status != null && r.tech_status !== "");
  const sharedRows = rows.filter((r) => r.shared_to_company === true);
  const hiredRows = rows.filter((r) => r.company_decision === "Hired");

  const filteredRows =
    statFilter === "techScreened"
      ? techScreenedRows
      : statFilter === "shared"
        ? sharedRows
        : statFilter === "hired"
          ? hiredRows
          : rows;

  function toggleFilter(filter: StatFilter) {
    setStatFilter((current) => (current === filter ? "all" : filter));
  }

  const { visible, showMore, visibleCount, total } = usePagedReveal(
    filteredRows,
    20,
    `${companyId}|${preset}|${customStart}|${customEnd}|${statFilter}`,
  );

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center gap-3">
        <CompanyFilter companies={companies} value={companyId} onChange={setCompanyId} />
        <DateRangeFilter
          preset={preset}
          customStart={customStart}
          customEnd={customEnd}
          onPresetChange={setPreset}
          onCustomStartChange={setCustomStart}
          onCustomEndChange={setCustomEnd}
        />
      </div>

      <div className="grid grid-cols-4 gap-4">
        <StatTile
          label="Candidates added"
          value={candidatesAdded}
          accent="accent"
          active={statFilter === "all"}
          onClick={() => setStatFilter("all")}
        />
        <StatTile
          label="Tech screened"
          value={techScreenedRows.length}
          accent="accent"
          active={statFilter === "techScreened"}
          onClick={() => toggleFilter("techScreened")}
        />
        <StatTile
          label="Shared to company"
          value={sharedRows.length}
          accent="accent"
          active={statFilter === "shared"}
          onClick={() => toggleFilter("shared")}
        />
        <StatTile
          label="Hired"
          value={hiredRows.length}
          accent="success"
          active={statFilter === "hired"}
          onClick={() => toggleFilter("hired")}
        />
      </div>

      {!loading && filteredRows.length > 0 && (
        <div className="text-xs text-ink-muted">
          Showing {visibleCount} of {total}
          {statFilter !== "all" && <> — filtered</>}
        </div>
      )}

      <Table>
        <thead>
          <tr>
            <Th>Company</Th>
            <Th>Candidate</Th>
            <Th>TR status</Th>
            <Th>Tech team status</Th>
            <Th>Shared</Th>
            <Th>Company decision</Th>
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <LoadingRow colSpan={6} />
          ) : filteredRows.length === 0 ? (
            <EmptyRow colSpan={6} label={statFilter === "all" ? "No results" : "No candidates match this filter"} />
          ) : (
            visible.map((r) => (
              <Tr key={r.id}>
                <Td>{r.companies?.name ?? "-"}</Td>
                <Td>
                  <Link
                    href={`/dashboard/history?name=${encodeURIComponent(r.name ?? "")}`}
                    className="text-accent hover:text-accent-hover hover:underline"
                  >
                    {r.name ?? "-"}
                  </Link>
                </Td>
                <Td className={statusToneClass(r.tr_status)}>{dashIfEmpty(r.tr_status)}</Td>
                <Td className={statusToneClass(r.tech_status)}>{dashIfEmpty(r.tech_status)}</Td>
                <Td>
                  <Badge tone={r.shared_to_company ? "accent" : "neutral"}>{r.shared_to_company ? "Yes" : "No"}</Badge>
                </Td>
                <Td>
                  {r.company_decision ? (
                    <Badge tone={r.company_decision === "Hired" ? "success" : "neutral"}>{r.company_decision}</Badge>
                  ) : (
                    <span className="text-ink-muted">-</span>
                  )}
                </Td>
              </Tr>
            ))
          )}
        </tbody>
      </Table>

      {!loading && <ShowMoreButton visibleCount={visibleCount} total={total} onClick={showMore} />}
    </div>
  );
}
