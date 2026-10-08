import { createAdminClient } from "@/lib/supabase/admin";
import { fetchCompanyTabs, extractSpreadsheetId, getSpreadsheetModifiedTime } from "@/lib/sync/googleSheetsClient";
import { mapSheetRow, isMarkedDuplicate } from "@/lib/sync/mapping";
import { hashRow } from "@/lib/sync/hash";
import type { Company } from "@/lib/types";

export type CompanySyncResult = {
  company: string;
  inserted: number;
  updated: number;
  unchanged: number;
  skippedNoName: number;
  skippedDuplicate: number;
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
 * each a separate open role). companies.sheet_tab holds a newline-separated list —
 * not comma-separated (confirmed 2026-09-18: Ergobite has a real tab literally
 * named "JD_1 (AI,ML)", which a comma-joined list can't represent since the
 * comma inside the name is indistinguishable from the list's own separator.
 * A tab title can never contain a newline, so that can't happen here. */
function parseSheetTabs(sheetTab: string): string[] {
  return sheetTab
    .split(/\r?\n/)
    .map((t) => t.trim())
    .filter((t) => t.length > 0);
}

/** Funnel-stage statuses that, for most companies, only exist on the separate
 * Company Sheet and are written by syncCompanySheets.ts — not on the internal
 * sheet this sync reads, so mapSheetRow returns null for them. Sending those
 * nulls on every changed-row update wiped whatever the Company Sheet sync had
 * set (confirmed 2026-09-30), and it only re-applies them when the Company
 * Sheet itself was edited in the last 7 days. So a null here means "this
 * sheet doesn't say", not "clear it". */
const COMPANY_SHEET_STATUS_FIELDS = ["screening_status", "tr1_status", "tr2_status", "hr_mr_status", "hired_status"] as const;

function withoutBlankCompanySheetStatuses<T extends Record<string, unknown>>(mapped: T): Partial<T> {
  const patch: Partial<T> = { ...mapped };
  for (const field of COMPANY_SHEET_STATUS_FIELDS) {
    if (patch[field] == null) delete patch[field];
  }
  return patch;
}

export async function syncCompany(company: Company): Promise<CompanySyncResult> {
  const result: CompanySyncResult = {
    company: company.name,
    inserted: 0,
    updated: 0,
    unchanged: 0,
    skippedNoName: 0,
    skippedDuplicate: 0,
  };

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

  // All tabs in one batched read — see fetchCompanyTabs for why.
  const tabData = await fetchCompanyTabs(spreadsheetId, tabs);

  for (const tab of tabs) {
    const data = tabData.get(tab);
    if (!data || "error" in data) {
      tabErrors.push(`[${tab}] Failed to read sheet: ${data && "error" in data ? data.error : "no data returned"}`);
      continue;
    }
    const { headers, rows } = data;

    for (const row of rows) {
      if (isMarkedDuplicate(row, headers)) {
        result.skippedDuplicate++;
        continue;
      }

      const mapped = mapSheetRow(row, headers, company.name, tab);
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
        .update({ ...withoutBlankCompanySheetStatuses(mapped), source_row_hash: rowHash, last_synced_at: new Date().toISOString() })
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

  // The actual per-company syncs used to run one at a time in a plain loop —
  // fine when most were skipped as inactive, but a company can involve
  // hundreds of sequential per-row DB writes, and running them one company
  // after another was pushing total wall-clock time past Vercel's 60s hard
  // cap (confirmed 2026-08-27: a run got killed mid-sync with 0 companies
  // recorded, even with after() keeping it running in the background —
  // after() doesn't grant extra time beyond maxDuration, it just lets the
  // response return early). Concurrency is deliberately modest (not the same
  // 10 used for the lightweight activity check) since each of these makes
  // real Sheets API reads and Supabase writes, not just a metadata call.
  const results: CompanySyncResult[] = new Array(companyList.length);
  const toSync: { company: Company; index: number }[] = [];
  for (let i = 0; i < companyList.length; i++) {
    const company = companyList[i];
    if (company.sheet_id && !activeFlags[i]) {
      results[i] = {
        company: company.name,
        inserted: 0,
        updated: 0,
        unchanged: 0,
        skippedNoName: 0,
        skippedDuplicate: 0,
        skippedInactive: true,
      };
    } else {
      toSync.push({ company, index: i });
    }
  }

  const syncedResults = await mapWithConcurrency(toSync, 4, ({ company }) => syncCompany(company));
  toSync.forEach(({ index }, j) => {
    results[index] = syncedResults[j];
  });

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
