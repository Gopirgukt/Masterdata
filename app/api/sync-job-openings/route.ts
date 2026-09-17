import { NextRequest, NextResponse, after } from "next/server";
import { syncJobOpenings } from "@/lib/sync/syncJobOpenings";

export const runtime = "nodejs";
export const maxDuration = 60;

// Separate from /api/sync: this reads the "Main" tab of the org-wide master
// sheet (one row per job opening ever requested, across every company) into
// its own `job_openings` table, powering the Job Openings dashboard page.
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  after(() => syncJobOpenings());

  return NextResponse.json(
    { status: "accepted", message: "Job openings sync started in the background." },
    { status: 202 },
  );
}
