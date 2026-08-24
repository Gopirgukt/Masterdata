/**
 * Known aliases for the same person, found across different company sheets'
 * inconsistent spelling/capitalization (confirmed with the user 2026-08-13).
 * Exact match only — deliberately not fuzzy, so a genuinely different person
 * with a similar name is never silently merged into someone else's record.
 *
 * Keys are case-sensitive as seen in the source data; lookup below also tries
 * a trimmed exact match. Anything not listed here passes through unchanged.
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
  hemanth: "Hemanth",
  Bharadwaj: "Bhardwaj",
  pritham: "Preetam",
};

export function canonicalizeName(raw: string | null | undefined): string | null {
  const trimmed = (raw ?? "").trim();
  if (!trimmed) return null;
  return NAME_ALIASES[trimmed] ?? trimmed;
}
