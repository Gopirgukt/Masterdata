"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { fetchAllRows } from "@/lib/fetchAllRows";
import { useSyncVersion } from "@/lib/useSyncVersion";
import { Table, Th, Td, Tr, EmptyRow, LoadingRow } from "@/components/Table";
import { Badge } from "@/components/Badge";
import type { CandidateWithCompany } from "@/lib/types";

type PendingRow = CandidateWithCompany & { blockedOn: "Not shared to company" | "Company response pending" };

const BLOCKED_ON_TONE = {
  "Not shared to company": "warning",
  "Company response pending": "accent",
} as const;

export default function PendingActionsPage() {
  const [rows, setRows] = useState<PendingRow[]>([]);
  const [loading, setLoading] = useState(true);
  const syncVersion = useSyncVersion();

  useEffect(() => {
    const supabase = createClient();
    setLoading(true);

    fetchAllRows<CandidateWithCompany>((start, end) =>
      supabase.from("candidates").select("*, companies(name)").ilike("tech_status", "%select%").range(start, end),
    ).then((all) => {
      const pending: PendingRow[] = [];
      for (const r of all) {
        if (r.shared_to_company === false) {
          pending.push({ ...r, blockedOn: "Not shared to company" });
        } else if (r.shared_to_company === true && r.company_decision == null) {
          pending.push({ ...r, blockedOn: "Company response pending" });
        }
      }
      setRows(pending);
      setLoading(false);
    });
  }, [syncVersion]);

  return (
    <div className="flex flex-col gap-6">
      <Table>
        <thead>
          <tr>
            <Th>Candidate</Th>
            <Th>Company</Th>
            <Th>Blocked on</Th>
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <LoadingRow colSpan={3} />
          ) : rows.length === 0 ? (
            <EmptyRow colSpan={3} />
          ) : (
            rows.map((r) => (
              <Tr key={r.id}>
                <Td>{r.name ?? "-"}</Td>
                <Td>{r.companies?.name ?? "-"}</Td>
                <Td>
                  <Badge tone={BLOCKED_ON_TONE[r.blockedOn]}>{r.blockedOn}</Badge>
                </Td>
              </Tr>
            ))
          )}
        </tbody>
      </Table>
    </div>
  );
}
