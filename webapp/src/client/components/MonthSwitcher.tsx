import {
  formatYearMonth,
  nextMonth,
  prevMonth,
  type YearMonth,
} from "../lib/format";

/** Prev / current-month / next control used by monthly report & splitwise. */
export function MonthSwitcher({
  value,
  onChange,
}: {
  value: YearMonth;
  onChange: (ym: YearMonth) => void;
}) {
  return (
    <div className="flex items-center justify-center gap-2">
      <button
        type="button"
        onClick={() => onChange(prevMonth(value))}
        aria-label="前月"
        className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50"
      >
        ← 前月
      </button>
      <span className="min-w-28 text-center text-base font-semibold text-gray-800 tabular-nums">
        {formatYearMonth(value)}
      </span>
      <button
        type="button"
        onClick={() => onChange(nextMonth(value))}
        aria-label="翌月"
        className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50"
      >
        翌月 →
      </button>
    </div>
  );
}
