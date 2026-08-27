import type { Candidate } from "@/lib/types";
import { canonicalizeName } from "@/lib/sync/nameCanon";

// Header names as they appear in the "JD_1"-style per-company tab
// (confirmed against the real "University Living" sheet on 2026-08-11).
// Header lookup is by name, not column index, so reordering columns in the
// sheet doesn't break the sync.
const HEADER_MAP = {
  name: "Name",
  phone: "Mobile Number",
  sourcedDate: "Date of Sourcing",
  callDoneBy: "Call Done By",
  callDate: "Call Date",
  callStatus: "Call Status",
  areTheyInterested: "Are they Interested",
  jobRole: "Job Role",
  trSkills: "Skills good at (Technical Recruiter)",
  trRatingTech: "Rating on Tech skills (Technical Recruiter)",
  trRatingComm: "Rating on Communication (Technical Recruiter)",
  trStatus: "Internal Screening Status Technical Recruiter",
  techScreeningDate: "Tech Screening - Scheduled Date",
  techScreeningTime: "Tech Screening - Scheduled Time",
  techScreeningTakenBy: "Tech Screening Taken By",
  techSkills: "Skills good at (Tech Team)",
  techRatingTech: "Rating on Tech skills (Tech Team)",
  techRatingComm: "Rating on Communication (Tech Team)",
  techRemarks: "Other Remarks (Tech Team)",
  techStatus: "Tech Team Screening Status",
  sharedToCompany: "Shared with the company",
  recordingLink: "Interview Recording links",
  screeningStatus: "Screening Status",
  tr1Status: "TR 1 Status",
  tr2Status: "TR 2 Status",
  hrMrStatus: "HR/MR Status",
  hiredStatus: "Hired Status",
} as const;

type FieldKey = keyof typeof HEADER_MAP;

function buildHeaderIndex(headers: string[], preferLastFor: ReadonlySet<FieldKey> = new Set()): Partial<Record<FieldKey, number>> {
  const normalized = headers.map((h) => h.trim().toLowerCase());
  const index: Partial<Record<FieldKey, number>> = {};
  for (const key of Object.keys(HEADER_MAP) as FieldKey[]) {
    const target = HEADER_MAP[key].trim().toLowerCase();
    const pos = preferLastFor.has(key)
      ? normalized.lastIndexOf(target)
      : normalized.findIndex((h) => h === target);
    if (pos !== -1) index[key] = pos;
  }
  return index;
}

function cell(row: string[], index: Partial<Record<FieldKey, number>>, key: FieldKey): string {
  const pos = index[key];
  if (pos === undefined) return "";
  return (row[pos] ?? "").trim();
}

// Sheet-specific header quirks — some companies' header row is broken in a way
// no amount of name-matching can recover (confirmed 2026-08-24: Honebi's "JD_1"
// tab has no "Name" header anywhere in row 1 — column A is unused/blank and
// column B holds the candidate's name under a header that literally reads "Call
// Done" instead). Every other column in that sheet lines up with its header
// correctly, so this only overrides the name column lookup, by company name
// (case-insensitive, matches companies.name).
const NAME_COLUMN_OVERRIDE_BY_COMPANY: Record<string, number> = {
  honebi: 1,
};

// NMT Security's "JD_1" tab has the Tech Screening column block (Date/Time/
// Meeting Link/Taken By) appearing TWICE in row 1 (confirmed 2026-08-25) — the
// first occurrence is consistently left blank and the real schedule is
// recorded under the second one. findIndex() always grabs the first (blank)
// occurrence, so these companies' interviews synced with a null date despite
// being genuinely scheduled. Scoped to just the affected fields/companies
// rather than changing the default (first-match) behavior everywhere.
const PREFER_LAST_HEADER_OCCURRENCE_BY_COMPANY: Record<string, FieldKey[]> = {
  "nmt security": ["techScreeningDate", "techScreeningTime", "techScreeningTakenBy"],
};

const MONTH_NAMES: Record<string, string> = {
  january: "01",
  jan: "01",
  february: "02",
  feb: "02",
  march: "03",
  mar: "03",
  april: "04",
  apr: "04",
  may: "05",
  june: "06",
  jun: "06",
  july: "07",
  jul: "07",
  august: "08",
  aug: "08",
  september: "09",
  sep: "09",
  sept: "09",
  october: "10",
  oct: "10",
  november: "11",
  nov: "11",
  december: "12",
  dec: "12",
};

function isPlausibleYear(year: number): boolean {
  return year >= 1900 && year <= 2100;
}

