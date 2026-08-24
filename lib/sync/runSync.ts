import { createAdminClient } from "@/lib/supabase/admin";
import { fetchSheetRows, extractSpreadsheetId, getSpreadsheetModifiedTime } from "@/lib/sync/googleSheetsClient";
import { mapSheetRow } from "@/lib/sync/mapping";
import { hashRow } from "@/lib/sync/hash";
import type { Company } from "@/lib/types";

export type CompanySyncResult = {
  company: string;
  inserted: number;
  updated: number;
  unchanged: number;
  skippedNoName: number;
  skippedInactive?: boolean;
  error?: string;
};

const ACTIVE_WINDOW_DAYS = 7;

/** Most companies' sheets go quiet once a role closes — re-reading every tab
 * of every company every hour is wasted work (and, on Vercel, wasted function
 * time). A sheet untouched for a week is treated as inactive and skipped;
 * editing it again immediately makes it "active" on the next hourly run. */
async function isRecentlyActive(sheetId: string): Promise<boolean> {
  const modified = await getSpreadsheetModifiedTime(sheetId);
  if (!modified) return true; // couldn't check — err toward syncing so real access errors still surface normally.
  const cutoffMs = Date.now() - ACTIVE_WINDOW_DAYS * 24 * 60 * 60 * 1000;
  return modified.getTime() >= cutoffMs;
}

/** Runs `fn` over `items` with at most `limit` in flight at once. The
 * modified-time check is a single lightweight Drive metadata call per
 * company with no shared state between companies, so — unlike the full
 * per-tab sheet sync — it's safe to fire off a batch at a time instead of
 * one-by-one (confirmed 2026-08-24: this was most of the remaining time cost
 * once auth-client caching removed the redundant token round-trips). */
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

/** Matches an incoming sheet row to an existing candidate row: by phone if present, else by name. */
function findExisting(
  existing: { id: string; name: string | null; phone: string | null; source_row_hash: string | null }[],
  name: string,
  phone: string | null,
) {
  if (phone) {
    return existing.find((e) => e.phone === phone);
  }
  return existing.find((e) => e.name === name && !e.phone);
}

/** A company's candidate data can be spread across several tabs in its spreadsheet
 * (confirmed 2026-08-12 — Kanerika has JD_1/JD2/JD3, Tofler has JD_1/JD2/JD "1(Fullstack)",
 * each a separate open role). companies.sheet_tab holds a comma-separated list. */
function parseSheetTabs(sheetTab: string): string[] {
  return sheetTab
    .split(",")
    .map((t) => t.trim())
    .filter((t) => t.length > 0);
}

export async function syncCompany(company: Company): Promise<CompanySyncResult> {
  const result: CompanySyncResult = { company: company.name, inserted: 0, updated: 0, unchanged: 0, skippedNoName: 0 };

  if (!company.sheet_id || !company.sheet_tab) {
    result.error = "Missing sheet_id or sheet_tab — register the company with its sheet URL and tab name first.";
    return result;
  }

  const supabase = createAdminClient();
  const spreadsheetId = extractSpreadsheetId(company.sheet_id);
  const tabs = parseSheetTabs(company.sheet_tab);

  const { data: existingCandidates, error: fetchError } = await supabase
    .from("candidates")
    .select("id, name, phone, source_row_hash")
    .eq("company_id", company.id);

  if (fetchError) {
    result.error = `Failed to load existing candidates: ${fetchError.message}`;
    return result;
  }

  // Mutated as we go — a candidate applying to multiple roles (multiple tabs)
  // for the same company must match against rows inserted earlier in this run,
  // not just what existed before the sync started.
  const existing = existingCandidates ?? [];
  const tabErrors: string[] = [];

  for (const tab of tabs) {
    let headers: string[];
    let rows: string[][];
    try {
      ({ headers, rows } = await fetchSheetRows(spreadsheetId, tab));
    } catch (err) {
      tabErrors.push(`[${tab}] Failed to read sheet: ${err instanceof Error ? err.message : String(err)}`);
      continue;
    }

    for (const row of rows) {
      const mapped = mapSheetRow(row, headers, company.name);
      if (!mapped) {
        result.skippedNoName++;
        continue;
      }

      const rowHash = hashRow(row);
      const match = findExisting(existing, mapped.name, mapped.phone ?? null);

      if (!match) {
        const { data: inserted, error } = await supabase
          .from("candidates")
          .insert({
            ...mapped,
            company_id: company.id,
            source_row_hash: rowHash,
            last_synced_at: new Date().toISOString(),
          })
          .select("id")
          .single();
        if (error) {
          tabErrors.push(`[${tab}] Insert failed for "${mapped.name}": ${error.message}`);
          continue;
        }
        result.inserted++;
        if (inserted) {
          existing.push({ id: inserted.id, name: mapped.name, phone: mapped.phone ?? null, source_row_hash: rowHash });
        }
        continue;
      }

      if (match.source_row_hash === rowHash) {
        result.unchanged++;
        continue;
      }

      const { error } = await supabase
        .from("candidates")
        .update({ ...mapped, source_row_hash: rowHash, last_synced_at: new Date().toISOString() })
        .eq("id", match.id);
      if (error) {
        tabErrors.push(`[${tab}] Update failed for "${mapped.name}": ${error.message}`);
        continue;
      }
      match.source_row_hash = rowHash;
      result.updated++;
    }
  }

  if (tabErrors.length > 0) {
    result.error = tabErrors.join("\n");
  }

  await updateCompanySyncStatus(supabase, company.id, result.error ?? null);

  return result;
}

