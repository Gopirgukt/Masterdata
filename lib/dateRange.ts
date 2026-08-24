export type DateRangePreset = "this_week" | "this_month" | "custom";

export type DateRange = {
  preset: DateRangePreset;
  start: string; // yyyy-mm-dd, inclusive
  end: string; // yyyy-mm-dd, inclusive
};

function toIsoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function computeRange(preset: DateRangePreset, customStart?: string, customEnd?: string): DateRange {
  const now = new Date();
  if (preset === "custom") {
    // `??` only catches null/undefined — the inputs start as "" (not undefined),
    // so an unfilled date field was slipping through as an empty string and
    // producing an invalid `call_date=gte.` query param. `||` catches that too.
    return {
      preset,
      start: customStart || toIsoDate(now),
      end: customEnd || toIsoDate(now),
    };
  }
  if (preset === "this_week") {
    const dow = now.getDay(); // 0 = Sunday
    const start = new Date(now);
    start.setDate(now.getDate() - dow);
    return { preset, start: toIsoDate(start), end: toIsoDate(now) };
  }
  // this_month
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  return { preset, start: toIsoDate(start), end: toIsoDate(now) };
}
