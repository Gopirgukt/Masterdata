import { NextRequest, NextResponse, after } from "next/server";
import { syncAllCompanies } from "@/lib/sync/runSync";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
// 300s needs Fluid compute ("fluid": true in vercel.json) — without it Vercel
// caps Hobby functions at 60s, and once a full run grew past that (confirmed
// 2026-10-08: "Task timed out after 60 seconds", every run from 08:00 IST
// left unfinished with 0 companies recorded) nothing synced at all.
export const maxDuration = 300;

// A run still inside this window is treated as genuinely in progress, not
// stuck — matches maxDuration, since a run can now legitimately take minutes.
const IN_FLIGHT_WINDOW_MS = 300_000;

async function isSyncInFlight(): Promise<boolean> {
  const supabase = createAdminClient();
  const { data } = await supabase
    .from("sync_runs")
    .select("started_at, finished_at")
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!data || data.finished_at) return false;
  return Date.now() - new Date(data.started_at).getTime() < IN_FLIGHT_WINDOW_MS;
}

// The sync itself (~20s across ~135 companies) reliably outlives short client
// timeouts — confirmed 2026-08-27: cron-job.org's free-tier 30s request
// timeout was disconnecting before the sync finished, and Vercel was killing
// the function along with it (sync_runs rows starting with companies_synced=0
// and never getting a finished_at). `after()` schedules the real work to keep
// running on Vercel after the response is already sent, so the caller's own
// timeout can no longer cut the job short — the response just confirms the
// sync was kicked off, not that it's done.
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  after(() => syncAllCompanies());

  return NextResponse.json({ status: "accepted", message: "Sync started in the background." }, { status: 202 });
}

// Browser-triggered manual sync (the dashboard's "Sync now" button) — no
// secret required, since it's a same-origin call from our own UI and this
// app already has no login/auth layer anywhere (an accepted tradeoff for an
// internal tool, confirmed early on). Guards against double-firing if the
// button gets clicked again while a run from the last ~45s is still going.
export async function POST() {
  if (await isSyncInFlight()) {
    return NextResponse.json(
      { status: "already_running", message: "A sync is already in progress — try again shortly." },
      { status: 409 },
    );
  }

  after(() => syncAllCompanies());

  return NextResponse.json({ status: "accepted", message: "Sync started in the background." }, { status: 202 });
}