/** Some rows jam the time into the date cell (confirmed in the wild, Tofler's
 * sheet: "16-03-2026, 4:00 PM") — strip a trailing time fragment before parsing.
 * Tolerates a leading comma or dash before the time ("Feb 21 - 3:30 Pm"). */
function stripTrailingTime(s: string): string {
  return s
    .replace(/[,-]?\s*\d{1,2}[.:]\d{2}(:\d{2})?\s*(AM|PM)?\s*$/i, "")
    .replace(/[-,]\s*$/, "")
    .trim();
}

/** "23rd", "Mar 7th", "July13tth" — strips ordinal suffixes so the numeric-day
 * regexes below can match. Safe no-op on inputs that don't have one. */
function stripOrdinalSuffixes(s: string): string {
  return s.replace(/(\d{1,2})\s*(st|nd|rd|th|tth)\b/gi, "$1");
}

/**
 * Parses free-text interview/call dates into "YYYY-MM-DD". Returns null if
 * unparseable. Confirmed formats in the wild (2026-08-21): "August 11, 2026",
 * "Aug 19, 2026" (abbreviated month), "12-May-2026" (day-first with month
 * name, hyphenated), "23rd July 2026" (day-first with month name, spaced,
 * ordinal suffix), "16-03-2026" / "16- 03-2026" (DD-MM-YYYY, stray
 * whitespace), dates with a trailing time ("16-03-2026, 4:00 PM", "Feb 21 -
 * 3:30 Pm"), and plain junk ("dnr"). Deliberately does NOT guess a year for
 * dates missing one ("Feb 27th", "30th June") — better to leave it null than
 * silently assign the wrong year.
 */
