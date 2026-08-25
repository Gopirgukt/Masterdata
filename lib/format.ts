export function yesNo(value: boolean | null | undefined): "Yes" | "No" {
  return value ? "Yes" : "No";
}

export function dashIfEmpty(value: string | null | undefined): string {
  return value && value.trim() !== "" ? value : "-";
}

export function recordingHref(link: string | null | undefined): { label: string; href: string | null } {
  if (!link || link.trim() === "" || link.trim().toLowerCase() === "not recorded") {
    return { label: "Not recorded", href: null };
  }
  return { label: "View recording", href: link };
}

/**
 * Parses free-text interview times ("9:30 AM", "2:00 PM") into minutes-since-midnight
 * for chronological sorting — lexicographic sort would put "10:00 AM" before "2:00 PM".
 * Unparseable/missing values (seen in real data, e.g. ":15 PM" with no hour) sort last.
 */
// Matches the first clock time anywhere in the string, tolerating a "." minute
// separator, optional seconds, and trailing text — confirmed 2026-08-25: NMT
// Security records slots as ranges ("10:30 AM to 11:00 AM"), which the old
// exact-match regex didn't match at all, so every one of their interviews
// sorted to the end regardless of actual time. Sorting by the range's START
// time is what "morning to evening" means here.
export function parseTimeToMinutes(raw: string | null | undefined): number {
  const match = (raw ?? "").match(/(\d{1,2})[:.](\d{2})(?::\d{2})?\s*(AM|PM)/i);
  if (!match) return Infinity;

  let hour = parseInt(match[1], 10);
  const minute = parseInt(match[2], 10);
  const meridiem = match[3].toUpperCase();

  if (hour === 12) hour = 0;
  if (meridiem === "PM") hour += 12;

  return hour * 60 + minute;
}

/** Displays just the start time for a range-style slot ("11:00 AM to 11:30 AM"
 * -> "11:00 AM") — confirmed with the user 2026-08-25 that the range's second
 * half is noise for a quick glance at the schedule. Falls back to the raw
 * value when it isn't a range (e.g. WMS's plain "1:00 PM"). */
export function formatStartTime(raw: string | null | undefined): string {
  if (!raw || raw.trim() === "") return "-";
  const match = raw.match(/(\d{1,2}[:.]\d{2}(?::\d{2})?\s*(?:AM|PM))/i);
  return match ? match[1] : raw;
}

/** Text color for a status string (TR status / Tech team status), by keyword —
 * P1/P2 green, Hold blue, Reject red. Same keyword logic already used elsewhere
 * (Interviewer Report counts, Company Analytics selected/rejected) for consistency. */
export function statusToneClass(status: string | null | undefined): string {
  const s = (status ?? "").toLowerCase();
  if (s.includes("reject")) return "text-danger";
  if (s.includes("hold")) return "text-accent";
  if (s.includes("p1") || s.includes("p2")) return "text-success";
  return "";
}

export function splitSkills(raw: string | null | undefined): string[] {
  if (!raw) return [];
  // Real sheet data uses "→" as a delimiter (e.g. "Python → LangChain → RAG")
  // in addition to the comma/semicolon/slash the schema was originally specced with.
  return raw
    .split(/[,;/]|→/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

const REJECTION_CATEGORIES: { label: string; keywords: string[] }[] = [
  { label: "Communication", keywords: ["communication", "english", "fluency"] },
  { label: "Low Coding", keywords: ["coding", "dsa", "logic"] },
  { label: "SQL", keywords: ["sql", "query", "database"] },
  { label: "System Design", keywords: ["system design", "architecture", "scalab"] },
  { label: "Notice Period", keywords: ["notice period"] },
  { label: "Salary", keywords: ["salary", "ctc", "compensation"] },
  { label: "Domain", keywords: ["domain", "industry"] },
  { label: "Fake Experience", keywords: ["fake", "inflated", "mismatch"] },
];

export function categorizeRejectionReason(remarks: string | null | undefined): string {
  const text = (remarks ?? "").toLowerCase();
  for (const category of REJECTION_CATEGORIES) {
    if (category.keywords.some((kw) => text.includes(kw))) {
      return category.label;
    }
  }
  return "Other";
}
