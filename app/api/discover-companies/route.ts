import { NextRequest, NextResponse, after } from "next/server";
import { discoverNewCompanies } from "@/lib/sync/discoverCompanies";

export const runtime = "nodejs";
export const maxDuration = 60;

// Kept separate from /api/sync deliberately — probing a newly-discovered
// spreadsheet's tabs is expensive (confirmed 2026-09-07: 313.8s across 4
// companies in one test run, some spreadsheets running a dozen+ tabs plus
// occasional Google API quota-retry pauses), nowhere near the ~20s the
// regular hourly candidate sync takes. Running it inline there risked
// blowing this project's 60s Vercel ceiling on any run that hit a new
// company. discoverNewCompanies() caps itself to one new company per call
// for the same reason, so this is meant to run on its own, less-frequent
// schedule (e.g. every few hours) rather than every hour like /api/sync.
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  after(() => discoverNewCompanies());

  return NextResponse.json({ status: "accepted", message: "Discovery started in the background." }, { status: 202 });
}
