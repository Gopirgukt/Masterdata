"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { categorizeRejectionReason } from "@/lib/format";
import { fetchAllRows } from "@/lib/fetchAllRows";
import { BarChartCard } from "@/components/BarChartCard";
import { LoadingState } from "@/components/Loader";
import type { Candidate } from "@/lib/types";

export default function RejectionAnalysisPage() {
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const supabase = createClient();
    setLoading(true);
    fetchAllRows<Candidate>((start, end) =>
      supabase.from("candidates").select("tech_status, tech_remarks").ilike("tech_status", "%reject%").range(start, end),
    ).then((data) => {
      setCandidates(data);
      setLoading(false);
    });
  }, []);

  const counts = new Map<string, number>();
  for (const c of candidates) {
    const category = categorizeRejectionReason(c.tech_remarks);
    counts.set(category, (counts.get(category) ?? 0) + 1);
  }
  const data = Array.from(counts.entries())
    .map(([label, value]) => ({ label, value }))
    .sort((a, b) => b.value - a.value);

  return (
    <div className="flex flex-col gap-6">
      {loading ? (
        <LoadingState />
      ) : data.length === 0 ? (
        <div className="text-sm text-ink-muted">No rejected candidates found.</div>
      ) : (
        <BarChartCard title="Rejected candidates by reason" data={data} />
      )}
    </div>
  );
}
