import { describe, expect, it } from "vitest";
import {
  CATEGORY_COLORS,
  getCategoryColor,
  UNCATEGORIZED_CATEGORY_COLOR,
} from "../src/client/lib/categoryColors";

describe("getCategoryColor", () => {
  it("keeps the complete palette and its order compatible", () => {
    expect(CATEGORY_COLORS).toEqual([
      "#0d9488",
      "#f59e0b",
      "#3b82f6",
      "#ef4444",
      "#8b5cf6",
      "#10b981",
      "#ec4899",
      "#6366f1",
      "#f97316",
      "#14b8a6",
      "#84cc16",
      "#a855f7",
    ]);
  });

  it.each([
    ["食料品", "#0d9488"],
    ["光熱費", "#f59e0b"],
    ["カテゴリ4", "#3b82f6"],
    ["カテゴリ7", "#ef4444"],
    ["カテゴリ6", "#8b5cf6"],
    ["カテゴリ1", "#10b981"],
    ["カテゴリ26", "#ec4899"],
    ["カテゴリ3", "#6366f1"],
    ["カテゴリ2", "#f97316"],
    ["カテゴリ9", "#14b8a6"],
    ["カテゴリ8", "#84cc16"],
    ["娯楽", "#a855f7"],
  ])("maps %s to its compatible stable color", (category, color) => {
    expect(getCategoryColor(category)).toBe(color);
  });

  it("ignores surrounding whitespace", () => {
    expect(getCategoryColor("  食料品\n")).toBe(getCategoryColor("食料品"));
  });

  it.each([null, undefined, "", "   ", "未分類"])(
    "returns the neutral color for %j",
    (category) => {
      expect(getCategoryColor(category)).toBe(UNCATEGORIZED_CATEGORY_COLOR);
    },
  );
});
