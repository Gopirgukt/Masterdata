/**
 * Bulk-onboards companies from the "Main" tab of the master tracking sheet.
 *
 * For each unique company (grouped by "Company Name"), takes its "Internal
 * Sheet Link" (NOT "Company Sheet Link" — confirmed 2026-08-12 that's a small
 * client-facing profile summary, not our internal candidate data), then:
 *   - tries to open that spreadsheet (skips + records "access denied" if not
 *     shared with the service account, rather than aborting the whole run)
 *   - auto-detects which tabs are real candidate-data tabs (heuristic: header
 *     row has a name field, a phone field, and a screening-status field —
 *     matches the JD_1/JD_2/.../JD_N pattern seen across every company sheet
 *     so far) and skips obvious duplicates ("Copy of ...")
 *   - upserts the company with its detected tabs
 *
 * Usage:
 *   npx tsx scripts/onboard-from-main-sheet.ts "<main-sheet-url>" "<tab-name>"
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import { getSheetsClient, extractSpreadsheetId } from "@/lib/sync/googleSheetsClient";
import { createAdminClient } from "@/lib/supabase/admin";

const NAME_HINTS = ["name"];
const PHONE_HINTS = ["mobile number", "phone number", "mobile", "phone"];
const STATUS_HINTS = ["screening status", "internal screening status", "tech team screening status"];

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function headerMatches(headers: string[], hints: string[]): boolean {
  const normalized = headers.map((h) => (h ?? "").trim().toLowerCase());
  return hints.some((hint) => normalized.some((h) => h === hint || h.includes(hint)));
}

/** Google's per-minute read quota is easy to trip across 100+ companies x several
 * tabs each — retry once with a longer pause on a quota error before giving up. */
async function withQuotaRetry<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (message.toLowerCase().includes("quota exceeded")) {
      await sleep(20000);
      return await fn();
    }
    throw err;
  }
}

async function detectCandidateTabs(
  sheets: ReturnType<typeof getSheetsClient>,
  spreadsheetId: string,
): Promise<string[]> {
  const meta = await withQuotaRetry(() => sheets.spreadsheets.get({ spreadsheetId }));
  const detected: string[] = [];

  for (const s of meta.data.sheets ?? []) {
    const title = s.properties?.title;
    if (!title) continue;
    if (title.trim().toLowerCase().startsWith("copy of")) continue;

    try {
      const headerRow = await withQuotaRetry(() =>
        sheets.spreadsheets.values.get({ spreadsheetId, range: `${title}!1:1` }),
      );
      const headers = headerRow.data.values?.[0] ?? [];
      if (headerMatches(headers, NAME_HINTS) && headerMatches(headers, PHONE_HINTS) && headerMatches(headers, STATUS_HINTS)) {
        detected.push(title);
      }
    } catch {
      // Unreadable tab (rare) — skip it, don't fail the whole company.
    }
    await sleep(150);
  }

  return detected;
}

async function main() {
  const [mainSheetUrl, tabName] = process.argv.slice(2);
  if (!mainSheetUrl || !tabName) {
    console.error('Usage: npx tsx scripts/onboard-from-main-sheet.ts "<main-sheet-url>" "<tab-name>"');
    process.exit(1);
  }

  const sheets = getSheetsClient();
  const mainSpreadsheetId = extractSpreadsheetId(mainSheetUrl);
  const supabase = createAdminClient();

  const headerRow = await sheets.spreadsheets.values.get({ spreadsheetId: mainSpreadsheetId, range: `${tabName}!1:1` });
  const headers = (headerRow.data.values?.[0] ?? []).map((h) => (h ?? "").trim());
  const companyNameCol = headers.findIndex((h) => h.toLowerCase() === "company name");
  const internalSheetCol = headers.findIndex((h) => h.toLowerCase() === "internal sheet link");

  if (companyNameCol < 0 || internalSheetCol < 0) {
    console.error("Could not find 'Company Name' or 'Internal Sheet Link' columns in the header row.");
    process.exit(1);
  }

  const dataRows = await sheets.spreadsheets.values.get({ spreadsheetId: mainSpreadsheetId, range: `${tabName}!2:100000` });
  const rows = dataRows.data.values ?? [];

  // Group by company name -> first non-empty Internal Sheet Link seen for that company.
  const companies = new Map<string, string>();
  for (const row of rows) {
    const name = (row[companyNameCol] ?? "").trim();
    const link = (row[internalSheetCol] ?? "").trim();
    if (!name || !link) continue;
    if (!companies.has(name)) companies.set(name, link);
  }

  console.log(`Found ${companies.size} unique companies with an Internal Sheet Link.\n`);

  const { data: existingOk } = await supabase.from("companies").select("name").eq("sync_status", "ok");
  const alreadyOk = new Set((existingOk ?? []).map((c) => c.name));

  let succeeded = 0;
  let accessDenied = 0;
  let noTabsDetected = 0;
  let otherErrors = 0;
  let skippedAlreadyOk = 0;

  for (const [name, link] of companies) {
    if (alreadyOk.has(name)) {
      skippedAlreadyOk++;
      continue;
    }

    const spreadsheetId = extractSpreadsheetId(link);
    try {
      const tabs = await detectCandidateTabs(sheets, spreadsheetId);
      if (tabs.length === 0) {
        console.log(`[SKIP] ${name} — no candidate-data tabs detected`);
        noTabsDetected++;
        continue;
      }

      const { error } = await supabase.from("companies").upsert(
        {
          name,
          sheet_id: spreadsheetId,
          sheet_url: link,
          sheet_tab: tabs.join(","),
          sync_status: "ok",
          sync_error: null,
        },
        { onConflict: "name" },
      );
      if (error) {
        // Usually means this sheet is already registered under a different company-name
        // spelling (e.g. "RightData" vs "Right Data") — not a real failure, just a duplicate
        // reference to a sheet we already have. Not treated as an access/error case.
        console.log(`[DUPLICATE SHEET] ${name} — ${error.message}`);
        continue;
      }
      console.log(`[OK] ${name} — tabs: ${tabs.join(", ")}`);
      succeeded++;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const isPermission = message.toLowerCase().includes("permission");
      const friendly = isPermission
        ? "Access denied — sheet not shared with the sync service account."
        : message;

      await supabase.from("companies").upsert(
        {
          name,
          sheet_id: spreadsheetId,
          sheet_url: link,
          sync_status: "error",
          sync_error: friendly,
        },
        { onConflict: "name" },
      );

      if (isPermission) {
        accessDenied++;
        console.log(`[ACCESS DENIED] ${name}`);
      } else {
        otherErrors++;
        console.log(`[ERROR] ${name} — ${message}`);
      }
    }

    await sleep(150);
  }

  console.log(
    `\nDone. ${succeeded} registered, ${accessDenied} access-denied, ${otherErrors} other errors, ${noTabsDetected} skipped (no tabs detected), ${skippedAlreadyOk} already ok (skipped).`,
  );
}

main();
