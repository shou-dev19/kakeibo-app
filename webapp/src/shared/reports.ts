// Report aggregation. Pure functions, no runtime/D1 dependencies.
//
// Ported from Service_ReportGenerator.gs. Each function takes plain arrays
// (already fetched from D1) and returns a serializable result, so the whole
// aggregation surface is unit-testable without a database.

import type { SecuritiesBalance, Transaction } from "./types";

/** The always-excluded transfer category (振替), enforced in app logic. */
export const TRANSFER_CATEGORY = "振替";
/** Category treated as investment for the annual report's investment column. */
export const INVESTMENT_CATEGORY = "投資";
const UNCATEGORIZED = "未分類";

/** Minimal transaction shape the reports need. */
export interface ReportTransaction {
  date: string; // YYYY-MM-DD
  amount: number;
  type: string; // '収入' | '支出'
  category: string | null;
  institution: string | null;
  balance?: number | null;
}

// ---------------------------------------------------------------------------
// Monthly report
// ---------------------------------------------------------------------------

export interface MonthlyCategoryBreakdown {
  category: string;
  amount: number;
}

export interface MonthlyReport {
  year: number;
  month: number;
  totalIncome: number;
  totalExpense: number;
  balance: number; // income - expense
  /** type='支出' only, one entry per category, sorted by amount desc. */
  categoryBreakdown: MonthlyCategoryBreakdown[];
}

function categoryOf(tx: ReportTransaction): string {
  return tx.category || UNCATEGORIZED;
}

/** Filter transactions to the given year/month by their ISO date prefix. */
export function filterByMonth<T extends { date: string }>(
  txs: T[],
  year: number,
  month: number,
): T[] {
  const prefix = `${year}-${String(month).padStart(2, "0")}-`;
  return txs.filter((tx) => tx.date.startsWith(prefix));
}

/**
 * Monthly income/expense summary + per-category expense breakdown.
 * `振替` and balance-excluded categories are removed from income, expense and
 * category totals alike. Category breakdown considers type='支出' only.
 */
export function buildMonthlyReport(
  txs: ReportTransaction[],
  year: number,
  month: number,
  balanceExcluded: Iterable<string>,
): MonthlyReport {
  const excluded = new Set(balanceExcluded);
  let totalIncome = 0;
  let totalExpense = 0;
  const byCategory = new Map<string, number>();

  for (const tx of txs) {
    const category = categoryOf(tx);
    if (category === TRANSFER_CATEGORY || excluded.has(category)) continue;

    if (tx.type === "収入") {
      totalIncome += tx.amount;
    } else {
      totalExpense += tx.amount;
    }

    if (tx.type === "支出") {
      byCategory.set(category, (byCategory.get(category) ?? 0) + tx.amount);
    }
  }

  const categoryBreakdown = [...byCategory.entries()]
    .map(([category, amount]) => ({ category, amount }))
    .sort((a, b) => b.amount - a.amount);

  return {
    year,
    month,
    totalIncome,
    totalExpense,
    balance: totalIncome - totalExpense,
    categoryBreakdown,
  };
}

// ---------------------------------------------------------------------------
// Annual report (trailing 12 months)
// ---------------------------------------------------------------------------

export interface AnnualMonthlyRow {
  month: string; // 'YYYY/MM'
  income: number;
  expense: number;
  surplus: number; // income - expense
  investment: number;
  afterInvestment: number; // surplus - investment
}

export interface AnnualCategoryRow {
  category: string;
  monthly: number[]; // 12 values, oldest -> newest (aligned with `months`)
  average: number; // total / 12
  total: number;
}

export interface AnnualReport {
  months: string[]; // 12 'YYYY/MM' labels, oldest -> newest
  monthlySummaries: AnnualMonthlyRow[]; // aligned with `months`
  totals: AnnualMonthlyRow; // 合計 row (month = '合計')
  categoryTable: AnnualCategoryRow[]; // sorted by category name
}

/** Compute the 12 (year, month) pairs ending at the reference month. */
export function trailing12Months(
  refYear: number,
  refMonth: number,
): { year: number; month: number; key: string }[] {
  const result: { year: number; month: number; key: string }[] = [];
  // i = 11 (oldest) .. 0 (reference month), so the array is oldest -> newest.
  for (let i = 11; i >= 0; i--) {
    // Normalize month arithmetic via a 0-based month index.
    const idx = (refYear * 12 + (refMonth - 1)) - i;
    const year = Math.floor(idx / 12);
    const month = (idx % 12) + 1;
    const key = `${year}/${String(month).padStart(2, "0")}`;
    result.push({ year, month, key });
  }
  return result;
}

/**
 * Trailing-12-month annual report.
 *   - Monthly income/expense: 振替 + balance-excluded categories removed.
 *   - investment column: type='支出' AND category='投資' (assumed to be in the
 *     balance-excluded set, so it does not double-count in expense).
 *   - surplus = income - expense; afterInvestment = surplus - investment.
 *   - category table: type='支出' with 振替 + annual-excluded categories removed.
 */
