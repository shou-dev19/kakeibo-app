import { useMemo } from "react";
import { api } from "../lib/api";
import { useAsync } from "./useAsync";
import {
  currentYearMonth,
  yearMonthFromDate,
  type YearMonth,
} from "../lib/format";

export interface LatestDataMonth {
  /** Resolved initial month: latest transaction's month, or current month. */
  ym: YearMonth;
  /** True until the latest-month lookup has settled (success or failure). */
  loading: boolean;
}

/**
 * Resolve the month to open screens on: the year/month of the most recent
 * transaction (fetched via `/api/transactions?limit=1`, which is ordered by
 * date DESC). Falls back to the current month on error or when there are no
 * transactions yet.
 *
 * The result is meant to seed *initial* selection state only — callers must not
 * re-apply it after the user changes month, so the returned `ym` should be read
 * once (e.g. to lazily initialize a `useState`).
 */
export function useLatestDataMonth(): LatestDataMonth {
  const query = useAsync(() => api.getTransactions({ limit: 1 }), []);

  const ym = useMemo<YearMonth>(() => {
    const latest = query.data?.items[0]?.date;
    return yearMonthFromDate(latest, currentYearMonth());
  }, [query.data]);

  return { ym, loading: query.loading };
}
