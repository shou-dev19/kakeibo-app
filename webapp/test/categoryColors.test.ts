import { describe, expect, it } from "vitest";
import {
  getCategoryColor,
  UNCATEGORIZED_CATEGORY_COLOR,
} from "../src/client/lib/categoryColors";

describe("getCategoryColor", () => {
  it("maps categories to their specified stable palette colors", () => {
    expect(getCategoryColor("食料品")).toBe("#0d9488");
    expect(getCategoryColor("光熱費")).toBe("#f59e0b");
  });

  it("always returns the same color for the same category", () => {
    expect(getCategoryColor("娯楽")).toBe(getCategoryColor("娯楽"));
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