/** Keeps companies.sync_status/sync_error current so access problems (a sheet
 * un-shared after the fact, a renamed tab) surface in the dashboard instead of
 * only in a terminal log — see components/AccessIssuesBanner.tsx. */
async function updateCompanySyncStatus(
  supabase: ReturnType<typeof createAdminClient>,
  companyId: string,
  errorMessage: string | null,
) {
  if (!errorMessage) {
    await supabase.from("companies").update({ sync_status: "ok", sync_error: null }).eq("id", companyId);
    return;
  }

  const friendly = errorMessage.toLowerCase().includes("permission")
    ? "Access denied — sheet not shared with the sync service account."
    : errorMessage;

  await supabase.from("companies").update({ sync_status: "error", sync_error: friendly }).eq("id", companyId);
}

/**
 * Runs every registered company's sync and logs the run to `sync_runs` so the
 * dashboard can show "last updated" (see components/LastSynced.tsx) — the
 * per-candidate last_synced_at doesn't move on unchanged rows, so it can't
 * answer "did the sync job run recently?" on its own.
 */
export async function syncAllCompanies(): Promise<CompanySyncResult[]> {
  const supabase = createAdminClient();
  const startedAt = new Date().toISOString();
  const { data: run } = await supabase
    .from("sync_runs")
    .insert({ started_at: startedAt })
    .select("id")
    .single();

  const { data: companies, error } = await supabase.from("companies").select("*");
  if (error) {
    if (run) {
      await supabase
        .from("sync_runs")
        .update({ finished_at: new Date().toISOString(), total_errors: 1, error_details: error.message })
        .eq("id", run.id);
    }
    throw new Error(`Failed to load companies: ${error.message}`);
  }

  const companyList = companies ?? [];
  const activeFlags = await mapWithConcurrency(companyList, 10, (company) =>
    company.sheet_id ? isRecentlyActive(company.sheet_id) : Promise.resolve(true),
  );

  const results: CompanySyncResult[] = [];
  for (let i = 0; i < companyList.length; i++) {
    const company = companyList[i];
    if (company.sheet_id && !activeFlags[i]) {
      results.push({
        company: company.name,
        inserted: 0,
        updated: 0,
        unchanged: 0,
        skippedNoName: 0,
        skippedInactive: true,
      });
      continue;
    }
    results.push(await syncCompany(company));
  }

  if (run) {
    const errors = results.filter((r) => r.error);
    await supabase
      .from("sync_runs")
      .update({
        finished_at: new Date().toISOString(),
        companies_synced: results.length,
        total_inserted: results.reduce((sum, r) => sum + r.inserted, 0),
        total_updated: results.reduce((sum, r) => sum + r.updated, 0),
        total_errors: errors.length,
        error_details: errors.length > 0 ? errors.map((r) => `${r.company}: ${r.error}`).join("\n") : null,
      })
      .eq("id", run.id);
  }

  return results;
}
