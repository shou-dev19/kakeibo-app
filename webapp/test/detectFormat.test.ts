import { describe, expect, it } from "vitest";
import {
  detectFormat,
  evaluateFormat,
  normalizeHeaderCell,
} from "../src/shared/detectFormat";
import type { CsvFormat } from "../src/shared/types";

function format(overrides: Partial<CsvFormat> = {}): CsvFormat {
  return {
    id: 1,
    name: "形式A",
    date_col: 1,
    desc_col: 2,
    expense_col: 3,
    income_col: null,
    balance_col: null,
    header_rows: 1,
    encoding: "UTF-8",
    header_signature: "日付,内容,金額",
    expected_columns: 3,
    ...overrides,
  };
}

const csv = [
  "日付,内容,金額",
  "2026/07/01,架空店舗A,500",
  "2026/07/02,架空店舗B,1200",
].join("\n");

describe("detectFormat", () => {
  it("selects the only eligible matching header signature", () => {
    const other = format({
      id: 2,
      name: "形式B",
      header_signature: "取引日,摘要,支出額",
    });
    const result = detectFormat(csv, [other, format()]);
    expect(result.confident).toBe(true);
    expect(result.best?.name).toBe("形式A");
  });

  it("searches all skipped prefix rows for the identifying header", () => {
    const withPreamble = format({ header_rows: 2 });
    const text = ["日付,内容,金額", "個別情報", "2026/07/01,架空店舗,500"].join("\n");
    expect(detectFormat(text, [withPreamble]).best?.name).toBe("形式A");
  });

  it("supports a wildcard only for explicitly variable header cells", () => {
    const monthly = format({ header_signature: "日付,*,金額" });
    expect(detectFormat(csv, [monthly]).best?.name).toBe("形式A");
  });

  it("rejects changed column counts even when date and amount parse", () => {
    const changed = ["日付,内容,金額,追加列", "2026/07/01,架空店舗,500,x"].join("\n");
    const result = detectFormat(changed, [format()]);
    expect(result.confident).toBe(false);
    expect(result.candidates[0].reasons).toContain("header_mismatch");
  });

  it("reports ambiguity instead of force-ranking duplicate signatures", () => {
    const duplicate = format({ id: 2, name: "形式B" });
    const result = detectFormat(csv, [format(), duplicate]);
    expect(result.best).toBeNull();
    expect(result.failureReason).toBe("ambiguous");
  });

  it("selects a unique headerless format by expected column count", () => {
    const sevenColumns = format({
      header_rows: 0,
      header_signature: null,
      expected_columns: 7,
    });
    const thirteenColumns = format({
      id: 2,
      name: "形式B",
      header_rows: 0,
      header_signature: null,
      expected_columns: 13,
      expense_col: 7,
    });
    const text = "2026/07/01,架空店舗,500,x,x,x,x";
    expect(detectFormat(text, [sevenColumns, thirteenColumns]).best?.name).toBe("形式A");
  });

  it("excludes formats whose detection settings are incomplete", () => {
    const candidate = evaluateFormat(csv, format({ expected_columns: null }));
    expect(candidate.eligible).toBe(false);
    expect(candidate.reasons).toContain("settings_missing");
  });

  it("returns no match for unknown content or an empty format list", () => {
    expect(detectFormat("x,y,z\np,q,r", [format()]).best).toBeNull();
    expect(detectFormat(csv, []).failureReason).toBe("no_match");
  });
});

describe("normalizeHeaderCell", () => {
  it("removes BOM, normalizes width, trims and collapses whitespace", () => {
    expect(normalizeHeaderCell("\uFEFF  金額（ 円 ）  ")).toBe("金額( 円 )");
  });
});
