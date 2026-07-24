import {
  compareYearMonth,
  currentYearMonth,
  shiftMonth,
  type YearMonth,
} from "./format";

/** Default month for monthly, annual, and splitwise reports. */
export function defaultReportMonth(now: Date = new Date()): YearMonth {
  return shiftMonth(currentYearMonth(now), -2);
}

/** Latest selectable ending month for the annual report. */
export function latestAnnualReportMonth(now: Date = new Date()): YearMonth {
  return shiftMonth(currentYearMonth(now), -1);
}

/** Keep an annual report ending month at or before its selectable maximum. */
export function clampAnnualReportMonth(
  month: YearMonth,
  maximum: YearMonth,
): YearMonth {
  return compareYearMonth(month, maximum) > 0 ? maximum : month;
}

/** Whether the annual report can advance one month without exceeding its maximum. */
export function canAdvanceAnnualReportMonth(
  month: YearMonth,
  maximum: YearMonth,
): boolean {
  return compareYearMonth(month, maximum) < 0;
}
