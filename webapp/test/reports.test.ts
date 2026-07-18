import { describe, it, expect } from "vitest";
import {
  buildAnnualReport,
  buildAssetSeries,
  buildMonthlyReport,
  buildPortfolio,
  trailing12Months,
  type ReportTransaction,
} from "../src/shared/reports";
import type { SecuritiesBalance } from "../src/shared/types";

function t(o: Partial<ReportTransaction>): ReportTransaction {
  return {
    date: "2025-07-01",
    amount: 1000,
    type: "支出",
    category: "食料品",
    institution: "銀行A",
    balance: null,
    ...o,
  };
}

// Rule 4: monthly report — 振替 + balance-excluded removed from income/expense/
// category totals; income to income total, else expense; category breakdown is
// 支出 only.
describe("buildMonthlyReport", () => {
  it("sums income vs expense and excludes 振替 + balance-excluded categories", () => {
    const txs = [
      t({ type: "収入", category: "給与", amount: 300000 }),
      t({ type: "支出", category: "食料品", amount: 40000 }),
      t({ type: "支出", category: "外食", amount: 10000 }),
      t({ type: "支出", category: "振替", amount: 99999 }), // excluded always
      t({ type: "支出", category: "投資", amount: 50000 }), // balance-excluded
    ];
    const r = buildMonthlyReport(txs, 2025, 7, ["投資"]);
    expect(r.totalIncome).toBe(300000);
    expect(r.totalExpense).toBe(50000); // 40000 + 10000
    expect(r.balance).toBe(250000);
    expect(r.categoryBreakdown).toEqual([
      { category: "食料品", amount: 40000 },
      { category: "外食", amount: 10000 },
    ]);
  });

  it("category breakdown includes only 支出 (not 収入)", () => {
    const txs = [
      t({ type: "収入", category: "食料品返金", amount: 500 }),
      t({ type: "支出", category: "食料品", amount: 800 }),
    ];
    const r = buildMonthlyReport(txs, 2025, 7, []);
    expect(r.categoryBreakdown).toEqual([{ category: "食料品", amount: 800 }]);
  });
});

describe("trailing12Months", () => {
  it("returns 12 oldest->newest month keys ending at the reference month", () => {
    const m = trailing12Months(2025, 3);
    expect(m).toHaveLength(12);
    expect(m[0].key).toBe("2024/04");
    expect(m[11].key).toBe("2025/03");
  });
});

// Rule 5: annual report exclusions + investment split.
describe("buildAnnualReport", () => {
  it("applies balance exclusion to monthly rows, tracks 投資 separately, and uses annual exclusion for the category table", () => {
    const txs: ReportTransaction[] = [
      t({ date: "2025-07-05", type: "収入", category: "給与", amount: 300000 }),
      t({ date: "2025-07-06", type: "支出", category: "食料品", amount: 40000 }),
      t({ date: "2025-07-07", type: "支出", category: "投資", amount: 50000 }), // balance-excluded, investment
      t({ date: "2025-07-08", type: "支出", category: "振替", amount: 12345 }), // always excluded
    ];
    const r = buildAnnualReport(txs, 2025, 7, ["投資"], ["振替"]);

    const july = r.monthlySummaries.find((s) => s.month === "2025/07")!;
    expect(july.income).toBe(300000);
    expect(july.expense).toBe(40000); // 投資 excluded from expense
    expect(july.surplus).toBe(260000);
    expect(july.investment).toBe(50000);
    expect(july.afterInvestment).toBe(260000 - 50000);

    // category table: 支出 minus 振替/annual-excluded. 投資 is NOT annual-excluded
    // here, so it appears in the table even though it's balance-excluded.
    const cats = r.categoryTable.map((c) => c.category).sort();
    expect(cats).toEqual(["投資", "食料品"]);
    expect(r.categoryTable.find((c) => c.category === "振替")).toBeUndefined();
  });

  it("computes totals row and 12-month category averages", () => {
    const txs = [t({ date: "2025-07-06", type: "支出", category: "食料品", amount: 12000 })];
    const r = buildAnnualReport(txs, 2025, 7, [], []);
    expect(r.totals.month).toBe("合計");
    expect(r.totals.expense).toBe(12000);
    const food = r.categoryTable.find((c) => c.category === "食料品")!;
    expect(food.total).toBe(12000);
    expect(food.average).toBeCloseTo(1000); // 12000 / 12
    expect(food.monthly).toHaveLength(12);
  });
});

// Rule 6 & 7: assets series (carry-forward) + portfolio (latest per key).
describe("buildAssetSeries & buildPortfolio", () => {
  const bank: ReportTransaction[] = [
    t({ date: "2025-01-01", institution: "銀行A", balance: 100 }),
    t({ date: "2025-02-01", institution: "銀行B", balance: 50 }),
    t({ date: "2025-03-01", institution: "銀行A", balance: 120 }),
  ];
  const sec: SecuritiesBalance[] = [
    { id: 1, date: "2025-02-01", brokerage: "SBI", value: 1000 },
    { id: 2, date: "2025-03-01", brokerage: "SBI", value: 1200 },
  ];

  it("carries forward the latest balance per institution/brokerage across the date union", () => {
    const series = buildAssetSeries(bank, sec);
    expect(series.map((p) => p.date)).toEqual(["2025-01-01", "2025-02-01", "2025-03-01"]);
    // 2025-01-01: only 銀行A=100
    expect(series[0].total).toBe(100);
    // 2025-02-01: 銀行A=100 + 銀行B=50 + SBI=1000
    expect(series[1].total).toBe(1150);
    // 2025-03-01: 銀行A=120 (updated) + 銀行B=50 + SBI=1200
    expect(series[2].total).toBe(1370);
  });

  it("ignores transactions without a balance", () => {
    const series = buildAssetSeries([t({ date: "2025-01-01", balance: null })], []);
    expect(series).toEqual([]);
  });

  it("portfolio sums the latest balance per institution + latest value per brokerage", () => {
    const p = buildPortfolio(bank, sec);
    expect(p.bankTotal).toBe(120 + 50); // 銀行A latest 120, 銀行B 50
    expect(p.securitiesTotal).toBe(1200);
    expect(p.total).toBe(1370);
    expect(p.slices).toEqual([
      { label: "預金・現金", value: 170 },
      { label: "証券", value: 1200 },
    ]);
  });
});
