import { google } from "googleapis";
import { readFileSync } from "fs";

type ServiceAccountKey = {
  client_email: string;
  private_key: string;
};

function loadServiceAccountKey(): ServiceAccountKey {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
  if (raw) return JSON.parse(raw);

  const path = process.env.GOOGLE_SERVICE_ACCOUNT_KEY_PATH;
  if (path) return JSON.parse(readFileSync(path, "utf8"));

  throw new Error(
    "Set GOOGLE_SERVICE_ACCOUNT_KEY (raw JSON, for Vercel) or GOOGLE_SERVICE_ACCOUNT_KEY_PATH (local file path).",
  );
}

// One JWT client reused for every Sheets/Drive call in the process — it caches
// its own access token internally and only re-authenticates on expiry, so
// creating a fresh one per API call (confirmed 2026-08-24: was costing a
// round-trip to Google's token endpoint on every single company check) was
// most of why a sync of ~135 companies took nearly 2 minutes even with the
// active-only filter in place.
let cachedAuth: InstanceType<typeof google.auth.JWT> | null = null;

function getAuth() {
  if (cachedAuth) return cachedAuth;
  const key = loadServiceAccountKey();
  cachedAuth = new google.auth.JWT({
    email: key.client_email,
    key: key.private_key,
    scopes: [
      "https://www.googleapis.com/auth/spreadsheets.readonly",
      "https://www.googleapis.com/auth/drive.metadata.readonly",
    ],
  });
  return cachedAuth;
}

export function getSheetsClient() {
  return google.sheets({ version: "v4", auth: getAuth() });
}

export function getDriveClient() {
  return google.drive({ version: "v3", auth: getAuth() });
}

