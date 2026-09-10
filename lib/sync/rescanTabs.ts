import { createAdminClient } from "@/lib/supabase/admin";
import { getSheetsClient, fetchManyTabsRows, getSpreadsheetModifiedTime } from "@/lib/sync/googleSheetsClient";
import { headerMatches, NAME_HINTS, PHONE_HINTS, STATUS_HINTS } from "@/lib/sync/discoverCompanies";
import { parseSheetDate } from "@/lib/sync/mapping";
import type { Company } from "@/lib/types";

const ACTIVE_WINDOW_DAYS = 7;
// How far back a tab's own dates must reach to count as "actually in use" —
// wider than the 7-day spreadsheet-level activity window because a tab can be
// edited (activity date bumped) without its interview dates being recent, and
// we specifically want tabs someone is currently scheduling real interviews
// in, not old archived tabs (Billcut's spreadsheet has plenty: "Batch-1",
// "Sheet6", "all batches") that happen to share the same header shape.
const RECENT_ROW_WINDOW_DAYS = 30;
const DATE_HINTS = ["date of sourcing", "call date", "tech screening - scheduled date"];

function hasRecentDate(headers: string[], rows: string[][]): boolean {
  const normalized = headers.map((h) => (h ?? "").trim().toLowerCase());
  const dateCols = normalized
    .map((h, i) => (DATE_HINTS.includes(h) ? i : -1))
    .filter((i) => i !== -1);
  if (dateCols.length === 0) return false;

  const cutoff = Date.now() - RECENT_ROW_WINDOW_DAYS * 24 * 60 * 60 * 1000;
  for (const row of rows) {
    for (const col of dateCols) {
      const parsed = parseSheetDate((row[col] ?? "").trim());
      if (parsed && new Date(parsed).getTime() >= cutoff) return true;
    }
  }
  return false;
}

function parseRegisteredTabs(sheetTab: string | null): Set<string> {
  return new Set(
    (sheetTab ?? "")
      .split(",")
      .map((t) => t.trim().toLowerCase())
      .filter(Boolean),
  );
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

/** Lists the unregistered tab names in one company's spreadsheet, or null if
 * the spreadsheet is inactive/unreachable (checked separately from "found
 * nothing", which is a real, meaningful zero). Cheap — one Drive metadata
 * call plus one Sheets metadata call, no row data — so this phase alone can
 * run at high concurrency across every company. */
async function listUnregisteredTabs(company: Company): Promise<string[] | null> {
  if (!company.sheet_id) return null;

  const modified = await getSpreadsheetModifiedTime(company.sheet_id);
  if (modified && modified.getTime() < Date.now() - ACTIVE_WINDOW_DAYS * 24 * 60 * 60 * 1000) {
    return null; // Spreadsheet itself hasn't been touched recently — nothing new to find.
  }

  const registered = parseRegisteredTabs(company.sheet_tab);
  try {
    const sheets = getSheetsClient();
    const meta = await sheets.spreadsheets.get({ spreadsheetId: company.sheet_id });
    const allTabs = (meta.data.sheets ?? []).map((s) => s.properties?.title ?? "").filter(Boolean);
    return allTabs.filter((t) => !registered.has(t.trim().toLowerCase()));
  } catch {
    return null; // Same access problem the real sync will hit and report separately.
  }
}

function isActiveCandidateTab(headers: string[], rows: string[][]): boolean {
  return (
    headerMatches(headers, NAME_HINTS) &&
    headerMatches(headers, PHONE_HINTS) &&
    headerMatches(headers, STATUS_HINTS) &&
    hasRecentDate(headers, rows)
  );
}

/** Reads every unregistered tab of one company in a single batched API call
 * and returns the subset that look like a real, currently-used
 * candidate-tracking tab (same header heuristic as auto-discovery, plus a
 * recent-date check to skip archived/one-off tabs). One request per company
 * regardless of how many stray tabs it has — confirmed 2026-09-10: checking
 * these one tab at a time (151 tabs across ~114 companies) tripped Google's
 * read quota badly enough that retries pushed a single run past ten minutes;
 * batching cuts the request count to roughly one per flagged company. */
async function findActiveTabsAmong(sheetId: string, tabs: string[]): Promise<string[]> {
  try {
    const results = await fetchManyTabsRows(sheetId, tabs);
    return tabs.filter((tab) => {
      const data = results.get(tab);
      return data ? isActiveCandidateTab(data.headers, data.rows) : false;
    });
  } catch {
    return []; // Batch read failed (e.g. a stale tab name) — try again next run.
  }
}

export type RescanResult = { flagged: string[]; cleared: string[] };

/**
 * Sweeps every registered company for tabs that look like a real, actively-used
 * candidate tab but were never added to sheet_tab — the recurring "new tab on
 * an existing company's sheet" gap (confirmed repeatedly: VConstruct,
 * Freedom with AI, Billcut) that auto-discovery doesn't catch since it only
 * looks for brand-new companies. Writes findings to companies.new_tabs_detected
 * so the dashboard can surface them without anyone needing to manually
 * cross-check a sheet's tabs by hand.
 */
export async function rescanForNewTabs(): Promise<RescanResult> {
  const supabase = createAdminClient();
  const { data: companies } = await supabase.from("companies").select("*");
  const result: RescanResult = { flagged: [], cleared: [] };

  // Phase 1: cheap metadata-only pass (Drive modified-time + Sheets tab list,
  // no row data) across every company — this is what makes most companies
  // drop out (inactive spreadsheet, or no unregistered tabs at all). Same
  // concurrency as the hourly sync's own activity check (lib/sync/runSync.ts)
  // since this makes the same kind of Drive/Sheets metadata calls.
  const candidates = await mapWithConcurrency(companies ?? [], 10, async (company) => ({
    company,
    unregistered: await listUnregisteredTabs(company),
  }));

  // Phase 2: one batched row-fetch per company that has unregistered tabs
  // (see findActiveTabsAmong) — modest concurrency across companies since each
  // one is now a single request regardless of how many stray tabs it has.
  const toCheck = candidates.filter(
    (c): c is { company: Company; unregistered: string[] } =>
      c.unregistered !== null && c.unregistered.length > 0 && !!c.company.sheet_id,
  );
  const foundByCompany = new Map<string, string[]>();
  await mapWithConcurrency(toCheck, 5, async ({ company, unregistered }) => {
    const active = await findActiveTabsAmong(company.sheet_id!, unregistered);
    if (active.length > 0) foundByCompany.set(company.id, active);
  });

  for (const { company, unregistered } of candidates) {
    if (unregistered === null) continue; // Inactive or unreachable — leave whatever was already flagged as-is.
    const tabs = foundByCompany.get(company.id) ?? [];
    const newValue = tabs.length > 0 ? tabs.join(",") : null;
    if (newValue === company.new_tabs_detected) continue;

    await supabase.from("companies").update({ new_tabs_detected: newValue }).eq("id", company.id);
    if (newValue) result.flagged.push(`${company.name}: ${tabs.join(", ")}`);
    else result.cleared.push(company.name);
  }

  return result;
}
