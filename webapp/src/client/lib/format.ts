// Formatting + year/month utilities shared across the client UI.
// Pure functions — unit-tested in test/format.test.ts.

const yenFormatter = new Intl.NumberFormat("ja-JP");

/** Format an integer number of yen with 3-digit grouping + 円 suffix. */
export function formatYen(value: number): string {
  return `${yenFormatter.format(Math.round(value))}円`;
}

/** Format a signed amount: positive gets a leading + (for balances). */
export function formatYenSigned(value: number): string {
  const sign = value > 0 ? "+" : value < 0 ? "-" : "";
  return `${sign}${yenFormatter.format(Math.abs(Math.round(value)))}円`;
}

/** Plain grouped number (no 円), e.g. for compact table cells. */
export function formatNumber(value: number): string {
  return yenFormatter.format(Math.round(value));
}

/** A year + 1-based month pair. */
export interface YearMonth {
  year: number;
  month: number; // 1-12
}

/** Label like "2025年7月". */
export function formatYearMonth(ym: YearMonth): string {
  return `${ym.year}年${ym.month}月`;
}

/** Zero-padded label like "2025-07" (matches API date prefixes). */
export function yearMonthKey(ym: YearMonth): string {
  return `${ym.year}-${String(ym.month).padStart(2, "0")}`;
}

/** The previous month, rolling the year over at January. */
export function prevMonth(ym: YearMonth): YearMonth {
  if (ym.month === 1) return { year: ym.year - 1, month: 12 };
  return { year: ym.year, month: ym.month - 1 };
}

/** The next month, rolling the year over at December. */
export function nextMonth(ym: YearMonth): YearMonth {
  if (ym.month === 12) return { year: ym.year + 1, month: 1 };
  return { year: ym.year, month: ym.month + 1 };
}

/** The current year/month in the local timezone. */
export function currentYearMonth(now: Date = new Date()): YearMonth {
  return { year: now.getFullYear(), month: now.getMonth() + 1 };
}

/**
 * Parse the year/month out of an ISO date string (YYYY-MM-DD, or any string
 * beginning with YYYY-MM). Returns `fallback` (default: current month) when the
 * input is missing or malformed. Used to seed the initial display month from
 * the latest transaction so screens don't open on an empty (future) month.
 */
export function yearMonthFromDate(
  date: string | null | undefined,
  fallback: YearMonth = currentYearMonth(),
): YearMonth {
  if (!date) return fallback;
  const m = /^(\d{4})-(\d{2})/.exec(date);
  if (!m) return fallback;
  const year = Number(m[1]);
  const month = Number(m[2]);
  if (!Number.isFinite(year) || month < 1 || month > 12) return fallback;
  return { year, month };
}

/** Compare two YearMonth values (-1, 0, 1). */
export function compareYearMonth(a: YearMonth, b: YearMonth): number {
  const av = a.year * 12 + a.month;
  const bv = b.year * 12 + b.month;
  return av < bv ? -1 : av > bv ? 1 : 0;
}

/** Format an ISO date (YYYY-MM-DD) as "M/D" for compact rows. */
export function formatShortDate(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return iso;
  return `${Number(m[2])}/${Number(m[3])}`;
}

/** Percentage of a part relative to a whole, rounded to 0.1%. Guards /0. */
export function percentOf(part: number, whole: number): number {
  if (whole === 0) return 0;
  return Math.round((part / whole) * 1000) / 10;
}
