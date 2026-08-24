"use client";

import { useEffect, useState } from "react";
import { Bar, BarChart, CartesianGrid, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

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

export function BarChartCard({
  title,
  data,
}: {
  title: string;
  data: { label: string; value: number }[];
}) {
  const isDark = useIsDark();
  const barColor = isDark ? "#3987e5" : "#2a78d6";
  const gridColor = isDark ? "#2c2c2a" : "#e1e0d9";
  const textColor = isDark ? "#c3c2b7" : "#52514e";

  return (
    <div className="rounded-lg border border-line bg-surface p-5">
      <h2 className="text-sm font-medium text-ink mb-4">{title}</h2>
      <ResponsiveContainer width="100%" height={Math.max(280, data.length * 40)}>
        <BarChart data={data} layout="vertical" margin={{ top: 4, right: 32, bottom: 4, left: 4 }}>
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
          <Bar dataKey="value" fill={barColor} radius={[0, 4, 4, 0]} maxBarSize={24}>
            <LabelList dataKey="value" position="right" fill={textColor} fontSize={12} />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
