export type DateRangePreset = "this_week" | "this_month" | "custom";

export type DateRange = {
  preset: DateRangePreset;
  start: string; // yyyy-mm-dd, inclusive
  end: string; // yyyy-mm-dd, inclusive
};

// IST calendar date, not `toISOString()` — that's UTC, so local midnight on
// the 1st came out as the previous month's last day and "This month" started
// a day early (confirmed 2026-10-07: Oct showed "Sep 30 – Oct 7").
import { toIsoDate } from "@/lib/format";

export function computeRange(preset: DateRangePreset, customStart?: string, customEnd?: string): DateRange {
  const today = toIsoDate(new Date());
  if (preset === "custom") {
    // `??` only catches null/undefined — the inputs start as "" (not undefined),
    // so an unfilled date field was slipping through as an empty string and
    // producing an invalid `call_date=gte.` query param. `||` catches that too.
    return {
      preset,
      start: customStart || today,
      end: customEnd || today,
    };
  }
  if (preset === "this_week") {
    // Pure calendar arithmetic on the IST date (via UTC so no local timezone
    // can shift it): back up to Sunday, matching the previous behaviour.
    const [y, m, d] = today.split("-").map(Number);
    const date = new Date(Date.UTC(y, m - 1, d));
    date.setUTCDate(date.getUTCDate() - date.getUTCDay());
    return { preset, start: date.toISOString().slice(0, 10), end: today };
  }
  // this_month
  return { preset, start: `${today.slice(0, 8)}01`, end: today };
}
