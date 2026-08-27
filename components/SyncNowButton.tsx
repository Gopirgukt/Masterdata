"use client";

import { useEffect, useRef, useState } from "react";
import type { LastSyncInfo } from "@/lib/useLastSync";

type Status = "idle" | "syncing" | "done" | "error";

// A full sync now takes ~20s (confirmed 2026-08-27) — poll a bit past that
// before giving up and quietly reverting to idle, since the sync may still
// be genuinely running even if this particular check gives up on it.
const POLL_INTERVAL_MS = 3000;
const POLL_TIMEOUT_MS = 45_000;

export function SyncNowButton({
  lastFinishedAt,
  refetch,
}: {
  lastFinishedAt: string | null;
  refetch: () => Promise<LastSyncInfo | null>;
}) {
  const [status, setStatus] = useState<Status>("idle");
  const [message, setMessage] = useState<string | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);

  async function handleClick() {
    if (status === "syncing") return;
    setStatus("syncing");
    setMessage(null);

    let res: Response;
    try {
      res = await fetch("/api/sync", { method: "POST" });
    } catch {
      setStatus("error");
      setMessage("Couldn't reach the sync endpoint.");
      return;
    }

    if (res.status === 409) {
      setStatus("error");
      setMessage("A sync is already running — try again shortly.");
      return;
    }
    if (!res.ok) {
      setStatus("error");
      setMessage("Sync failed to start.");
      return;
    }

    const baseline = lastFinishedAt;
    const startedPolling = Date.now();

    const poll = async () => {
      const next = await refetch();
      if (next?.finishedAt && next.finishedAt !== baseline) {
        setStatus("done");
        setMessage(null);
        timeoutRef.current = setTimeout(() => setStatus("idle"), 3000);
        return;
      }
      if (Date.now() - startedPolling >= POLL_TIMEOUT_MS) {
        setStatus("idle");
        return;
      }
      timeoutRef.current = setTimeout(poll, POLL_INTERVAL_MS);
    };

    timeoutRef.current = setTimeout(poll, POLL_INTERVAL_MS);
  }

  const label = { idle: "Sync now", syncing: "Syncing…", done: "Synced", error: "Retry sync" }[status];

  return (
    <div className="flex items-center gap-2">
      {message && <span className="text-xs text-danger">{message}</span>}
      <button
        onClick={handleClick}
        disabled={status === "syncing"}
        className={`rounded-md border px-3 py-1.5 text-xs font-medium transition-colors ${
          status === "done"
            ? "border-success bg-surface text-success"
            : "border-line-strong bg-surface text-ink-secondary hover:border-ink-muted hover:text-ink disabled:cursor-not-allowed disabled:opacity-60"
        }`}
      >
        {label}
      </button>
    </div>
  );
}
