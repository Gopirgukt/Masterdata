import { NextRequest, NextResponse, after } from "next/server";
import { syncAllCompanies } from "@/lib/sync/runSync";

export const runtime = "nodejs";
export const maxDuration = 60;

// The sync itself (~50s across ~135 companies) reliably outlives short client
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
