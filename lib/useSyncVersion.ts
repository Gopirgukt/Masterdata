"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

const POLL_INTERVAL_MS = 20_000;

/**
 * Returns the most recent completed sync's finished_at timestamp, polling for
 * changes. Pages depend on this value in their data-fetching effect so a
 * finished sync (hourly cron, cron-job.org, or the "Sync now" button)
 * automatically reloads what's on screen — no manual browser refresh needed.
 * A lightweight single-row query, not the full candidates table, so polling
 * it every 20s is cheap regardless of how many rows exist.
 */
export function useSyncVersion(): string | null {
  const [version, setVersion] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const supabase = createClient();

    async function check() {
      const { data } = await supabase
        .from("sync_runs")
        .select("finished_at")
        .not("finished_at", "is", null)
        .order("finished_at", { ascending: false })
        .limit(1);
      if (!cancelled) {
        setVersion(data?.[0]?.finished_at ?? null);
      }
    }

    check();
    const interval = setInterval(check, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  return version;
}
