import { getSheetsClient, extractSpreadsheetId, fetchSheetRows, fetchManyTabsRows } from "@/lib/sync/googleSheetsClient";
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
// Each candidate now costs one Sheets metadata call plus one batched
// values.batchGet (see detectCandidateTabs) instead of one read per tab, so a
// handful can run per pass without risking the quota storms a per-tab probe
// used to cause. Still capped, not unbounded — confirmed 2026-09-18: with a
// 24-company backlog sitting behind the old cap of 1/run, a company added to
// the master log could wait most of a week before ever being looked at.
const MAX_NEW_COMPANIES_PER_RUN = 12;
const DISCOVERY_CONCURRENCY = 4;

// Exported for reuse by lib/sync/rescanTabs.ts, which applies the same
// "does this look like a real candidate-tracking tab" heuristic to tabs
// already in existing companies' spreadsheets, not just brand-new ones.
export const NAME_HINTS = ["name"];
export const PHONE_HINTS = ["mobile number", "phone number", "mobile", "phone"];
export const STATUS_HINTS = ["screening status", "internal screening status", "tech team screening status"];

export function headerMatches(headers: string[], hints: string[]): boolean {
  const normalized = headers.map((h) => (h ?? "").trim().toLowerCase());
  return hints.some((hint) => normalized.some((h) => h === hint || h.includes(hint)));
}

async function mapWithConcurrency<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

/** Same heuristic as before (a real candidate-tracking tab has a name field, a
 * phone field, and a screening-status field in its header row), but reads
 * every tab in one batched call instead of one request per tab — confirmed
 * 2026-09-18: probing tab-by-tab made even the old 1-company-per-run cap slow
 * enough to risk the endpoint's own time budget on a spreadsheet with many
 * tabs, which is exactly why the cap was set so low in the first place. */
async function detectCandidateTabs(spreadsheetId: string): Promise<string[]> {
  const sheets = getSheetsClient();
  const meta = await sheets.spreadsheets.get({ spreadsheetId });
  const titles = (meta.data.sheets ?? [])
    .map((s) => s.properties?.title ?? "")
    .filter((t) => t && !t.trim().toLowerCase().startsWith("copy of"));
  if (titles.length === 0) return [];

  const tabData = await fetchManyTabsRows(spreadsheetId, titles);
  return titles.filter((title) => {
    const data = tabData.get(title);
    return !!data && headerMatches(data.headers, NAME_HINTS) && headerMatches(data.headers, PHONE_HINTS) && headerMatches(data.headers, STATUS_HINTS);
  });
}

export type DiscoveryResult = { registered: string[]; failed: { name: string; error: string }[] };

/** Scans the master "Tech interactions" log for companies not yet properly
 * onboarded and registers them automatically — the fix for the recurring
 * "why isn't <company> syncing" gap, where a company shows up in the day's
 * interview log before anyone remembers to onboard it by hand. Runs before
 * the main sync loop so a newly-discovered company gets synced in the same
 * pass it's found in.
 *
 * "Not yet properly onboarded" means no `sheet_tab` yet — not just "no row
 * with this name at all". A company can already have a row (inserted by an
 * earlier run, or an older manual onboarding pass) that never got a working
 * tab, e.g. because the link in the log pointed at a spreadsheet not yet
 * shared with the sync account at the time. Confirmed 2026-09-18: 29
 * companies had sat in exactly that state since 2026-08-13, permanently
 * skipped because the old check only asked "does this name exist yet" —
 * fixing the sheet later (sharing it, adding the missing tab) never got a
 * chance to help, since nothing ever looked at them again. Matching on
 * sheet_tab presence instead means a fixed sheet starts syncing on its own on
 * the next run, no manual re-registration needed.
 */
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

  const { data: existing } = await supabase.from("companies").select("name, sheet_id, sheet_tab");
  const onboardedNames = new Set(
    (existing ?? []).filter((c) => c.sheet_tab).map((c) => c.name.trim().toLowerCase()),
  );
  // Guards against the master log listing the same real spreadsheet twice
  // under two spellings (seen in the wild: "Vyapar app" vs "Vypaar app") —
  // without this, the second spelling would sail past the name check above
  // and register a duplicate company pointed at a sheet that's already synced
  // under its other name.
  const onboardedSheetIds = new Set(
    (existing ?? []).filter((c) => c.sheet_tab && c.sheet_id).map((c) => c.sheet_id!),
  );

  const candidates = Array.from(seenInLog.entries()).filter(([name, link]) => {
    if (onboardedNames.has(name.toLowerCase())) return false;
    if (onboardedSheetIds.has(extractSpreadsheetId(link))) return false;
    return true;
  });
  const toProcess = candidates.slice(0, MAX_NEW_COMPANIES_PER_RUN);

  await mapWithConcurrency(toProcess, DISCOVERY_CONCURRENCY, async ([name, link]) => {
    const spreadsheetId = extractSpreadsheetId(link);
    try {
      const tabs = await detectCandidateTabs(spreadsheetId);
      if (tabs.length === 0) return; // No recognizable tracking tab yet — try again next run.

      // Upsert, not insert: a row may already exist here (broken, from an
      // earlier attempt) — this is the retry path that fixes it in place
      // instead of colliding on the name's unique constraint.
      const { error } = await supabase
        .from("companies")
        .upsert(
          // Newline-joined, not comma-joined — see runSync.ts's parseSheetTabs
          // for why (a tab name can itself contain a comma).
          { name, sheet_id: spreadsheetId, sheet_url: link, sheet_tab: tabs.join("\n"), sync_status: "ok", sync_error: null },
          { onConflict: "name" },
        );
      if (error) return;
      result.registered.push(name);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const isPermission = message.toLowerCase().includes("permission");
      await supabase.from("companies").upsert(
        {
          name,
          sheet_id: spreadsheetId,
          sheet_url: link,
          sync_status: "error",
          sync_error: isPermission ? "Access denied — sheet not shared with the sync service account." : message,
        },
        { onConflict: "name" },
      );
      result.failed.push({ name, error: message });
    }
  });

  return result;
}
