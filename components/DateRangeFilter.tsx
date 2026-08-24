import type { DateRangePreset } from "@/lib/dateRange";

const inputClass =
  "rounded-md border border-line-strong bg-surface text-ink text-sm px-3 py-2 outline-none transition-colors hover:border-ink-muted focus:border-accent focus:ring-2 focus:ring-accent-soft";

export function DateRangeFilter({
  preset,
  customStart,
  customEnd,
  onPresetChange,
  onCustomStartChange,
  onCustomEndChange,
}: {
  preset: DateRangePreset;
  customStart: string;
  customEnd: string;
  onPresetChange: (preset: DateRangePreset) => void;
  onCustomStartChange: (value: string) => void;
  onCustomEndChange: (value: string) => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <select
        value={preset}
        onChange={(e) => onPresetChange(e.target.value as DateRangePreset)}
        className={inputClass}
        suppressHydrationWarning
      >
        <option value="this_week">This week</option>
        <option value="this_month">This month</option>
        <option value="custom">Custom range</option>
      </select>
      {preset === "custom" && (
        <>
          <input
            type="date"
            value={customStart}
            onChange={(e) => onCustomStartChange(e.target.value)}
            className={inputClass}
            suppressHydrationWarning
          />
          <span className="text-ink-muted text-sm">to</span>
          <input
            type="date"
            value={customEnd}
            onChange={(e) => onCustomEndChange(e.target.value)}
            className={inputClass}
            suppressHydrationWarning
          />
        </>
      )}
    </div>
  );
}
