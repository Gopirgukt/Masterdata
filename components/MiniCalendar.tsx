"use client";

const WEEKDAY_LABELS = ["S", "M", "T", "W", "T", "F", "S"];

export type ViewMonth = { year: number; month: number }; // month: 0-indexed

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function dateKey(year: number, month: number, day: number): string {
  return `${year}-${pad2(month + 1)}-${pad2(day)}`;
}

export function shiftMonth(view: ViewMonth, delta: number): ViewMonth {
  const d = new Date(view.year, view.month + delta, 1);
  return { year: d.getFullYear(), month: d.getMonth() };
}

export function monthOf(dateIso: string): ViewMonth {
  const [year, month] = dateIso.split("-").map(Number);
  return { year, month: month - 1 };
}

/**
 * Month-grid calendar for browsing interviews by date — a day with any
 * scheduled interviews gets a dot; clicking a day filters the table to
 * exactly that date. Prev/next step by month so past and future interviews
 * (the data spans many months) are both reachable, not just today/tomorrow.
 */
export function MiniCalendar({
  view,
  onViewChange,
  countsByDate,
  selectedDate,
  onSelectDate,
  todayIso,
}: {
  view: ViewMonth;
  onViewChange: (view: ViewMonth) => void;
  countsByDate: Map<string, number>;
  selectedDate: string | null;
  onSelectDate: (date: string | null) => void;
  todayIso: string;
}) {
  const firstOfMonth = new Date(view.year, view.month, 1);
  const daysInMonth = new Date(view.year, view.month + 1, 0).getDate();
  const startWeekday = firstOfMonth.getDay();
  const monthLabel = firstOfMonth.toLocaleDateString(undefined, { month: "long", year: "numeric" });

  const cells: (number | null)[] = [
    ...Array.from({ length: startWeekday }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];

  return (
    <div className="rounded-lg border border-line bg-surface p-4 w-full max-w-xs">
      <div className="flex items-center justify-between mb-3">
        <button
          onClick={() => onViewChange(shiftMonth(view, -1))}
          aria-label="Previous month"
          className="flex h-7 w-7 items-center justify-center rounded-md text-ink-secondary hover:bg-surface-hover hover:text-ink"
        >
          ‹
        </button>
        <span className="text-sm font-medium text-ink">{monthLabel}</span>
        <button
          onClick={() => onViewChange(shiftMonth(view, 1))}
          aria-label="Next month"
          className="flex h-7 w-7 items-center justify-center rounded-md text-ink-secondary hover:bg-surface-hover hover:text-ink"
        >
          ›
        </button>
      </div>

      <div className="grid grid-cols-7 gap-1 mb-1">
        {WEEKDAY_LABELS.map((w, i) => (
          <div key={i} className="text-center text-xs text-ink-muted">
            {w}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-1">
        {cells.map((day, i) => {
          if (day === null) return <div key={i} />;
          const key = dateKey(view.year, view.month, day);
          const count = countsByDate.get(key) ?? 0;
          const isSelected = key === selectedDate;
          const isToday = key === todayIso;

          return (
            <button
              key={i}
              onClick={() => onSelectDate(isSelected ? null : key)}
              title={count > 0 ? `${count} interview${count === 1 ? "" : "s"}` : undefined}
              className={`relative flex aspect-square flex-col items-center justify-center rounded-md text-xs transition-colors ${
                isSelected
                  ? "bg-accent text-accent-ink font-medium"
                  : isToday
                    ? "bg-accent-soft text-accent font-medium"
                    : "text-ink hover:bg-surface-hover"
              }`}
            >
              {day}
              {count > 0 && (
                <span
                  className={`absolute bottom-1 h-1 w-1 rounded-full ${isSelected ? "bg-accent-ink" : "bg-accent"}`}
                />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