export function buildAnnualReport(
  txs: ReportTransaction[],
  refYear: number,
  refMonth: number,
  balanceExcluded: Iterable<string>,
  annualExcluded: Iterable<string>,
): AnnualReport {
  const balanceEx = new Set(balanceExcluded);
  const annualEx = new Set(annualExcluded);
  const months = trailing12Months(refYear, refMonth);

  const monthlySummaries: AnnualMonthlyRow[] = [];
  // monthKey -> (category -> amount)
  const monthlyCategoryExpenses = new Map<string, Map<string, number>>();
  const allCategories = new Set<string>();

  for (const { year, month, key } of months) {
    const monthTxs = filterByMonth(txs, year, month);
    const catMap = new Map<string, number>();
    monthlyCategoryExpenses.set(key, catMap);

    let income = 0;
    let expense = 0;
    let investment = 0;

    for (const tx of monthTxs) {
      const category = categoryOf(tx);

      if (category !== TRANSFER_CATEGORY && !balanceEx.has(category)) {
        if (tx.type === "収入") income += tx.amount;
        else expense += tx.amount;
      }

      if (tx.type === "支出" && category === INVESTMENT_CATEGORY) {
        investment += tx.amount;
      }

      if (
        tx.type === "支出" &&
        category !== TRANSFER_CATEGORY &&
        !annualEx.has(category)
      ) {
        catMap.set(category, (catMap.get(category) ?? 0) + tx.amount);
        allCategories.add(category);
      }
    }

    const surplus = income - expense;
    monthlySummaries.push({
      month: key,
      income,
      expense,
      surplus,
      investment,
      afterInvestment: surplus - investment,
    });
  }

  const totals: AnnualMonthlyRow = {
    month: "合計",
    income: monthlySummaries.reduce((s, r) => s + r.income, 0),
    expense: monthlySummaries.reduce((s, r) => s + r.expense, 0),
    surplus: monthlySummaries.reduce((s, r) => s + r.surplus, 0),
    investment: monthlySummaries.reduce((s, r) => s + r.investment, 0),
    afterInvestment: 0,
  };
  totals.afterInvestment = totals.surplus - totals.investment;

  const sortedCategories = [...allCategories].sort();
  const categoryTable: AnnualCategoryRow[] = sortedCategories.map((category) => {
    const monthly = months.map(
      ({ key }) => monthlyCategoryExpenses.get(key)?.get(category) ?? 0,
    );
    const total = monthly.reduce((s, v) => s + v, 0);
    return { category, monthly, average: total / 12, total };
  });

  return {
    months: months.map((m) => m.key),
    monthlySummaries,
    totals,
    categoryTable,
  };
}

// ---------------------------------------------------------------------------
// Assets: daily total-asset time series + portfolio snapshot
// ---------------------------------------------------------------------------

export interface AssetPoint {
  date: string; // YYYY-MM-DD
  total: number;
}

export interface PortfolioSlice {
  label: string;
  value: number;
}

export interface PortfolioReport {
  bankTotal: number; // 預金・現金
  securitiesTotal: number; // 証券
  total: number;
  slices: PortfolioSlice[]; // [{預金・現金}, {証券}] with non-... included
}

/** Only bank transactions with a non-null balance participate in asset series. */
function withBalance(txs: ReportTransaction[]): ReportTransaction[] {
  return txs.filter((tx) => tx.balance != null);
}

/**
 * Daily total-asset series. For each date in the sorted union of all balance
 * dates (bank + securities), carry forward the latest balance per institution
 * and the latest value per brokerage, then sum both.
 */
export function buildAssetSeries(
  txs: ReportTransaction[],
  securities: SecuritiesBalance[],
): AssetPoint[] {
  const bankTxs = withBalance(txs);
  if (bankTxs.length === 0 && securities.length === 0) return [];

  const dateSet = new Set<string>();
  for (const tx of bankTxs) dateSet.add(tx.date);
  for (const s of securities) dateSet.add(s.date);
  const dates = [...dateSet].sort();

  // Pre-sort inputs by date so we can advance pointers instead of rescanning.
  const sortedBank = [...bankTxs].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  const sortedSec = [...securities].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

  const lastBank = new Map<string, number>();
  const lastSec = new Map<string, number>();
  let bi = 0;
  let si = 0;
  const series: AssetPoint[] = [];

  for (const date of dates) {
    while (bi < sortedBank.length && sortedBank[bi].date <= date) {
      const tx = sortedBank[bi];
      lastBank.set(tx.institution ?? "", tx.balance as number);
      bi++;
    }
    while (si < sortedSec.length && sortedSec[si].date <= date) {
      const s = sortedSec[si];
      lastSec.set(s.brokerage, s.value);
      si++;
    }

    let total = 0;
    for (const v of lastBank.values()) total += v;
    for (const v of lastSec.values()) total += v;
    series.push({ date, total });
  }

  return series;
}

/**
 * Current portfolio snapshot: sum of each institution's latest balance (bank /
 * cash) + each brokerage's latest value (securities). "Latest" here follows the
 * GAS version: the last occurrence in input order wins per key.
 */
export function buildPortfolio(
  txs: ReportTransaction[],
  securities: SecuritiesBalance[],
): PortfolioReport {
  const latestBank = new Map<string, number>();
  for (const tx of withBalance(txs)) {
    latestBank.set(tx.institution ?? "", tx.balance as number);
  }
  const bankTotal = [...latestBank.values()].reduce((s, v) => s + v, 0);

  const latestSec = new Map<string, number>();
  for (const s of securities) {
    latestSec.set(s.brokerage, s.value);
  }
  const securitiesTotal = [...latestSec.values()].reduce((s, v) => s + v, 0);

  return {
    bankTotal,
    securitiesTotal,
    total: bankTotal + securitiesTotal,
    slices: [
      { label: "預金・現金", value: bankTotal },
      { label: "証券", value: securitiesTotal },
    ],
  };
}

/** Re-export for callers that only have the DB Transaction type. */
export type { Transaction };
