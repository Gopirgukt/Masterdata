import { NextRequest, NextResponse, after } from "next/server";
import { rescanForNewTabs } from "@/lib/sync/rescanTabs";

export const runtime = "nodejs";
export const maxDuration = 60;

// Separate from /api/sync and /api/discover-companies: this only reads tab
// metadata (cheap) plus, for genuinely unregistered tabs, one row fetch each —
// much lighter than a full sync but still per-company, so it gets its own
// cron-job.org schedule (e.g. every few hours) rather than running on the
// hourly sync's time budget.
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  after(() => rescanForNewTabs());

  return NextResponse.json({ status: "accepted", message: "Tab rescan started in the background." }, { status: 202 });
}
