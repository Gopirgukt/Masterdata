import { getSheetsClient, extractSpreadsheetId, fetchSheetRows } from "@/lib/sync/googleSheetsClient";
import { createAdminClient } from "@/lib/supabase/admin";

// The "Tech interactions" tab of the master tracking sheet logs every
// scheduled interview across every company, with a per-row "Sheet link" back
// to that company's own internal tracking sheet — confirmed 2026-09-07 as a
// live, ready-made source of "which companies exist and where's their sheet"
// that's more current than the older Main-tab onboarding flow, since it's
// literally what recruiters are updating every time a new interview is
// scheduled. Hardcoded because this is a fixed org-wide reference sheet, not
// something that gets recreated.
const MASTER_SHEET_ID = "19A6FoeqZcm4LofWPh1Wmvm5zGXLpSkSmCDvHlV3CmQs";
const MASTER_TAB = "Tech interactions";
// Capped at 1, not a few — a single new spreadsheet's tab-probing can still
// land a Google API quota-retry pause (20s) on top of however many tabs it
// has, and even one bad case ate most of the 313.8s measured across 4
// companies. One per run keeps worst case comfortably under this endpoint's
// own 60s ceiling; a backlog just trickles in one company per run instead.
const MAX_NEW_COMPANIES_PER_RUN = 1;

const NAME_HINTS = ["name"];
const PHONE_HINTS = ["mobile number", "phone number", "mobile", "phone"];
const STATUS_HINTS = ["screening status", "internal screening status", "tech team screening status"];

function headerMatches(headers: string[], hints: string[]): boolean {
  const normalized = headers.map((h) => (h ?? "").trim().toLowerCase());
  return hints.some((hint) => normalized.some((h) => h === hint || h.includes(hint)));
}

/** Same tab-detection heuristic as scripts/onboard-from-main-sheet.ts: a real
 * candidate-tracking tab has a name field, a phone field, and a
 * screening-status field in its header row. */
async function detectCandidateTabs(spreadsheetId: string): Promise<string[]> {
  const sheets = getSheetsClient();
  const meta = await sheets.spreadsheets.get({ spreadsheetId });
  const detected: string[] = [];

  for (const s of meta.data.sheets ?? []) {
    const title = s.properties?.title;
    if (!title || title.trim().toLowerCase().startsWith("copy of")) continue;
    try {
      const { headers } = await fetchSheetRows(spreadsheetId, title);
      if (headerMatches(headers, NAME_HINTS) && headerMatches(headers, PHONE_HINTS) && headerMatches(headers, STATUS_HINTS)) {
        detected.push(title);
      }
    } catch {
      // Unreadable tab — skip it, don't fail the whole company.
    }
  }
  return detected;
}

export type DiscoveryResult = { registered: string[]; failed: { name: string; error: string }[] };

/** Scans the master "Tech interactions" log for companies not yet in our
 * `companies` table and registers them automatically — the fix for the
 * recurring "why isn't <company> syncing" gap, where a company shows up in
 * the day's interview log before anyone remembers to onboard it by hand.
 * Runs before the main sync loop so a newly-discovered company gets synced
 * in the same pass it's found in. */
export async function discoverNewCompanies(): Promise<DiscoveryResult> {
  const result: DiscoveryResult = { registered: [], failed: [] };
  const supabase = createAdminClient();

  let headers: string[];
  let rows: string[][];
  try {
    ({ headers, rows } = await fetchSheetRows(MASTER_SHEET_ID, MASTER_TAB));
  } catch {
    return result; // Master sheet unreachable this run — don't fail the whole sync over it.
  }

  const companyCol = headers.findIndex((h) => h.trim().toLowerCase() === "company");
  const sheetLinkCol = headers.findIndex((h) => h.trim().toLowerCase() === "sheet link");
  if (companyCol === -1 || sheetLinkCol === -1) return result;

  const seenInLog = new Map<string, string>();
  for (const row of rows) {
    const name = (row[companyCol] ?? "").trim();
    const link = (row[sheetLinkCol] ?? "").trim();
    if (name && link && !seenInLog.has(name)) seenInLog.set(name, link);
  }

  const { data: existing } = await supabase.from("companies").select("name");
  const existingNames = new Set((existing ?? []).map((c) => c.name.trim().toLowerCase()));

  let processed = 0;
  for (const [name, link] of seenInLog) {
    if (existingNames.has(name.toLowerCase())) continue;
    // Probing every tab of a newly-discovered spreadsheet is expensive
    // (confirmed 2026-09-07: 4 new companies took over 5 minutes total,
    // some spreadsheets running a dozen+ tabs) — capped so one run can never
    // blow this endpoint's own time budget regardless of backlog size.
    // Whatever doesn't fit gets picked up on the next run instead.
    if (processed >= MAX_NEW_COMPANIES_PER_RUN) break;
    processed++;

    const spreadsheetId = extractSpreadsheetId(link);
    try {
      const tabs = await detectCandidateTabs(spreadsheetId);
      if (tabs.length === 0) continue; // No recognizable tracking tab yet — try again next run.

      const { error } = await supabase.from("companies").insert({
        name,
        sheet_id: spreadsheetId,
        sheet_url: link,
        sheet_tab: tabs.join(","),
        sync_status: "ok",
        sync_error: null,
      });
      if (error) {
        // Usually the same sheet already registered under a different
        // company-name spelling — not a real failure, just skip it.
        continue;
      }
      result.registered.push(name);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const isPermission = message.toLowerCase().includes("permission");
      await supabase.from("companies").insert({
        name,
        sheet_id: spreadsheetId,
        sheet_url: link,
        sync_status: "error",
        sync_error: isPermission ? "Access denied — sheet not shared with the sync service account." : message,
      });
      result.failed.push({ name, error: message });
    }
  }

  return result;
}
