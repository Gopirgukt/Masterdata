"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useCompanies } from "@/lib/useCompanies";
import { useDistinctValues } from "@/lib/useDistinctValues";
import { dashIfEmpty, recordingHref, statusToneClass } from "@/lib/format";
import { fetchAllRows } from "@/lib/fetchAllRows";
import { usePagedReveal } from "@/lib/usePagedReveal";
import { useSyncVersion } from "@/lib/useSyncVersion";
import { Table, Th, Td, Tr, EmptyRow, LoadingRow } from "@/components/Table";
import { Badge } from "@/components/Badge";
import { SearchInput } from "@/components/SearchInput";
import { CompanyFilter } from "@/components/CompanyFilter";
import { SelectFilter } from "@/components/SelectFilter";
import { ShowMoreButton } from "@/components/ShowMoreButton";
import type { CandidateWithCompany } from "@/lib/types";

function CandidateSearchInner() {
  const searchParams = useSearchParams();
  const companies = useCompanies();
  const callDoneByOptions = useDistinctValues("call_done_by");
  const trStatusOptions = useDistinctValues("tr_status");
  const techScreeningTakenByOptions = useDistinctValues("tech_screening_taken_by");
  const techStatusOptions = useDistinctValues("tech_status");

  const [search, setSearch] = useState("");
  const [companyId, setCompanyId] = useState(searchParams.get("company") ?? "");
  const [callDoneBy, setCallDoneBy] = useState("");
  const [callDate, setCallDate] = useState("");
  const [trStatus, setTrStatus] = useState("");
  const [techScreeningTakenBy, setTechScreeningTakenBy] = useState("");
  const [techStatus, setTechStatus] = useState("");
  const [rows, setRows] = useState<CandidateWithCompany[]>([]);
  const [loading, setLoading] = useState(true);
  const [remarksOnly, setRemarksOnly] = useState(false);
  const syncVersion = useSyncVersion();

  useEffect(() => {
    const supabase = createClient();
    setLoading(true);
    let cancelled = false;

    const timeout = setTimeout(() => {
      fetchAllRows<CandidateWithCompany>((start, end) => {
        let query = supabase
          .from("candidates")
          .select("*, companies(name)")
          .range(start, end);
        if (companyId) query = query.eq("company_id", companyId);
        if (callDoneBy) query = query.eq("call_done_by", callDoneBy);
        if (callDate) query = query.eq("call_date", callDate);
        if (trStatus) query = query.eq("tr_status", trStatus);
        if (techScreeningTakenBy) query = query.eq("tech_screening_taken_by", techScreeningTakenBy);
        if (techStatus) query = query.eq("tech_status", techStatus);
        if (search.trim() !== "") {
          const term = search.trim();
          query = query.or(`name.ilike.%${term}%,phone.ilike.%${term}%`);
        }
        return query;
      }).then((data) => {
        if (cancelled) return;
        setRows(data);
        setLoading(false);
      });
    }, 250);

    return () => {
      cancelled = true;
      clearTimeout(timeout);
    };
  }, [search, companyId, callDoneBy, callDate, trStatus, techScreeningTakenBy, techStatus, syncVersion]);

  const filteredRows = remarksOnly ? rows.filter((r) => (r.tech_remarks ?? "").trim() !== "") : rows;
  const { visible, showMore, visibleCount, total } = usePagedReveal(
    filteredRows,
    20,
    `${search}|${companyId}|${callDoneBy}|${callDate}|${trStatus}|${techScreeningTakenBy}|${techStatus}|${remarksOnly}`,
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-4">
        <SearchInput value={search} onChange={setSearch} placeholder="Search by name or phone..." />
        <label className="flex items-center gap-2 text-sm text-ink-secondary cursor-pointer select-none">
          <input
            type="checkbox"
            checked={remarksOnly}
            onChange={(e) => setRemarksOnly(e.target.checked)}
            className="h-4 w-4 rounded border-line-strong accent-accent"
            suppressHydrationWarning
          />
          Remarks added only
        </label>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <CompanyFilter companies={companies} value={companyId} onChange={setCompanyId} />
        <SelectFilter value={callDoneBy} onChange={setCallDoneBy} options={callDoneByOptions} placeholder="Call done by" />
        <input
          type="date"
          value={callDate}
          onChange={(e) => setCallDate(e.target.value)}
          title="Call date"
          className="rounded-md border border-line-strong bg-surface text-ink text-sm px-3 py-2 outline-none transition-colors hover:border-ink-muted focus:border-accent focus:ring-2 focus:ring-accent-soft"
          suppressHydrationWarning
        />
        <SelectFilter value={trStatus} onChange={setTrStatus} options={trStatusOptions} placeholder="TR status" />
        <SelectFilter
          value={techScreeningTakenBy}
          onChange={setTechScreeningTakenBy}
          options={techScreeningTakenByOptions}
          placeholder="Tech screening taken by"
        />
        <SelectFilter value={techStatus} onChange={setTechStatus} options={techStatusOptions} placeholder="Tech team status" />
      </div>

      {!loading && filteredRows.length > 0 && (
        <div className="text-xs text-ink-muted">
          Showing {visibleCount} of {total}
        </div>
      )}

      <Table>
        <thead>
          <tr>
            <Th>Company</Th>
            <Th>Candidate</Th>
            <Th>Call done by</Th>
            <Th>Call date</Th>
            <Th>TR status</Th>
            <Th>Tech screening taken by</Th>
            <Th>Tech team status</Th>
            <Th>Tech team remarks</Th>
            <Th>Recording link</Th>
            <Th>Shared to company</Th>
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <LoadingRow colSpan={10} />
          ) : filteredRows.length === 0 ? (
            <EmptyRow colSpan={10} label={remarksOnly ? "No candidates with remarks yet" : "No results"} />
          ) : (
            visible.map((r) => {
              const recording = recordingHref(r.recording_link);
              return (
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
                  <Td>{dashIfEmpty(r.call_done_by)}</Td>
                  <Td>{dashIfEmpty(r.call_date)}</Td>
                  <Td className={statusToneClass(r.tr_status)}>{dashIfEmpty(r.tr_status)}</Td>
                  <Td>{dashIfEmpty(r.tech_screening_taken_by)}</Td>
                  <Td className={statusToneClass(r.tech_status)}>{dashIfEmpty(r.tech_status)}</Td>
                  <Td>
                    <span className="line-clamp-2 max-w-xs" title={r.tech_remarks ?? undefined}>
                      {dashIfEmpty(r.tech_remarks)}
                    </span>
                  </Td>
                  <Td>
                    {recording.href ? (
                      <a
                        href={recording.href}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-accent hover:text-accent-hover hover:underline"
                      >
                        {recording.label}
                      </a>
                    ) : (
                      <span className="italic text-ink-muted">{recording.label}</span>
                    )}
                  </Td>
                  <Td>
                    <Badge tone={r.shared_to_company ? "accent" : "neutral"}>{r.shared_to_company ? "Yes" : "No"}</Badge>
                  </Td>
                </Tr>
              );
            })
          )}
        </tbody>
      </Table>

      {!loading && <ShowMoreButton visibleCount={visibleCount} total={total} onClick={showMore} />}
    </div>
  );
}

export default function CandidateSearchPage() {
  return (
    <Suspense>
      <CandidateSearchInner />
    </Suspense>
  );
}
