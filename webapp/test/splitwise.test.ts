import { describe, it, expect } from "vitest";
import {
  calculateSplitwise,
  matchSplitRule,
  sortSplitRules,
  type SplitwiseTransaction,
} from "../src/shared/splitwise";
import type { SplitRule } from "../src/shared/types";

// Rules mirroring migrations/0002_seed.sql. Deliberately shuffled. All fixtures
// use priority=100 to prove that the existing data-driven evaluation order
// remains unchanged regardless of input order:
//   inst-100 -> inst-50 -> kw-100 -> kw-50 -> kw-31
// (rate DESC within each match_type; note kw-50 sorts before kw-31, which is
// the one spot where this differs from the GAS keyword order 100 -> 31 -> 50).
const rules: SplitRule[] = [
  {
    id: 5,
    match_type: "institution",
    pattern: "イオンカード",
    rate: 100,
    priority: 100,
  },
  { id: 2, match_type: "keyword", pattern: "割り勘", rate: 50, priority: 100 },
  {
    id: 1,
    match_type: "keyword",
    pattern: "ﾖｺﾊﾏｼﾎｲｸﾘﾖｳ",
    rate: 31,
    priority: 100,
  },
  {
    id: 4,
    match_type: "keyword",
    pattern: "全額立替",
    rate: 100,
    priority: 100,
  },
  {
    id: 6,
    match_type: "institution",
    pattern: "楽天カード",
    rate: 50,
    priority: 100,
  },
];

function tx(overrides: Partial<SplitwiseTransaction>): SplitwiseTransaction {
  return {
    date: "2025-07-10",
    description: "買い物",
    amount: 1000,
    type: "支出",
    institution: "現金",
    category: "食料品",
    ...overrides,
  };
}

describe("sortSplitRules", () => {
  it("orders institution rules before keyword rules, rate DESC within each group", () => {
    // Spec: match_type='institution' before 'keyword'; within a group, rate
    // descending. This reproduces the GAS precedence in practice because the
    // real rule patterns do not overlap (a 保育料 description contains
    // ﾖｺﾊﾏｼﾎｲｸﾘﾖｳ but not 割り勘, etc.). Note the pure sort places the keyword-50
    // rule before keyword-31 (50 > 31), whereas GAS evaluates the 31% special
    // before 50% split keywords; this only differs for a contrived description
    // matching BOTH (see the calculateSplitwise overlap test below).
    const order = sortSplitRules(rules).map((r) => `${r.match_type}:${r.rate}`);
    expect(order).toEqual([
      "institution:100", // full-charge institutions
      "institution:50", // split institutions
      "keyword:100", // full-charge keywords
      "keyword:50", // split keywords
      "keyword:31", // special 31% keyword
    ]);
  });

  it("orders by priority before match type, rate, and id", () => {
    const priorityRules: SplitRule[] = [
      {
        id: 1,
        match_type: "institution",
        pattern: "通常の機関",
        rate: 100,
        priority: 100,
      },
      {
        id: 2,
        match_type: "keyword",
        pattern: "最優先キーワード",
        rate: 31,
        priority: 10,
      },
      {
        id: 3,
        match_type: "keyword",
        pattern: "通常キーワード",
        rate: 100,
        priority: 100,
      },
    ];

    expect(sortSplitRules(priorityRules).map((r) => r.id)).toEqual([2, 1, 3]);
  });

  it("uses institution, rate DESC, then id ASC when priority is tied", () => {
    const tiedRules: SplitRule[] = [
      { id: 5, match_type: "keyword", pattern: "同点", rate: 100, priority: 20 },
      { id: 4, match_type: "institution", pattern: "同点", rate: 50, priority: 20 },
      { id: 3, match_type: "institution", pattern: "同点", rate: 100, priority: 20 },
      { id: 2, match_type: "institution", pattern: "同点", rate: 100, priority: 20 },
    ];

    expect(sortSplitRules(tiedRules).map((r) => r.id)).toEqual([2, 3, 4, 5]);
  });
});

describe("matchSplitRule", () => {
  it("prefers a full-charge institution over a keyword that would also match", () => {
    // Institution is イオンカード (full 100) AND description contains 割り勘 (50).
    // GAS stage 1 (full institution) wins.
    const rule = matchSplitRule(
      tx({ institution: "イオンカード", description: "割り勘の店" }),
      sortSplitRules(rules),
    );
    expect(rule?.rate).toBe(100);
    expect(rule?.match_type).toBe("institution");
  });

  it("applies the 31% special keyword to a 保育料 description", () => {
    const rule = matchSplitRule(
      tx({ description: "ﾖｺﾊﾏｼﾎｲｸﾘﾖｳ" }),
      sortSplitRules(rules),
    );
    expect(rule?.rate).toBe(31);
  });

  it("matches institution by substring (部分一致)", () => {
    const rule = matchSplitRule(
      tx({ institution: "イオンカードゴールド" }),
      sortSplitRules(rules),
    );
    expect(rule?.rate).toBe(100);
  });

  it("returns null when nothing matches", () => {
    expect(
      matchSplitRule(tx({ description: "無関係", institution: "現金" }), sortSplitRules(rules)),
    ).toBeNull();
  });
});

