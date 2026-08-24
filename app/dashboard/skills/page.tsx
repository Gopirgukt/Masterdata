"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { splitSkills } from "@/lib/format";
import { fetchAllRows } from "@/lib/fetchAllRows";
import { BarChartCard } from "@/components/BarChartCard";
import { LoadingState } from "@/components/Loader";
import type { Candidate } from "@/lib/types";

export default function SkillsAnalyticsPage() {
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const supabase = createClient();
    setLoading(true);
    fetchAllRows<Candidate>((start, end) => supabase.from("candidates").select("skills").range(start, end)).then(
      (data) => {
        setCandidates(data);
        setLoading(false);
      },
    );
  }, []);

  const counts = new Map<string, number>();
  for (const c of candidates) {
    for (const skill of splitSkills(c.skills)) {
      const key = skill.toLowerCase();
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
  }
  const data = Array.from(counts.entries())
    .map(([label, value]) => ({ label, value }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 15);

  return (
    <div className="flex flex-col gap-6">
      {loading ? (
        <LoadingState />
      ) : data.length === 0 ? (
        <div className="text-sm text-ink-muted">No skills data found.</div>
      ) : (
        <BarChartCard title="Top 15 skills across all candidates" data={data} />
      )}
    </div>
  );
}
