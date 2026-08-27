"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useCompanies } from "@/lib/useCompanies";
import { fetchAllRows } from "@/lib/fetchAllRows";
import { dashIfEmpty, statusToneClass } from "@/lib/format";
import { CompanyFilter } from "@/components/CompanyFilter";
import { SelectFilter } from "@/components/SelectFilter";
import { ShowMoreButton } from "@/components/ShowMoreButton";
import { usePagedReveal } from "@/lib/usePagedReveal";
import { Table, Th, Td, Tr, EmptyRow, LoadingRow } from "@/components/Table";
import type { CandidateWithCompany } from "@/lib/types";

const ROUND_FIELDS = [
  { key: "screening_status", label: "Screening" },
  { key: "tr1_status", label: "TR 1" },
  { key: "tr2_status", label: "TR 2" },
  { key: "hr_mr_status", label: "HR/MR" },
  { key: "hired_status", label: "Hired" },
] as const;

export default function CompanySheetPage() {
  const companies = useCompanies();
  const [candidates, setCandidates] = useState<CandidateWithCompany[]>([]);
  const [loading, setLoading] = useState(true);
  const [companyId, setCompanyId] = useState("");
  const [roundFilters, setRoundFilters] = useState<Record<string, string>>({});

  useEffect(() => {
    const supabase = createClient();
    setLoading(true);
    fetchAllRows<CandidateWithCompany>((start, end) =>
      supabase
        .from("candidates")
        .select(
          "id, name, company_id, companies(name), screening_status, tr1_status, tr2_status, hr_mr_status, hired_status",
        )
        .eq("shared_to_company", true)
        .range(start, end),
    ).then((data) => {
      setCandidates(data);
      setLoading(false);
    });
  }, []);

  const roundOptions: Record<string, string[]> = {};
  for (const { key } of ROUND_FIELDS) {
    roundOptions[key] = Array.from(
      new Set(candidates.map((c) => (c as unknown as Record<string, string | null>)[key]).filter(Boolean)),
    ) as string[];
  }

  const hasAnyRoundData = (c: CandidateWithCompany) => {
    const record = c as unknown as Record<string, string | null>;
    return ROUND_FIELDS.some(({ key }) => !!record[key]);
  };

  // Only a handful of companies track this funnel at all (confirmed
  // 2026-08-27) — most shared candidates will have every round blank, not
  // because of a bug but because that company's sheet never had these
  // columns. Sorting rows with data first (rather than default/insertion
  // order) means the page actually shows something useful without the
  // company filter, instead of 30 blank rows from an untracked company.
  const filtered = candidates
    .filter((c) => {
      if (companyId && c.company_id !== companyId) return false;
      const record = c as unknown as Record<string, string | null>;
      for (const { key } of ROUND_FIELDS) {
        const wanted = roundFilters[key];
        if (wanted && record[key] !== wanted) return false;
      }
      return true;
    })
    .sort((a, b) => Number(hasAnyRoundData(b)) - Number(hasAnyRoundData(a)));

  const companiesWithRoundData = Array.from(
    new Set(candidates.filter(hasAnyRoundData).map((c) => c.companies?.name).filter(Boolean)),
  ) as string[];

  const filterKey = `${companyId}|${JSON.stringify(roundFilters)}`;
  const { visible, showMore, total, visibleCount } = usePagedReveal(filtered, 30, filterKey);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center gap-3">
        <CompanyFilter companies={companies} value={companyId} onChange={setCompanyId} />
        {ROUND_FIELDS.map(({ key, label }) => (
          <SelectFilter
            key={key}
            value={roundFilters[key] ?? ""}
            onChange={(v) => setRoundFilters((prev) => ({ ...prev, [key]: v }))}
            options={roundOptions[key]}
            placeholder={`All ${label}`}
          />
        ))}
      </div>

      {!loading && companiesWithRoundData.length > 0 && (
        <div className="rounded-md border border-line bg-surface px-3 py-2 text-sm text-ink-secondary">
          Only these companies track Screening/TR1/TR2/HR-MR/Hired status in their sheet — everyone else shows
          blank here, which is expected: <span className="text-ink">{companiesWithRoundData.join(", ")}</span>.
        </div>
      )}

      <div className="text-sm text-ink-secondary">
        Showing {visibleCount} of {total} shared candidates
      </div>

      <Table>
        <thead>
          <tr>
            <Th>Candidate</Th>
            <Th>Company</Th>
            {ROUND_FIELDS.map(({ key, label }) => (
              <Th key={key}>{label}</Th>
            ))}
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <LoadingRow colSpan={2 + ROUND_FIELDS.length} />
          ) : visible.length === 0 ? (
            <EmptyRow colSpan={2 + ROUND_FIELDS.length} />
          ) : (
            visible.map((r) => {
              const record = r as unknown as Record<string, string | null>;
              return (
                <Tr key={r.id}>
                  <Td className="font-medium">{dashIfEmpty(r.name)}</Td>
                  <Td>{r.companies?.name ?? "-"}</Td>
                  {ROUND_FIELDS.map(({ key }) => (
                    <Td key={key} className={statusToneClass(record[key])}>
                      {dashIfEmpty(record[key])}
                    </Td>
                  ))}
                </Tr>
              );
            })
          )}
        </tbody>
      </Table>

      <ShowMoreButton visibleCount={visibleCount} total={total} onClick={showMore} />
    </div>
  );
}
