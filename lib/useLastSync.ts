"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

export type LastSyncInfo = {
  finishedAt: string | null;
  totalErrors: number;
};

export function useLastSync() {
  const [info, setInfo] = useState<LastSyncInfo | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const supabase = createClient();
    supabase
      .from("sync_runs")
      .select("finished_at, total_errors")
      .not("finished_at", "is", null)
      .order("finished_at", { ascending: false })
      .limit(1)
      .then(({ data }) => {
        const row = data?.[0];
        setInfo(row ? { finishedAt: row.finished_at, totalErrors: row.total_errors } : null);
        setLoading(false);
      });
  }, []);

  return { info, loading };
}
