"use client";

import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useIsDark } from "@/components/BarChartCard";

export type ColumnSeries = { key: string; label: string; light: string; dark: string };

/** Vertical columns, one group per row of `data` (keyed by `label`), either
 * stacked (part-to-whole, e.g. P1/P2/P3/Hold/Reject) or side by side
 * (comparable counts, e.g. Assigned/Attempts/Interested). Series order and
 * colors come from `series` and never from the data, so a filter that drops
 * a row never repaints what a color means. */
export function ColumnChartCard({
  title,
  subtitle,
  data,
  series,
  stacked = false,
}: {
  title: string;
  subtitle?: string;
  data: Record<string, string | number>[];
  series: ColumnSeries[];
  stacked?: boolean;
}) {
  const isDark = useIsDark();
  const gridColor = isDark ? "#2c2c2a" : "#e1e0d9";
  const textColor = isDark ? "#c3c2b7" : "#52514e";
  const surfaceColor = isDark ? "#1a1a19" : "#fcfcfb";
  // Long names or many dates don't fit flat under a column — tilt them.
  const tiltLabels = data.length > 6;

  return (
    <div className="rounded-lg border border-line bg-surface p-5">
      <h2 className="text-sm font-medium text-ink">{title}</h2>
      {subtitle && <p className="mt-1 text-xs text-ink-secondary">{subtitle}</p>}
      {data.length === 0 ? (
        <div className="py-12 text-center text-sm text-ink-muted">Nothing to chart for this selection</div>
      ) : (
        <div className="mt-4 overflow-x-auto">
          <div style={{ minWidth: Math.max(320, data.length * (stacked ? 48 : series.length * 22 + 24)) }}>
            <ResponsiveContainer width="100%" height={320}>
              <BarChart data={data} margin={{ top: 8, right: 8, bottom: tiltLabels ? 40 : 4, left: 0 }} barGap={2}>
                <CartesianGrid strokeDasharray="0" vertical={false} stroke={gridColor} />
                <XAxis
                  dataKey="label"
                  interval={0}
                  tick={{ fill: textColor, fontSize: 12 }}
                  angle={tiltLabels ? -35 : 0}
                  textAnchor={tiltLabels ? "end" : "middle"}
                  axisLine={{ stroke: gridColor }}
                  tickLine={false}
                />
                <YAxis allowDecimals={false} width={36} tick={{ fill: textColor, fontSize: 12 }} axisLine={false} tickLine={false} />
                <Tooltip
                  cursor={{ fill: gridColor, fillOpacity: 0.5 }}
                  contentStyle={{
                    background: surfaceColor,
                    border: `1px solid ${gridColor}`,
                    borderRadius: 8,
                    fontSize: 12,
                    color: isDark ? "#ffffff" : "#0b0b0b",
                  }}
                />
                <Legend
                  verticalAlign="top"
                  height={28}
                  wrapperStyle={{ fontSize: 12 }}
                  formatter={(value) => <span style={{ color: textColor }}>{value}</span>}
                  itemSorter={null}
                />
                {series.map((s, i) => (
                  <Bar
                    key={s.key}
                    dataKey={s.key}
                    name={s.label}
                    stackId={stacked ? "stack" : undefined}
                    fill={isDark ? s.dark : s.light}
                    stroke={stacked ? surfaceColor : undefined}
                    strokeWidth={stacked ? 2 : 0}
                    radius={!stacked || i === series.length - 1 ? [4, 4, 0, 0] : 0}
                    maxBarSize={stacked ? 40 : 20}
                    isAnimationActive={false}
                  />
                ))}
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}
    </div>
  );
}