describe("calculateSplitwise", () => {
  it("uses 西松屋 at 50% when its priority beats another matching keyword", () => {
    const overlapRules: SplitRule[] = [
      {
        id: 1,
        match_type: "keyword",
        pattern: "西松屋",
        rate: 50,
        priority: 10,
      },
      {
        id: 2,
        match_type: "keyword",
        pattern: "ダイエー十日市場",
        rate: 100,
        priority: 100,
      },
    ];
    const overlap = tx({
      description: "西松屋チェーン　ダイエー十日市場店",
      amount: 1000,
    });

    const matched = matchSplitRule(overlap, sortSplitRules(overlapRules));
    expect(matched?.pattern).toBe("西松屋");
    expect(matched?.rate).toBe(50);

    const res = calculateSplitwise([overlap], overlapRules, 2025, 7);
    expect(res.items[0].rate).toBe(50);
    expect(res.totalBilled).toBe(500);
  });

  it("excludes 振替 and non-支出 transactions", () => {
    const txs = [
      tx({ description: "割り勘対象", category: "食料品" }),
      tx({ description: "割り勘だが振替", category: "振替" }),
      tx({ description: "割り勘の収入", type: "収入" }),
    ];
    const res = calculateSplitwise(txs, rules, 2025, 7);
    expect(res.items).toHaveLength(1);
    expect(res.items[0].description).toBe("割り勘対象");
  });

  it("computes billed = amount * rate/100 and per-rate subtotals", () => {
    const txs = [
      tx({ description: "割り勘A", amount: 1000 }), // 50% -> 500
      tx({ description: "ﾖｺﾊﾏｼﾎｲｸﾘﾖｳ", amount: 20000 }), // 31% -> 6200
      tx({ institution: "イオンカード", description: "全額", amount: 3000 }), // 100% -> 3000
    ];
    const res = calculateSplitwise(txs, rules, 2025, 7);
    expect(res.totalBilled).toBe(500 + 6200 + 3000);

    const byRate = Object.fromEntries(res.subtotals.map((s) => [s.rate, s]));
    expect(byRate[50].amount).toBe(1000);
    expect(byRate[50].billed).toBe(500);
    expect(byRate[31].billed).toBe(6200);
    expect(byRate[100].billed).toBe(3000);
    // subtotals sorted rate desc
    expect(res.subtotals.map((s) => s.rate)).toEqual([100, 50, 31]);
  });

  it("totals from rate-grouped subtotals (unrounded), matching GAS to the yen", () => {
    // GAS computes splitTotal*0.5 (unrounded). Three 101円 lines at 50% give a
    // subtotal amount of 303; 303*0.5 = 151.5. Summing rounded per-line shares
    // (Math.round(101*0.5)=51 each → 153) would drift by 1.5円, so totalBilled
    // must keep the fraction.
    const txs = [
      tx({ description: "割り勘A", amount: 101 }),
      tx({ description: "割り勘B", amount: 101 }),
      tx({ description: "割り勘C", amount: 101 }),
    ];
    const res = calculateSplitwise(txs, rules, 2025, 7);
    expect(res.totalBilled).toBe(151.5);

    const sub50 = res.subtotals.find((s) => s.rate === 50)!;
    expect(sub50.amount).toBe(303);
    expect(sub50.billed).toBe(151.5); // unrounded, not 3 * round(50.5) = 153
    expect(sub50.count).toBe(3);

    // Line-level billed remains the rounded display value.
    expect(res.items.map((i) => i.billed)).toEqual([51, 51, 51]);
  });

  it("differs from GAS only for a description matching BOTH 31% special and 50% keyword", () => {
    // Contrived description that contains the 31% special substring AND the 50%
    // 割り勘 keyword. GAS evaluates the 31% special first (stage 4) and would
    // bill it at 31%; the data-driven sort (rate DESC) reaches kw-50 first and
    // bills it at 50%. Real data never produces such an overlap.
    const overlap = tx({
      institution: "現金",
      description: "ﾖｺﾊﾏｼﾎｲｸﾘﾖｳ 割り勘",
      amount: 1000,
    });
    const res = calculateSplitwise([overlap], rules, 2025, 7);
    // Web (sort-based) result: 50%, NOT the GAS 31%.
    expect(res.items[0].rate).toBe(50);
    expect(res.totalBilled).toBe(500);
  });

  it("reproduces the full GAS 5-stage precedence in a single mixed batch", () => {
    const txs = [
      // Would match kw-50 (割り勘) but institution イオンカード (100) wins.
      tx({ institution: "イオンカード", description: "割り勘", amount: 1000 }),
      // Would match kw-50 but institution 楽天カード (split 50) wins by inst>kw.
      tx({ institution: "楽天カード", description: "全額立替", amount: 1000 }),
      // Pure keyword full-charge (100).
      tx({ institution: "現金", description: "全額立替 実施", amount: 1000 }),
      // 保育料 special 31%.
      tx({ institution: "現金", description: "ﾖｺﾊﾏｼﾎｲｸﾘﾖｳ", amount: 1000 }),
      // Pure keyword split 50%.
      tx({ institution: "現金", description: "割り勘ランチ", amount: 1000 }),
    ];
    const res = calculateSplitwise(txs, rules, 2025, 7);
    expect(res.items.map((i) => i.rate)).toEqual([100, 50, 100, 31, 50]);
  });
});
