"use client";

import { CartesianGrid, ResponsiveContainer, Scatter, ScatterChart, Tooltip, XAxis, YAxis } from "recharts";
import { useIsDark } from "@/components/BarChartCard";
import { parseExperienceYears, parsePackageLpa } from "@/lib/parseRange";
import type { JobOpening } from "@/lib/types";

type Point = {
  x: number;
  y: number;
  roles: { company: string; role: string; experience: string; ctc: string }[];
};

const PACKAGE_AXIS_CAP_LPA = 80;

function formatNumber(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1).replace(/\.0$/, "");
}

/** Roles with the same plotted experience and package (common: "3 - 5 yrs" at
 * "12 LPA") collapse into one dot, and its tooltip lists every role there — so
 * nothing hides under an identical dot. */
function toPoints(openings: JobOpening[]): { points: Point[]; skipped: number } {
  const byKey = new Map<string, Point>();
  let skipped = 0;
  for (const o of openings) {
    const x = parseExperienceYears(o.years_of_experience);
    const y = parsePackageLpa(o.ctc);
    if (x === null || y === null) {
      skipped++;
      continue;
    }
    const key = `${x}|${y}`;
    const point = byKey.get(key) ?? { x, y, roles: [] };
    point.roles.push({
      company: o.company_name,
      role: o.role ?? "-",
      experience: o.years_of_experience ?? "-",
      ctc: o.ctc ?? "-",
    });
    byKey.set(key, point);
  }
  return { points: Array.from(byKey.values()), skipped };
}

function PointTooltip({ active, payload }: { active?: boolean; payload?: { payload: Point }[] }) {
  if (!active || !payload?.length) return null;
  const point = payload[0].payload;
  const shown = point.roles.slice(0, 6);
  return (
    <div className="max-w-xs rounded-lg border border-line bg-surface px-3 py-2 text-xs shadow-sm">
      <div className="mb-1.5 font-medium text-ink">
        {formatNumber(point.x)} yrs · ₹{formatNumber(point.y)} LPA
        {point.roles.length > 1 && <span className="font-normal text-ink-muted"> · {point.roles.length} roles</span>}
      </div>
      <ul className="flex flex-col gap-1.5">
        {shown.map((r, i) => (
          <li key={i}>
            <div className="text-ink">
              {r.company} — {r.role}
            </div>
            <div className="text-ink-muted">
              {r.experience} · {r.ctc}
            </div>
          </li>
        ))}
      </ul>
      {point.roles.length > shown.length && (
        <div className="mt-1.5 text-ink-muted">+{point.roles.length - shown.length} more</div>
      )}
    </div>
  );
}

export function ExperiencePackageChart({ openings }: { openings: JobOpening[] }) {
  const isDark = useIsDark();
  const dotColor = isDark ? "#3987e5" : "#2a78d6";
  const surface = isDark ? "#1a1a19" : "#fcfcfb";
  const gridColor = isDark ? "#2c2c2a" : "#e1e0d9";
  const textColor = isDark ? "#c3c2b7" : "#52514e";

  const { points: allPoints, skipped } = toPoints(openings);
  // One far outlier (confirmed 2026-09-30: a "1 - 1.3 Crore" role, ≈115 LPA)
  // would stretch the axis enough to crush every other role into the bottom
  // quarter — keep the scale on the bulk and name the outliers underneath.
  const points = allPoints.filter((p) => p.y <= PACKAGE_AXIS_CAP_LPA);
  const aboveCap = allPoints.filter((p) => p.y > PACKAGE_AXIS_CAP_LPA);
  const plotted = points.reduce((sum, p) => sum + p.roles.length, 0);

  return (
    <div className="rounded-lg border border-line bg-surface p-5">
      <h2 className="text-sm font-medium text-ink">Experience vs Package by Role</h2>
      <p className="mt-1 text-xs text-ink-secondary">
        Compare required experience with the offered package. Each dot is one role; hover to see it.
      </p>

      {points.length === 0 ? (
        <div className="py-16 text-center text-sm text-ink-muted">No roles with a readable experience and package</div>
      ) : (
        <div className="mt-4">
          <ResponsiveContainer width="100%" height={360}>
            <ScatterChart margin={{ top: 8, right: 16, bottom: 28, left: 8 }}>
              <CartesianGrid stroke={gridColor} strokeDasharray="0" />
              <XAxis
                type="number"
                dataKey="x"
                name="Experience"
                domain={[0, "auto"]}
                allowDecimals={false}
                tick={{ fill: textColor, fontSize: 12 }}
                tickFormatter={(v: number) => `${v} yrs`}
                axisLine={{ stroke: gridColor }}
                tickLine={false}
                label={{ value: "Required experience (years)", position: "insideBottom", offset: -16, fill: textColor, fontSize: 12 }}
              />
              <YAxis
                type="number"
                dataKey="y"
                name="Package"
                domain={[0, "auto"]}
                width={64}
                tick={{ fill: textColor, fontSize: 12 }}
                tickFormatter={(v: number) => `${v} LPA`}
                axisLine={{ stroke: gridColor }}
                tickLine={false}
              />
              <Tooltip content={<PointTooltip />} cursor={{ stroke: gridColor }} isAnimationActive={false} />
              <Scatter
                data={points}
                fill={dotColor}
                stroke={surface}
                strokeWidth={2}
                shape="circle"
                isAnimationActive={false}
              />
            </ScatterChart>
          </ResponsiveContainer>
        </div>
      )}

      <p className="mt-2 text-xs text-ink-muted">
        {plotted} of {openings.length} roles plotted. Ranges use the midpoint (5–8 years → 6.5, ₹25–28 LPA → 26.5);
        &ldquo;4+&rdquo; or &ldquo;Max 25 LPA&rdquo; use the stated number.
        {skipped > 0 &&
          ` ${skipped} not plotted because the experience or package isn't a single number or range (e.g. tiered by experience, or a % hike) — see the table below.`}
        {aboveCap.length > 0 &&
          ` Above ${PACKAGE_AXIS_CAP_LPA} LPA, off the scale: ${aboveCap
            .flatMap((p) => p.roles.map((r) => `${r.company} — ${r.role} (${formatNumber(p.x)} yrs, ₹${formatNumber(p.y)} LPA)`))
            .join("; ")}.`}
      </p>
    </div>
  );
}
