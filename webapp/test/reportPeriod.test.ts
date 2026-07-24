import { describe, expect, it } from "vitest";
import {
  canAdvanceAnnualReportMonth,
  clampAnnualReportMonth,
  defaultReportMonth,
  latestAnnualReportMonth,
} from "../src/client/lib/reportPeriod";

describe("defaultReportMonth", () => {
  it("returns two months before the current month", () => {
    expect(defaultReportMonth(new Date(2026, 6, 24))).toEqual({
      year: 2026,
      month: 5,
    });
  });

  it("rolls into the previous year", () => {
    expect(defaultReportMonth(new Date(2026, 0, 15))).toEqual({
      year: 2025,
      month: 11,
    });
  });
});

describe("latestAnnualReportMonth", () => {
  it("returns the month before the current month", () => {
    expect(latestAnnualReportMonth(new Date(2026, 6, 24))).toEqual({
      year: 2026,
      month: 6,
    });
  });

  it("rolls into the previous year", () => {
    expect(latestAnnualReportMonth(new Date(2026, 0, 15))).toEqual({
      year: 2025,
      month: 12,
    });
  });
});

describe("clampAnnualReportMonth", () => {
  const maximum = { year: 2026, month: 6 };

  it("keeps months at or before the maximum", () => {
    expect(
      clampAnnualReportMonth({ year: 2026, month: 5 }, maximum),
    ).toEqual({ year: 2026, month: 5 });
    expect(
      clampAnnualReportMonth({ year: 2026, month: 6 }, maximum),
    ).toEqual(maximum);
  });

  it("clamps months after the maximum", () => {
    expect(
      clampAnnualReportMonth({ year: 2026, month: 7 }, maximum),
    ).toEqual(maximum);
    expect(
      clampAnnualReportMonth({ year: 2027, month: 1 }, maximum),
    ).toEqual(maximum);
  });
});

describe("canAdvanceAnnualReportMonth", () => {
  const maximum = { year: 2026, month: 6 };

  it("allows advancing only before the maximum", () => {
    expect(
      canAdvanceAnnualReportMonth({ year: 2026, month: 5 }, maximum),
    ).toBe(true);
    expect(
      canAdvanceAnnualReportMonth({ year: 2026, month: 6 }, maximum),
    ).toBe(false);
    expect(
      canAdvanceAnnualReportMonth({ year: 2026, month: 7 }, maximum),
    ).toBe(false);
  });
});
