import { describe, expect, it } from "vitest";
import {
  compareYearMonth,
  currentYearMonth,
  formatNumber,
  formatShortDate,
  formatYearMonth,
  formatYen,
  formatYenSigned,
  nextMonth,
  percentOf,
  prevMonth,
  yearMonthFromDate,
  yearMonthKey,
} from "../src/client/lib/format";

describe("formatYen", () => {
  it("groups by 3 digits and appends 円", () => {
    expect(formatYen(1234567)).toBe("1,234,567円");
    expect(formatYen(0)).toBe("0円");
    expect(formatYen(999)).toBe("999円");
  });
  it("rounds fractional yen", () => {
    expect(formatYen(1234.6)).toBe("1,235円");
  });
});

describe("formatYenSigned", () => {
  it("prefixes sign", () => {
    expect(formatYenSigned(1000)).toBe("+1,000円");
    expect(formatYenSigned(-1000)).toBe("-1,000円");
    expect(formatYenSigned(0)).toBe("0円");
  });
});

describe("formatNumber", () => {
  it("groups without 円", () => {
    expect(formatNumber(1234567)).toBe("1,234,567");
  });
});

describe("year/month labels", () => {
  it("formats a Japanese label", () => {
    expect(formatYearMonth({ year: 2025, month: 7 })).toBe("2025年7月");
  });
  it("zero-pads the key", () => {
    expect(yearMonthKey({ year: 2025, month: 7 })).toBe("2025-07");
    expect(yearMonthKey({ year: 2025, month: 12 })).toBe("2025-12");
  });
});

describe("prevMonth / nextMonth", () => {
  it("rolls the year at boundaries", () => {
    expect(prevMonth({ year: 2025, month: 1 })).toEqual({ year: 2024, month: 12 });
    expect(nextMonth({ year: 2025, month: 12 })).toEqual({ year: 2026, month: 1 });
  });
  it("stays within the year otherwise", () => {
    expect(prevMonth({ year: 2025, month: 7 })).toEqual({ year: 2025, month: 6 });
    expect(nextMonth({ year: 2025, month: 7 })).toEqual({ year: 2025, month: 8 });
  });
  it("is reversible", () => {
    const ym = { year: 2025, month: 3 };
    expect(nextMonth(prevMonth(ym))).toEqual(ym);
    expect(prevMonth(nextMonth(ym))).toEqual(ym);
  });
});

describe("currentYearMonth", () => {
  it("derives a 1-based month from a Date", () => {
    expect(currentYearMonth(new Date(2026, 0, 15))).toEqual({
      year: 2026,
      month: 1,
    });
    expect(currentYearMonth(new Date(2026, 11, 31))).toEqual({
      year: 2026,
      month: 12,
    });
  });
});

describe("yearMonthFromDate", () => {
  const fallback = { year: 2026, month: 7 };

  it("extracts year/month from an ISO date", () => {
    expect(yearMonthFromDate("2026-06-15", fallback)).toEqual({
      year: 2026,
      month: 6,
    });
  });
  it("extracts from a date that only has YYYY-MM prefix", () => {
    expect(yearMonthFromDate("2025-12-01T00:00:00Z", fallback)).toEqual({
      year: 2025,
      month: 12,
    });
  });
  it("falls back when the date is null/undefined/empty (no data)", () => {
    expect(yearMonthFromDate(null, fallback)).toEqual(fallback);
    expect(yearMonthFromDate(undefined, fallback)).toEqual(fallback);
    expect(yearMonthFromDate("", fallback)).toEqual(fallback);
  });
  it("falls back when the string is malformed", () => {
    expect(yearMonthFromDate("bad-date", fallback)).toEqual(fallback);
    expect(yearMonthFromDate("2026/06/15", fallback)).toEqual(fallback);
  });
  it("falls back when the month is out of range", () => {
    expect(yearMonthFromDate("2026-00-01", fallback)).toEqual(fallback);
    expect(yearMonthFromDate("2026-13-01", fallback)).toEqual(fallback);
  });
  it("defaults the fallback to the current month", () => {
    expect(yearMonthFromDate(null)).toEqual(currentYearMonth());
  });
});

describe("compareYearMonth", () => {
  it("orders by year then month", () => {
    expect(compareYearMonth({ year: 2025, month: 1 }, { year: 2025, month: 2 })).toBe(-1);
    expect(compareYearMonth({ year: 2026, month: 1 }, { year: 2025, month: 12 })).toBe(1);
    expect(compareYearMonth({ year: 2025, month: 5 }, { year: 2025, month: 5 })).toBe(0);
  });
});

describe("formatShortDate", () => {
  it("renders M/D from an ISO date", () => {
    expect(formatShortDate("2025-07-05")).toBe("7/5");
    expect(formatShortDate("2025-12-31")).toBe("12/31");
  });
  it("passes through non-ISO input", () => {
    expect(formatShortDate("bad")).toBe("bad");
  });
});

describe("percentOf", () => {
  it("computes a rounded percentage", () => {
    expect(percentOf(25, 100)).toBe(25);
    expect(percentOf(1, 3)).toBe(33.3);
  });
  it("guards divide-by-zero", () => {
    expect(percentOf(5, 0)).toBe(0);
  });
});