export function extractSpreadsheetId(urlOrId: string): string {
  const match = urlOrId.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  return match ? match[1] : urlOrId;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Google's per-minute read quota is easy to trip once dozens of companies with
 * several tabs each are involved (confirmed 2026-08-12 during bulk onboarding) —
 * retry once with a longer pause on a quota error before giving up. */
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

async function fetchSpreadsheetMeta(sheets: ReturnType<typeof getSheetsClient>, spreadsheetId: string) {
  return sheets.spreadsheets.get({ spreadsheetId });
}

// Spreadsheet metadata (the tab list) is the same for every tab of the same
// company within one sync run — cached per spreadsheetId so a company with N
// tabs costs 1 metadata call instead of N.
const metadataCache = new Map<string, Awaited<ReturnType<typeof fetchSpreadsheetMeta>>>();

async function getSpreadsheetMetadata(sheets: ReturnType<typeof getSheetsClient>, spreadsheetId: string) {
  const cached = metadataCache.get(spreadsheetId);
  if (cached) return cached;
  const meta = await withQuotaRetry(() => fetchSpreadsheetMeta(sheets, spreadsheetId));
  metadataCache.set(spreadsheetId, meta);
  return meta;
}

/**
 * Resolves a (possibly whitespace-trimmed) tab name to the sheet's actual title.
 * Real tab titles are often sloppy — "JD2 (Fullstack) " with a trailing space —
 * but the newline-separated tab list in `companies.sheet_tab` gets trimmed for
 * usability, so we match loosely here rather than requiring exact whitespace.
 */
async function resolveActualTabName(
  sheets: ReturnType<typeof getSheetsClient>,
  spreadsheetId: string,
  tabName: string,
): Promise<string> {
  const meta = await getSpreadsheetMetadata(sheets, spreadsheetId);
  const target = tabName.trim().toLowerCase();
  const match = meta.data.sheets?.find((s) => s.properties?.title?.trim().toLowerCase() === target);
  if (!match?.properties?.title) {
    throw new Error(`No tab named "${tabName}" found in this spreadsheet.`);
  }
  return match.properties.title;
}

/**
 * Checks a spreadsheet's Drive-level last-modified time, without reading any
 * cell data — one cheap metadata call instead of a full tab fetch. Most
 * companies' sheets go quiet once a role closes, so the hourly sync uses this
 * to skip untouched sheets entirely (confirmed with the user 2026-08-24: only
 * "active" companies, edited recently, need re-reading every hour).
 * Returns null if the check itself fails (e.g. Drive API not enabled, or the
 * same access issue Sheets would hit) — callers should treat null as "assume
 * active" so a real access problem still surfaces via the normal sync path
 * instead of being silently swallowed here.
 */
export async function getSpreadsheetModifiedTime(spreadsheetId: string): Promise<Date | null> {
  try {
    const drive = getDriveClient();
    const result = await withQuotaRetry(() =>
      drive.files.get({ fileId: spreadsheetId, fields: "modifiedTime" }),
    );
    const modifiedTime = result.data.modifiedTime;
    return modifiedTime ? new Date(modifiedTime) : null;
  } catch {
    return null;
  }
}

export async function fetchSheetRows(
  spreadsheetId: string,
  tabName: string,
): Promise<{ headers: string[]; rows: string[][] }> {
  const sheets = getSheetsClient();
  const actualTabName = await resolveActualTabName(sheets, spreadsheetId, tabName);
  // No column/row bound in the range — some tabs run past column AZ (confirmed:
  // Tofler's "JD _ 1(Fullstack)"), and a hardcoded "!A1:AZ5000" silently drops
  // every column beyond that instead of erroring, which is worse than slow.
  const result = await withQuotaRetry(() =>
    sheets.spreadsheets.values.get({
      spreadsheetId,
      range: actualTabName,
    }),
  );
  await sleep(150);
  const values = result.data.values ?? [];
  const [headers, ...rows] = values;
  return { headers: (headers ?? []).map((h) => (h ?? "").trim()), rows: rows as string[][] };
}

export type TabResult = { headers: string[]; rows: string[][] } | { error: string };

/**
 * Every registered tab of one company in two Sheets requests total — the
 * (cached) tab list plus one values.batchGet — instead of one values.get per
 * tab. Confirmed 2026-10-08: with per-tab reads, a busy run (Applix alone has
 * 7 tabs) blew through Google's ~60 reads/minute quota, failing 14 companies
 * and padding the run to 267s with 20s quota-retry sleeps. Tab names are
 * resolved loosely first (same as fetchSheetRows), so a missing/renamed tab
 * only fails that tab, not the whole batch.
 */
export async function fetchCompanyTabs(spreadsheetId: string, tabNames: string[]): Promise<Map<string, TabResult>> {
  const sheets = getSheetsClient();
  const result = new Map<string, TabResult>();
  const resolved: { tab: string; title: string }[] = [];
  for (const tab of tabNames) {
    try {
      resolved.push({ tab, title: await resolveActualTabName(sheets, spreadsheetId, tab) });
    } catch (err) {
      result.set(tab, { error: err instanceof Error ? err.message : String(err) });
    }
  }
  if (resolved.length === 0) return result;

  try {
    const data = await fetchManyTabsRows(
      spreadsheetId,
      resolved.map((r) => r.title),
    );
    for (const { tab, title } of resolved) result.set(tab, data.get(title) ?? { headers: [], rows: [] });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    for (const { tab } of resolved) result.set(tab, { error: message });
  }
  return result;
}

/**
 * Reads several tabs of the same spreadsheet in one API call instead of one
 * call per tab. Google's read quota is metered per request, not per row, so
 * this matters whenever a caller needs many tabs at once — confirmed
 * 2026-09-10: probing ~150 candidate tabs one at a time (even at modest
 * concurrency) tripped the quota badly enough that retries pushed a single
 * rescan run past ten minutes. Callers must pass exact tab titles (e.g. from
 * spreadsheets.get metadata) — unlike fetchSheetRows, there's no fuzzy
 * resolveActualTabName step here, since batchGet fails the whole call on one
 * bad range name.
 */
export async function fetchManyTabsRows(
  spreadsheetId: string,
  tabNames: string[],
): Promise<Map<string, { headers: string[]; rows: string[][] }>> {
  const result = new Map<string, { headers: string[]; rows: string[][] }>();
  if (tabNames.length === 0) return result;

  const sheets = getSheetsClient();
  const response = await withQuotaRetry(() =>
    sheets.spreadsheets.values.batchGet({
      spreadsheetId,
      ranges: tabNames,
    }),
  );
  await sleep(150);

  const valueRanges = response.data.valueRanges ?? [];
  tabNames.forEach((tabName, i) => {
    const values = valueRanges[i]?.values ?? [];
    const [headers, ...rows] = values;
    result.set(tabName, { headers: (headers ?? []).map((h) => (h ?? "").trim()), rows: rows as string[][] });
  });
  return result;
}
