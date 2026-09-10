/**
 * Known aliases for the same person, found across different company sheets'
 * inconsistent spelling (confirmed with the user 2026-08-13, extended
 * 2026-09-10 to match regardless of spacing/capitalization — "Haripriya" and
 * "Hari Priya" are the same recruiter). Matching is by a normalized key
 * (lowercased, all whitespace removed), so any casing or spacing variant of a
 * name listed below is folded into its canonical form automatically —
 * deliberately not full fuzzy matching, so a genuinely different person with
 * a similar-but-different name is never silently merged into someone else's
 * record. Anything not listed here passes through unchanged (trimmed only).
 */
const NAME_ALIASES: Record<string, string> = {
  chaitanya: "Chaitanya",
  Gopi: "Gopichand",
  Gopichand: "Gopichand",
  "Gopi Chand": "Gopichand",
  gopichand: "Gopichand",
  "Sai ram": "Sairam",
  "Sai Ram": "Sairam",
  sairam: "Sairam",
  lakshmi: "Lakshmi",
  Laksmi: "Lakshmi",
  "Hari priya": "Hari Priya",
  Haripriya: "Hari Priya",
  hemanth: "Hemanth",
  Bharadwaj: "Bhardwaj",
  pritham: "Preetam",
};

function normalizeKey(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, "");
}

// Built once from NAME_ALIASES: every known alias (and its canonical form)
// indexed by its normalized key, so "HARIPRIYA", "hari Priya", "Haripriya "
// etc. all resolve the same way without needing an explicit entry each.
const NORMALIZED_ALIASES: Record<string, string> = {};
for (const [alias, canonical] of Object.entries(NAME_ALIASES)) {
  NORMALIZED_ALIASES[normalizeKey(alias)] = canonical;
  NORMALIZED_ALIASES[normalizeKey(canonical)] = canonical;
}

export function canonicalizeName(raw: string | null | undefined): string | null {
  const trimmed = (raw ?? "").trim();
  if (!trimmed) return null;
  return NORMALIZED_ALIASES[normalizeKey(trimmed)] ?? trimmed;
}
