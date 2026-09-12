"use client";

import { useEffect, useState } from "react";

function useIsDark() {
  const [isDark, setIsDark] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    setIsDark(mq.matches);
    const listener = (e: MediaQueryListEvent) => setIsDark(e.matches);
    mq.addEventListener("change", listener);
    return () => mq.removeEventListener("change", listener);
  }, []);
  return isDark;
}

// Same 5-color status palette as StackedOutcomeChart (validated for CVD
// separation/contrast in both themes with the dataviz skill's checker) — one
// consistent set of colors for "P1/P2/P3/Hold/Reject" everywhere it appears,
// tile or bar.
const LIGHT_COLORS = { P1: "#0ca30c", P2: "#0f8a7a", P3: "#c99a1f", Hold: "#2a78d6", Reject: "#d03b3b" };
const DARK_COLORS = { P1: "#0ca30c", P2: "#0f8a7a", P3: "#a5820f", Hold: "#3987e5", Reject: "#e66767" };

function CheckIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
      <path d="M4 10.5l4 4 8-9" />
    </svg>
  );
}

function HoldIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
      <circle cx="10" cy="10" r="7" />
      <path d="M10 6.2v4l2.6 1.6" />
    </svg>
  );
}

function RejectIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
      <path d="M5.5 5.5l9 9M14.5 5.5l-9 9" />
    </svg>
  );
}

const CATEGORIES = ["P1", "P2", "P3", "Hold", "Reject"] as const;
const TILE_ICON: Record<(typeof CATEGORIES)[number], () => React.ReactElement> = {
  P1: CheckIcon,
  P2: CheckIcon,
  P3: CheckIcon,
  Hold: HoldIcon,
  Reject: RejectIcon,
};

export type OutcomeTotals = { P1: number; P2: number; P3: number; Hold: number; Reject: number };

/** A row of 5 icon + big-number tiles for the P1/P2/P3/Hold/Reject outcome
 * categories — an at-a-glance summary to sit above the detailed per-company/
 * per-person breakdown table on the same page, not a replacement for it. */
export function OutcomeStatTiles({ totals }: { totals: OutcomeTotals }) {
  const isDark = useIsDark();
  const colors = isDark ? DARK_COLORS : LIGHT_COLORS;

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
      {CATEGORIES.map((key) => {
        const Icon = TILE_ICON[key];
        const color = colors[key];
        return (
          <div key={key} className="flex items-center gap-3 rounded-lg border border-line bg-surface px-4 py-3">
            <span
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full"
              style={{ color, backgroundColor: `${color}29` }}
            >
              <Icon />
            </span>
            <div>
              <div className="text-2xl font-semibold text-ink leading-none">{totals[key]}</div>
              <div className="text-xs text-ink-secondary mt-1">{key}</div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
