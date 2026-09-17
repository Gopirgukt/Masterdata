import { createAdminClient } from "@/lib/supabase/admin";
import { fetchSheetRows } from "@/lib/sync/googleSheetsClient";

// Same org-wide master spreadsheet discoverCompanies.ts reads "Tech
// interactions" from — the "Main" tab is its one-row-per-JD requirement log,
// filled in for every company ever pitched, not just the ones that became a
// registered `companies` row with its own recruiting sheet.
const MASTER_SHEET_ID = "19A6FoeqZcm4LofWPh1Wmvm5zGXLpSkSmCDvHlV3CmQs";
const MAIN_TAB = "Main";

const MONTHS: Record<string, number> = {
  jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
  jul: 6, aug: 7, sep: 8, sept: 8, oct: 9, nov: 10, dec: 11,
};

/** The sheet's date column mixes "Jan 6, 2026" and "Sept 12, 2026" — the
 * latter isn't reliably parsed by `Date.parse` across engines, so pull the
 * month/day/year out by hand instead of trusting the built-in parser. */
function parseSheetDate(raw: string): string | null {
  const match = raw.trim().match(/^([A-Za-z]+)\.?\s+(\d{1,2}),?\s+(\d{4})$/);
  if (!match) return null;
  const month = MONTHS[match[1].toLowerCase()];
  if (month === undefined) return null;
  const day = Number(match[2]);
  const year = Number(match[3]);
  const date = new Date(Date.UTC(year, month, day));
  return date.toISOString().slice(0, 10);
}

function parseOpenings(raw: string): number | null {
  const match = raw.trim().match(/\d+/);
  return match ? Number(match[0]) : null;
}

function col(headers: string[], name: string): number {
  return headers.findIndex((h) => h.trim().toLowerCase() === name.toLowerCase());
}

export type JobOpeningsSyncResult = { total: number; error?: string };

/**
 * Full-replace sync: this table is a read-only mirror of one sheet tab with
 * no per-row identity we can trust across edits (rows get inserted, deleted,
 * and reordered in the sheet directly by recruiters) — so instead of trying
 * to diff/upsert by a natural key, every run inserts a fresh batch tagged
 * with this run's timestamp, then deletes anything older. That ordering
 * (insert-then-delete-old, never delete-then-insert) means a failed insert
 * just leaves the previous run's data in place instead of leaving the table
 * briefly empty.
 */
export async function syncJobOpenings(): Promise<JobOpeningsSyncResult> {
  let headers: string[];
  let rows: string[][];
  try {
    ({ headers, rows } = await fetchSheetRows(MASTER_SHEET_ID, MAIN_TAB));
  } catch (err) {
    return { total: 0, error: err instanceof Error ? err.message : String(err) };
  }

  const idx = {
    crm: col(headers, "CRM"),
    jdNo: col(headers, "JD No"),
    date: col(headers, "Profiles Requested Date"),
    company: col(headers, "Company Name"),
    website: col(headers, "Website Link"),
    role: col(headers, "Role"),
    experience: col(headers, "Years of Expereince"),
    ctc: col(headers, "CTC"),
    openings: col(headers, "No.Of Openings"),
    pocName: col(headers, "POC Name"),
    pocMobile: col(headers, "POC Mobile Number"),
    pocEmail: col(headers, "POC Mail ID"),
    recruiter: col(headers, "Technical Recruiter"),
    status: col(headers, "Current Status of the company"),
    isActive: col(headers, "Is this comany Active now?"),
  };

  const cell = (row: string[], i: number) => (i >= 0 ? (row[i] ?? "").trim() : "");

  const mapped = rows
    .map((row) => ({
      crm_owner: cell(row, idx.crm) || null,
      jd_no: cell(row, idx.jdNo) || null,
      requested_date: parseSheetDate(cell(row, idx.date)),
      company_name: cell(row, idx.company),
      website: cell(row, idx.website) || null,
      role: cell(row, idx.role) || null,
      years_of_experience: cell(row, idx.experience) || null,
      ctc: cell(row, idx.ctc) || null,
      openings: parseOpenings(cell(row, idx.openings)),
      poc_name: cell(row, idx.pocName) || null,
      poc_mobile: cell(row, idx.pocMobile) || null,
      poc_email: cell(row, idx.pocEmail) || null,
      technical_recruiter: cell(row, idx.recruiter) || null,
      status: cell(row, idx.status) || null,
      is_active: cell(row, idx.isActive) || null,
    }))
    .filter((r) => r.company_name.length > 0);

  const supabase = createAdminClient();
  const syncedAt = new Date().toISOString();

  const { error: insertError } = await supabase
    .from("job_openings")
    .insert(mapped.map((r) => ({ ...r, synced_at: syncedAt })));
  if (insertError) {
    return { total: 0, error: insertError.message };
  }

  const { error: deleteError } = await supabase.from("job_openings").delete().lt("synced_at", syncedAt);
  if (deleteError) {
    return { total: mapped.length, error: `Inserted fine but failed to clear stale rows: ${deleteError.message}` };
  }

  return { total: mapped.length };
}
