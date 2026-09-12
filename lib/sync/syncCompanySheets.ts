import { createAdminClient } from "@/lib/supabase/admin";
import { getSheetsClient, fetchManyTabsRows, getSpreadsheetModifiedTime } from "@/lib/sync/googleSheetsClient";
import type { Company } from "@/lib/types";

const ACTIVE_WINDOW_DAYS = 7;

type FieldKey = "screening_status" | "tr1_status" | "tr2_status" | "hr_mr_status" | "hired_status";

// Same header text mapping.ts already uses for these fields when they happen
// to live on the internal recruiting sheet — here they're read from the
// separate "Company Sheet" instead (see module doc comment below).
const STATUS_HEADER_MAP: Record<FieldKey, string> = {
  screening_status: "screening status",
  tr1_status: "tr 1 status",
  tr2_status: "tr 2 status",
  hr_mr_status: "hr/mr status",
  hired_status: "hired status",
};

function normalizeName(raw: string): string {
  return raw.trim().toLowerCase().replace(/\s+/g, " ");
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

export type CompanySheetSyncResult = { company: string; matched: number; updated: number; error?: string };

/**
 * Reads one company's "Company Sheet" — a spreadsheet distinct from the
 * internal recruiting sheet (companies.sheet_id), shared with/edited by the
 * hiring company itself, tracked separately as companies.company_sheet_id —
 * and merges its Screening/TR1/TR2/HR-MR/Hired status columns into
 * `candidates` by matching candidate name.
 *
 * Confirmed 2026-09-12 (Honebi): these five funnel-stage columns exist ONLY
 * on the Company Sheet for most companies, not on the internal sheet the
 * regular hourly sync reads — so a company updating Honebi's Screening/TR/
 * HR/Hired status never reached the dashboard at all, on any company, since
 * nothing ever read company_sheet_id. 102 companies have one set. Matches
 * reconcile-shared-status.ts's approach (name-only, case/whitespace-
 * insensitive — Company Sheet tabs don't reliably carry phone numbers) and
 * folds in the same "appears in the Company Sheet at all ⇒ shared_to_company"
 * correction that script made by hand, so this supersedes running it
 * separately.
 */
async function syncOneCompanySheet(company: Company): Promise<CompanySheetSyncResult> {
  if (!company.company_sheet_id) return { company: company.name, matched: 0, updated: 0 };

  const sheets = getSheetsClient();
  let tabTitles: string[];
  try {
    const meta = await sheets.spreadsheets.get({ spreadsheetId: company.company_sheet_id });
    tabTitles = (meta.data.sheets ?? []).map((s) => s.properties?.title ?? "").filter(Boolean);
  } catch (err) {
    return { company: company.name, matched: 0, updated: 0, error: err instanceof Error ? err.message : String(err) };
  }
  if (tabTitles.length === 0) return { company: company.name, matched: 0, updated: 0 };

  let tabData: Map<string, { headers: string[]; rows: string[][] }>;
  try {
    tabData = await fetchManyTabsRows(company.company_sheet_id, tabTitles);
  } catch (err) {
    return { company: company.name, matched: 0, updated: 0, error: err instanceof Error ? err.message : String(err) };
  }

  const byName = new Map<string, Partial<Record<FieldKey, string>>>();
  for (const title of tabTitles) {
    const data = tabData.get(title);
    if (!data) continue;
    const normHeaders = data.headers.map((h) => h.trim().toLowerCase());
    const nameIdx = normHeaders.indexOf("name");
    if (nameIdx < 0) continue;

    const fieldIdx: Partial<Record<FieldKey, number>> = {};
    for (const [field, header] of Object.entries(STATUS_HEADER_MAP) as [FieldKey, string][]) {
      const idx = normHeaders.indexOf(header);
      if (idx >= 0) fieldIdx[field] = idx;
    }
    if (Object.keys(fieldIdx).length === 0) continue; // No funnel-status columns on this tab at all.

    for (const row of data.rows) {
      const name = (row[nameIdx] ?? "").trim();
      if (!name) continue;
      const key = normalizeName(name);
      const entry = byName.get(key) ?? {};
      for (const [field, idx] of Object.entries(fieldIdx) as [FieldKey, number][]) {
        const value = (row[idx] ?? "").trim();
        if (value) entry[field] = value;
      }
      byName.set(key, entry);
    }
  }
  if (byName.size === 0) return { company: company.name, matched: 0, updated: 0 };

  const supabase = createAdminClient();
  const { data: candidates } = await supabase
    .from("candidates")
    .select("id, name, screening_status, tr1_status, tr2_status, hr_mr_status, hired_status, shared_to_company")
    .eq("company_id", company.id);

  let matched = 0;
  let updated = 0;
  for (const candidate of candidates ?? []) {
    if (!candidate.name) continue;
    const info = byName.get(normalizeName(candidate.name));
    if (!info) continue;
    matched++;

    const patch: Record<string, unknown> = {};
    for (const field of Object.keys(STATUS_HEADER_MAP) as FieldKey[]) {
      const value = info[field];
      if (value && value !== candidate[field]) patch[field] = value;
    }
    if (!candidate.shared_to_company) patch.shared_to_company = true;
    if (Object.keys(patch).length === 0) continue;

    const { error } = await supabase.from("candidates").update(patch).eq("id", candidate.id);
    if (!error) updated++;
  }

  return { company: company.name, matched, updated };
}

/**
 * Runs syncOneCompanySheet across every company that has a company_sheet_id.
 * `force` bypasses the "has this sheet been edited in the last 7 days" gate —
 * needed for the initial backfill (nothing has ever read these sheets, so
 * "not recently modified" doesn't mean "already captured" the way it does for
 * the main candidate sync) but skipped by default for the periodic endpoint,
 * where re-reading 100+ untouched sheets every run would be wasted quota.
 */
export async function syncAllCompanySheets(
  opts: { force?: boolean; concurrency?: number; onlyNames?: string[] } = {},
): Promise<CompanySheetSyncResult[]> {
  const supabase = createAdminClient();
  let query = supabase.from("companies").select("*").not("company_sheet_id", "is", null);
  if (opts.onlyNames) query = query.in("name", opts.onlyNames);
  const { data: companies } = await query;

  const toSync = opts.force
    ? (companies ?? [])
    : await (async () => {
        const flags = await mapWithConcurrency(companies ?? [], 15, async (c) => {
          const modified = await getSpreadsheetModifiedTime(c.company_sheet_id!);
          if (!modified) return true;
          return modified.getTime() >= Date.now() - ACTIVE_WINDOW_DAYS * 24 * 60 * 60 * 1000;
        });
        return (companies ?? []).filter((_, i) => flags[i]);
      })();

  return mapWithConcurrency(toSync, opts.concurrency ?? 5, syncOneCompanySheet);
}
