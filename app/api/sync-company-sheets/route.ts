import { NextRequest, NextResponse, after } from "next/server";
import { syncAllCompanySheets } from "@/lib/sync/syncCompanySheets";

export const runtime = "nodejs";
export const maxDuration = 60;

// Separate from /api/sync: this reads each company's Company Sheet (a
// different spreadsheet than the one the main sync reads), gated by its own
// 7-day activity check by default so re-reading 100+ mostly-static sheets
// every hour isn't wasted quota — its own less-frequent cron-job.org schedule
// is enough, since the Company Sheet doesn't change nearly as often as the
// internal recruiting sheet does.
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  after(() => syncAllCompanySheets());

  return NextResponse.json(
    { status: "accepted", message: "Company Sheet sync started in the background." },
    { status: 202 },
  );
}
