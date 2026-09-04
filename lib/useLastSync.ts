"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

export type LastSyncInfo = {
  finishedAt: string | null;
  totalErrors: number;
};

// Same cadence as useSyncVersion — keeps the header's "Updated X ago" text
// live on its own (both catching a newly-finished sync and just refreshing
// the relative-time wording as real time passes), instead of only updating
// when the "Sync now" button's own tighter polling loop calls refetch().
const POLL_INTERVAL_MS = 20_000;

export function useLastSync() {
  const [info, setInfo] = useState<LastSyncInfo | null>(null);
  const [loading, setLoading] = useState(true);

  const refetch = useCallback(async () => {
    const supabase = createClient();
    const { data } = await supabase
      .from("sync_runs")
      .select("finished_at, total_errors")
      .not("finished_at", "is", null)
      .order("finished_at", { ascending: false })
      .limit(1);
    const row = data?.[0];
    const next = row ? { finishedAt: row.finished_at, totalErrors: row.total_errors } : null;
    setInfo(next);
    return next;
  }, []);

  useEffect(() => {
    refetch().finally(() => setLoading(false));
    const interval = setInterval(refetch, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [refetch]);

  return { info, loading, refetch };
}
