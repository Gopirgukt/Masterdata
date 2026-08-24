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
 * but a comma-separated tab list in `companies.sheet_tab` gets trimmed for
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
