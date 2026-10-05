/**
 * Turns the Main tab's free-text "Years of Expereince" / "CTC" cells into a
 * single number for plotting. Recruiters type these however they like
 * ("5 -8 years", "Max 25LPA; can stretch it to 30LPA", "4+ Years"), so this
 * is deliberately strict: only the first clause is read (everything after a
 * newline, ";", ",", "(", "/" or "but/can/and ready" is a caveat, not the
 * figure), and that clause must hold either one number or one "A - B" /
 * "A to B" range. A range becomes its midpoint; "4+", "Max 25", "Upto 18"
 * become the stated number. Anything else (tiered by experience, a % hike,
 * "3 times current CTC") returns null so it's left off the chart rather than
 * guessed at — the table still shows the original text.
 */

const CLAUSE_BREAK = /\n|;|,|\(|\[|\/|\bbut\b|\bcan\b|\band ready\b/i;
const NUMBER = /\d+(?:\.\d+)?/g;
const RANGE_JOINER = /^\s*(?:-|–|—|to)\s*$/i;

function firstClause(raw: string): string {
  return raw.split(CLAUSE_BREAK)[0] ?? "";
}

function singleOrMidpoint(clause: string): number | null {
  const matches = [...clause.matchAll(NUMBER)];
  if (matches.length === 1) return Number(matches[0][0]);
  if (matches.length === 2) {
    const [a, b] = matches;
    const between = clause.slice(a.index! + a[0].length, b.index!).replace(/lpa|lakhs?|years?|yrs?/gi, "");
    if (!RANGE_JOINER.test(between)) return null;
    return (Number(a[0]) + Number(b[0])) / 2;
  }
  return null;
}

export function parseExperienceYears(raw: string | null): number | null {
  if (!raw) return null;
  const clause = firstClause(raw.trim());
  if (/lpa|lakh/i.test(clause)) return null; // A CTC typed into the experience column.
  const years = singleOrMidpoint(clause);
  return years !== null && years >= 0 && years <= 40 ? years : null;
}

export function parsePackageLpa(raw: string | null): number | null {
  if (!raw) return null;
  const clause = firstClause(raw.trim());
  // Tiered by experience ("1 to 3 years: 7 LPA…"), relative to current pay
  // ("30% hike", "3 times of current CTC"), or a ratio ("1:4 of experience").
  if (/year|yrs?\b|%|hike|times|:/i.test(clause)) return null;
  const value = singleOrMidpoint(clause);
  if (value === null) return null;
  const lpa = /crore/i.test(clause) ? value * 100 : value;
  return lpa > 0 && lpa <= 200 ? lpa : null;
}
