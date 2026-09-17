"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { fetchAllRows } from "@/lib/fetchAllRows";
import { dashIfEmpty } from "@/lib/format";
import { SearchInput } from "@/components/SearchInput";
import { SelectFilter } from "@/components/SelectFilter";
import { StatTile } from "@/components/StatTile";
import { ShowMoreButton } from "@/components/ShowMoreButton";
import { usePagedReveal } from "@/lib/usePagedReveal";
import { Table, Th, Td, Tr, EmptyRow, LoadingRow } from "@/components/Table";
import type { JobOpening } from "@/lib/types";

function monthKey(iso: string | null): string {
  return iso ? iso.slice(0, 7) : "";
}

function monthLabel(key: string): string {
  const [year, month] = key.split("-").map(Number);
  return new Date(year, month - 1, 1).toLocaleDateString("en-US", { month: "long", year: "numeric" });
}

function formatDate(iso: string | null): string {
  if (!iso) return "-";
  const [year, month, day] = iso.split("-").map(Number);
  return new Date(year, month - 1, day).toLocaleDateString("en-US", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export default function JobOpeningsPage() {
  const [openings, setOpenings] = useState<JobOpening[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [month, setMonth] = useState("");
  const [recruiter, setRecruiter] = useState("");
  const [status, setStatus] = useState("");

  useEffect(() => {
    const supabase = createClient();
    setLoading(true);
    fetchAllRows<JobOpening>((start, end) =>
      supabase.from("job_openings").select("*").order("requested_date", { ascending: false }).range(start, end),
    ).then((data) => {
      setOpenings(data);
      setLoading(false);
    });
  }, []);

  const monthOptions = Array.from(new Set(openings.map((o) => monthKey(o.requested_date)).filter(Boolean))).sort(
    (a, b) => (a < b ? 1 : -1),
  );
  const recruiterOptions = Array.from(new Set(openings.map((o) => o.technical_recruiter).filter(Boolean))) as string[];
  const statusOptions = Array.from(new Set(openings.map((o) => o.status).filter(Boolean))) as string[];

  const filtered = openings.filter((o) => {
    if (month && monthKey(o.requested_date) !== month) return false;
    if (recruiter && o.technical_recruiter !== recruiter) return false;
    if (status && o.status !== status) return false;
    if (search && !o.company_name.toLowerCase().includes(search.toLowerCase()) && !(o.role ?? "").toLowerCase().includes(search.toLowerCase())) {
      return false;
    }
    return true;
  });

  const totalCompanies = new Set(filtered.map((o) => o.company_name.trim().toLowerCase())).size;
  const totalRoles = filtered.length;
  const totalOpenings = filtered.reduce((sum, o) => sum + (o.openings ?? 0), 0);

  const filterKey = `${search}|${month}|${recruiter}|${status}`;
  const { visible, showMore, total, visibleCount } = usePagedReveal(filtered, 30, filterKey);

  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatTile label="Companies" value={totalCompanies} accent="accent" />
        <StatTile label="Roles / JDs" value={totalRoles} accent="success" />
        <StatTile label="Total openings" value={totalOpenings} accent="warning" />
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <SearchInput value={search} onChange={setSearch} placeholder="Search company or role" />
        <SelectFilter
          value={month}
          onChange={setMonth}
          options={monthOptions}
          placeholder="All months"
          getLabel={monthLabel}
        />
        <SelectFilter value={recruiter} onChange={setRecruiter} options={recruiterOptions} placeholder="All recruiters" />
        <SelectFilter value={status} onChange={setStatus} options={statusOptions} placeholder="All statuses" />
      </div>

      <div className="text-sm text-ink-secondary">
        Showing {visibleCount} of {total} openings
      </div>

      <Table>
        <thead>
          <tr>
            <Th>Requested</Th>
            <Th>Company</Th>
            <Th>Role</Th>
            <Th>Experience</Th>
            <Th>CTC</Th>
            <Th>Openings</Th>
            <Th>Recruiter</Th>
            <Th>Status</Th>
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <LoadingRow colSpan={8} />
          ) : visible.length === 0 ? (
            <EmptyRow colSpan={8} />
          ) : (
            visible.map((o) => (
              <Tr key={o.id}>
                <Td>{formatDate(o.requested_date)}</Td>
                <Td className="font-medium">{o.company_name}</Td>
                <Td>{dashIfEmpty(o.role)}</Td>
                <Td>{dashIfEmpty(o.years_of_experience)}</Td>
                <Td>{dashIfEmpty(o.ctc)}</Td>
                <Td>{o.openings ?? "-"}</Td>
                <Td>{dashIfEmpty(o.technical_recruiter)}</Td>
                <Td>{dashIfEmpty(o.status)}</Td>
              </Tr>
            ))
          )}
        </tbody>
      </Table>

      <ShowMoreButton visibleCount={visibleCount} total={total} onClick={showMore} />
    </div>
  );
}
