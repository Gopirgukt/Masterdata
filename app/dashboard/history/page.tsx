"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { yesNo, dashIfEmpty, statusToneClass } from "@/lib/format";
import { fetchAllRows } from "@/lib/fetchAllRows";
import { useSyncVersion } from "@/lib/useSyncVersion";
import { SearchInput } from "@/components/SearchInput";
import { LoadingState } from "@/components/Loader";
import type { CandidateWithCompany } from "@/lib/types";

type PersonSummary = { name: string; phone: string | null };

function CandidateHistoryInner() {
  const searchParams = useSearchParams();
  const [search, setSearch] = useState(searchParams.get("name") ?? "");
  const [matches, setMatches] = useState<PersonSummary[]>([]);
  const [selected, setSelected] = useState<PersonSummary | null>(null);
  const [timelineRows, setTimelineRows] = useState<CandidateWithCompany[]>([]);
  const [loading, setLoading] = useState(false);
  const syncVersion = useSyncVersion();

  useEffect(() => {
    if (search.trim() === "") {
      setMatches([]);
      return;
    }
    const supabase = createClient();
    const timeout = setTimeout(() => {
      fetchAllRows<PersonSummary>((start, end) =>
        supabase.from("candidates").select("name, phone").ilike("name", `%${search.trim()}%`).range(start, end),
      ).then((rows) => {
        const seen = new Set<string>();
        const unique: PersonSummary[] = [];
        for (const r of rows) {
          const key = `${(r.name ?? "").toLowerCase()}|${r.phone ?? ""}`;
          if (!seen.has(key)) {
            seen.add(key);
            unique.push(r);
          }
        }
        setMatches(unique);
      });
    }, 250);
    return () => clearTimeout(timeout);
  }, [search, syncVersion]);

  useEffect(() => {
    if (!selected) {
      setTimelineRows([]);
      return;
    }
    const supabase = createClient();
    setLoading(true);
    let query = supabase.from("candidates").select("*, companies(name)").eq("name", selected.name);
    query = selected.phone ? query.eq("phone", selected.phone) : query.is("phone", null);
    query.order("call_date", { ascending: true }).then(({ data }) => {
      setTimelineRows((data as unknown as CandidateWithCompany[]) ?? []);
      setLoading(false);
    });
  }, [selected, syncVersion]);

  const trEntry = timelineRows[0];

  return (
    <div className="flex flex-col gap-6">
      <SearchInput
        value={search}
        onChange={(value) => {
          setSearch(value);
          setSelected(null);
        }}
        placeholder="Search by candidate name..."
      />

      {!selected && matches.length > 0 && (
        <ul className="flex flex-col gap-1 max-w-md">
          {matches.map((m, i) => (
            <li key={i}>
              <button
                onClick={() => setSelected(m)}
                className="w-full text-left rounded-md px-3 py-2 text-sm border border-line bg-surface text-ink transition-colors hover:bg-accent-soft hover:border-accent"
              >
                {m.name} {m.phone ? `— ${m.phone}` : ""}
              </button>
            </li>
          ))}
        </ul>
      )}

      {selected && (
        <div className="flex flex-col gap-4 max-w-2xl">
          <h2 className="text-lg font-medium text-ink">
            {selected.name} {selected.phone ? `— ${selected.phone}` : ""}
          </h2>

          {loading ? (
            <LoadingState />
          ) : (
            <ol className="relative flex flex-col gap-6 border-l border-line pl-6">
              {trEntry && (
                <li className="relative">
                  <span className="absolute -left-[29px] top-1 h-3 w-3 rounded-full bg-accent ring-2 ring-surface" />
                  <div className="text-sm text-ink">
                    TR status — <span className={statusToneClass(trEntry.tr_status)}>{dashIfEmpty(trEntry.tr_status)}</span>{" "}
                    (called by {dashIfEmpty(trEntry.call_done_by)})
                  </div>
                </li>
              )}
              {timelineRows.map((r) => (
                <li key={r.id} className="relative">
                  <span className="absolute -left-[29px] top-1 h-3 w-3 rounded-full bg-series-2 ring-2 ring-surface" />
                  <div className="text-sm text-ink">
                    <span className="font-medium">{r.companies?.name ?? "Unknown company"}</span> — tech team status:{" "}
                    <span className={statusToneClass(r.tech_status)}>{dashIfEmpty(r.tech_status)}</span> (
                    {dashIfEmpty(r.tech_screening_taken_by)}), shared to company: {yesNo(r.shared_to_company)}, company
                    decision: {r.company_decision ?? "Pending"}
                  </div>
                </li>
              ))}
            </ol>
          )}
        </div>
      )}
    </div>
  );
}

export default function CandidateHistoryPage() {
  return (
    <Suspense>
      <CandidateHistoryInner />
    </Suspense>
  );
}
