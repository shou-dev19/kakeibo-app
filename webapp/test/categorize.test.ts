import { describe, it, expect } from "vitest";
import { categorizeMany, categorizeOne, UNCATEGORIZED } from "../src/shared/categorize";
import type { CategoryRule } from "../src/shared/types";

// Seeded rules mirroring migrations/0002_seed.sql, including the generalized
// イオンカード×十日市場→食料品 (priority 0) special case.
const rules: CategoryRule[] = [
  { id: 1, keyword: "十日市場", institution: "イオンカード", category: "食料品", priority: 0 },
  { id: 2, keyword: "楽天", institution: null, category: "固定費", priority: 100 },
  { id: 3, keyword: "Amazon", institution: null, category: "変動費", priority: 100 },
];

// Rule 3: priority ascending; keyword substring; institution exact-match when
// non-null; UNCATEGORIZED on no match.
describe("categorizeOne", () => {
  it("matches keyword-only rules by substring", () => {
    expect(
      categorizeOne({ description: "楽天カード利用", institution: "楽天カード" }, rules),
    ).toBe("固定費");
  });

  it("returns 未分類 when no rule matches", () => {
    expect(
      categorizeOne({ description: "謎の店", institution: "現金" }, rules),
    ).toBe(UNCATEGORIZED);
  });

  it("reproduces the GAS イオンカード×十日市場→食料品 special case", () => {
    expect(
      categorizeOne(
        { description: "イオン十日市場店", institution: "イオンカード" },
        rules,
      ),
    ).toBe("食料品");
  });

  it("does NOT apply 十日市場 rule for a different institution (institution exact-match required)", () => {
    // Same keyword but institution differs -> the priority-0 rule is skipped;
    // no other rule matches -> 未分類.
    expect(
      categorizeOne(
        { description: "十日市場の店", institution: "三井住友カード" },
        rules,
      ),
    ).toBe(UNCATEGORIZED);
  });

  it("honors priority order: a lower-priority rule wins even if a later rule also matches", () => {
    const ordered: CategoryRule[] = [
      { id: 10, keyword: "スーパー", institution: null, category: "食料品", priority: 5 },
      { id: 11, keyword: "スーパー", institution: null, category: "その他", priority: 50 },
    ];
    expect(
      categorizeOne({ description: "スーパーX", institution: null }, ordered),
    ).toBe("食料品");
  });

  it("sorts rules by priority before evaluating (input order independent)", () => {
    const shuffled: CategoryRule[] = [
      { id: 11, keyword: "スーパー", institution: null, category: "その他", priority: 50 },
      { id: 10, keyword: "スーパー", institution: null, category: "食料品", priority: 5 },
    ];
    // categorizeMany sorts internally.
    const [tx] = categorizeMany(
      [{ description: "スーパーX", institution: null }],
      shuffled,
    );
    expect(tx.category).toBe("食料品");
  });
});
