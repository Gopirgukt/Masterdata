"use client";

import { useEffect, useState } from "react";
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

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

export type OutcomeRow = {
  label: string;
  P1: number;
  P2: number;
  P3: number;
  Hold: number;
  Reject: number;
};

// Fixed stacking/legend order — never re-derived from the data, so a filter
// that changes which rows are present never reshuffles what each color means.
const SERIES = ["P1", "P2", "P3", "Hold", "Reject"] as const;

// P1/Hold/Reject reuse this app's existing status tokens (--color-success/
// accent/danger) so the chart reads the same as every status-colored table
// cell elsewhere in the dashboard; P2/P3 are new hues chosen to stay
// distinguishable from P1 and each other (validated with the dataviz skill's
// palette checker — light and dark variants both pass CVD/contrast).
const LIGHT_COLORS: Record<(typeof SERIES)[number], string> = {
  P1: "#0ca30c",
  P2: "#0f8a7a",
  P3: "#c99a1f",
  Hold: "#2a78d6",
  Reject: "#d03b3b",
};
const DARK_COLORS: Record<(typeof SERIES)[number], string> = {
  P1: "#0ca30c",
  P2: "#0f8a7a",
  P3: "#a5820f",
  Hold: "#3987e5",
  Reject: "#e66767",
};

/** Horizontal stacked bar — per-row breakdown across a fixed set of outcome
 * categories (P1/P2/P3/Hold/Reject). Segment order is always the same
 * regardless of which rows are present, so color never means something
 * different from one filter state to the next. */
export function StackedOutcomeChart({ title, data }: { title: string; data: OutcomeRow[] }) {
  const isDark = useIsDark();
  const colors = isDark ? DARK_COLORS : LIGHT_COLORS;
  const gridColor = isDark ? "#2c2c2a" : "#e1e0d9";
  const textColor = isDark ? "#c3c2b7" : "#52514e";
  const surfaceColor = isDark ? "#1a1a19" : "#fcfcfb";

  return (
    <div className="rounded-lg border border-line bg-surface p-5">
      <h2 className="text-sm font-medium text-ink mb-4">{title}</h2>
      <ResponsiveContainer width="100%" height={Math.max(280, data.length * 40)}>
        <BarChart data={data} layout="vertical" margin={{ top: 4, right: 16, bottom: 4, left: 4 }}>
          <CartesianGrid strokeDasharray="0" horizontal={false} stroke={gridColor} />
          <XAxis type="number" tick={{ fill: textColor, fontSize: 12 }} allowDecimals={false} axisLine={{ stroke: gridColor }} tickLine={false} />
          <YAxis
            type="category"
            dataKey="label"
            width={140}
            tick={{ fill: textColor, fontSize: 12 }}
            axisLine={{ stroke: gridColor }}
            tickLine={false}
          />
          <Tooltip
            cursor={{ fill: isDark ? "#2c2c2a" : "#e1e0d9" }}
            contentStyle={{
              background: isDark ? "#1a1a19" : "#fcfcfb",
              border: `1px solid ${gridColor}`,
              borderRadius: 8,
              fontSize: 12,
              color: isDark ? "#ffffff" : "#0b0b0b",
            }}
          />
          <Legend
            wrapperStyle={{ fontSize: 12, color: textColor }}
            formatter={(value) => <span style={{ color: textColor }}>{value}</span>}
            itemSorter={null}
          />
          {SERIES.map((key, i) => (
            <Bar
              key={key}
              dataKey={key}
              stackId="outcome"
              fill={colors[key]}
              stroke={surfaceColor}
              strokeWidth={2}
              radius={i === SERIES.length - 1 ? [0, 4, 4, 0] : 0}
              maxBarSize={24}
            />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
