"use client";

import { formatDistanceToNow } from "date-fns";
import { useLastSync } from "@/lib/useLastSync";

export function LastSynced() {
  const { info, loading } = useLastSync();

  if (loading) return null;

  if (!info?.finishedAt) {
    return <span className="text-xs text-ink-muted">Not synced yet</span>;
  }

  const relative = formatDistanceToNow(new Date(info.finishedAt), { addSuffix: true });
  const exact = new Date(info.finishedAt).toLocaleString();

  return (
    <span className="flex items-center gap-1.5 text-xs text-ink-muted" title={exact}>
      <span className={`h-1.5 w-1.5 rounded-full ${info.totalErrors > 0 ? "bg-danger" : "bg-success"}`} />
      Updated {relative}
    </span>
  );
}