export function parseSheetDate(raw: string): string | null {
  const trimmed = stripOrdinalSuffixes(stripTrailingTime(raw.trim()));
  if (!trimmed) return null;

  // "Month D, YYYY" / "Mon D YYYY" / "Month D. YYYY" — month name or
  // abbreviation first; the day may be followed by a comma or a stray period.
  const monthFirst = trimmed.match(/^([A-Za-z]+)\.?\s+(\d{1,2})[.,]?\s+(\d{4})$/);
  if (monthFirst) {
    const month = MONTH_NAMES[monthFirst[1].toLowerCase()];
    if (month) {
      const day = monthFirst[2].padStart(2, "0");
      return `${monthFirst[3]}-${month}-${day}`;
    }
  }

  // "D-Month-YYYY" / "D-Mon-YYYY" — day first, then a month name, hyphenated.
  const dayMonthNameHyphen = trimmed.match(/^(\d{1,2})\s*-\s*([A-Za-z]+)\s*-\s*(\d{4})$/);
  if (dayMonthNameHyphen) {
    const month = MONTH_NAMES[dayMonthNameHyphen[2].toLowerCase()];
    if (month) {
      const day = dayMonthNameHyphen[1].padStart(2, "0");
      return `${dayMonthNameHyphen[3]}-${month}-${day}`;
    }
  }

  // "D Month YYYY" / "D Mon YYYY" — day first, then a month name, space-separated.
  const dayMonthNameSpaced = trimmed.match(/^(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})$/);
  if (dayMonthNameSpaced) {
    const month = MONTH_NAMES[dayMonthNameSpaced[2].toLowerCase()];
    if (month) {
      const day = dayMonthNameSpaced[1].padStart(2, "0");
      return `${dayMonthNameSpaced[3]}-${month}-${day}`;
    }
  }

  // "DD-MM-YYYY" (day-month-year, the convention used throughout this data) —
  // tolerates stray whitespace around the hyphens ("16- 03-2026").
  const dayMonthNumeric = trimmed.match(/^(\d{1,2})\s*-\s*(\d{1,2})\s*-\s*(\d{4})$/);
  if (dayMonthNumeric) {
    const day = parseInt(dayMonthNumeric[1], 10);
    const month = parseInt(dayMonthNumeric[2], 10);
    if (day >= 1 && day <= 31 && month >= 1 && month <= 12) {
      return `${dayMonthNumeric[3]}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    }
  }

  // A string with no 4-digit year at all ("Feb 27th", "30th June") must not
  // reach native parsing below — confirmed in the wild that JS's Date quietly
  // defaults a missing year to 2001 instead of failing, which would silently
  // fabricate a wrong date rather than correctly reporting "can't tell".
  if (!/\d{4}/.test(trimmed)) return null;

  // Fall back to native parsing for other formats (e.g. "2026-08-11", "08/11/2026").
  // JS's Date is lenient about year length — a data-entry typo like "July 25, 20026"
  // (confirmed in the wild, Sketch Brahma Technologies' sheet) parses "successfully"
  // into year 20026, which Postgres then rejects. Reject implausible years ourselves
  // rather than pass a value through that we already know is bad.
  const parsed = new Date(trimmed);
  if (!isNaN(parsed.getTime()) && isPlausibleYear(parsed.getFullYear())) {
    return parsed.toISOString().slice(0, 10);
  }
  return null;
}

function parseInterested(raw: string): boolean {
  const text = raw.toLowerCase();
  return text.includes("interested") && !text.includes("not interested");
}

function parseSharedToCompany(raw: string): boolean {
  return raw.trim().toLowerCase() === "yes";
}

export type MappedCandidateRow = Partial<Candidate> & { name: string };

/**
 * Maps one raw sheet row to a candidates row.
 * Returns null if the row has no name (blank/placeholder row, not a real candidate).
 *
 * Decisions locked in with the user on 2026-08-11:
 * - recording_link: mapped from "Interview Recording links" when the sheet has
 *   that column (confirmed on Tofler's tab); null otherwise. The separate
 *   "Tech Screening - Google Meeting Link" column is a pre-call join link, not
 *   a recording, and is intentionally never used for this field.
 * - skills: Tech Team's field only (not Technical Recruiter's), even though it's
 *   usually blank pre-screening.
 * - company_decision: not tracked in this source; always null.
 * - recruiter: Call Done By (the recruiter who owns the candidate through the funnel).
 * - call_done_by / tech_screening_taken_by / recruiter run through canonicalizeName()
 *   (confirmed with the user 2026-08-13) — the same person shows up as "Gopi",
 *   "Gopichand", "gopichand" etc. across different companies' sheets.
 */
export function mapSheetRow(row: string[], headers: string[], companyName?: string): MappedCandidateRow | null {
  const companyKey = companyName?.trim().toLowerCase();
  const preferLastFor = new Set(companyKey ? (PREFER_LAST_HEADER_OCCURRENCE_BY_COMPANY[companyKey] ?? []) : []);
  const index = buildHeaderIndex(headers, preferLastFor);
  const nameOverride = companyKey ? NAME_COLUMN_OVERRIDE_BY_COMPANY[companyKey] : undefined;
  const name = nameOverride !== undefined ? (row[nameOverride] ?? "").trim() : cell(row, index, "name");
  if (!name) return null;

  const callDate = parseSheetDate(cell(row, index, "callDate"));
  const sourcedDate = parseSheetDate(cell(row, index, "sourcedDate"));
  const techScreeningDate = parseSheetDate(cell(row, index, "techScreeningDate"));
  const techScreeningTime = cell(row, index, "techScreeningTime") || null;
  const callDoneBy = canonicalizeName(cell(row, index, "callDoneBy"));

  return {
    name,
    phone: cell(row, index, "phone") || null,
    job_role: cell(row, index, "jobRole") || null,
    call_done_by: callDoneBy,
    call_status: cell(row, index, "callStatus") || null,
    call_date: callDate,
    sourced_date: sourcedDate,
    tr_status: cell(row, index, "trStatus") || null,
    tr_tech_rating: cell(row, index, "trRatingTech") || null,
    tr_comm_rating: cell(row, index, "trRatingComm") || null,
    tech_screening_taken_by: canonicalizeName(cell(row, index, "techScreeningTakenBy")),
    tech_status: cell(row, index, "techStatus") || null,
    tech_tech_rating: cell(row, index, "techRatingTech") || null,
    tech_comm_rating: cell(row, index, "techRatingComm") || null,
    tech_remarks: cell(row, index, "techRemarks") || null,
    recording_link: cell(row, index, "recordingLink") || null,
    shared_to_company: parseSharedToCompany(cell(row, index, "sharedToCompany")),
    company_decision: null,
    skills: cell(row, index, "techSkills") || null,
    tech_screening_date: techScreeningDate,
    tech_screening_time: techScreeningTime,
    recruiter: callDoneBy,
    interested: parseInterested(cell(row, index, "areTheyInterested")),
    screening_status: cell(row, index, "screeningStatus") || null,
    tr1_status: cell(row, index, "tr1Status") || null,
    tr2_status: cell(row, index, "tr2Status") || null,
    hr_mr_status: cell(row, index, "hrMrStatus") || null,
    hired_status: cell(row, index, "hiredStatus") || null,
  };
}
