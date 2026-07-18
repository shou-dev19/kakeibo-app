import { describe, it, expect } from "vitest";
import { parseAmount, parseCsv, parseCsvRows } from "../src/shared/csv";
import type { CsvFormat } from "../src/shared/types";

function fmt(overrides: Partial<CsvFormat> = {}): CsvFormat {
  return {
    id: 1,
    name: "テスト銀行",
    date_col: 1,
    desc_col: 2,
    expense_col: 3,
    income_col: 4,
    balance_col: 5,
    header_rows: 1,
    encoding: "UTF-8",
    ...overrides,
  };
}

// Rule 2 (parseAmount): strip commas and full-width yen, parseInt-style.
describe("parseAmount", () => {
  it("strips thousands commas", () => {
    expect(parseAmount("1,234")).toBe(1234);
  });
  it("strips the full-width yen sign U+FFE5", () => {
    expect(parseAmount("￥1,000")).toBe(1000);
  });
  it("returns NaN for empty / non-numeric", () => {
    expect(Number.isNaN(parseAmount(""))).toBe(true);
    expect(Number.isNaN(parseAmount("abc"))).toBe(true);
    expect(Number.isNaN(parseAmount(undefined))).toBe(true);
  });
  it("handles negatives", () => {
    expect(parseAmount("-500")).toBe(-500);
  });
});

describe("parseCsvRows", () => {
  it("handles quoted fields with commas and escaped quotes", () => {
    const rows = parseCsvRows('a,"b,c","d""e"\n1,2,3\n');
    expect(rows).toEqual([
      ["a", "b,c", 'd"e'],
      ["1", "2", "3"],
    ]);
  });

  it("handles CRLF and lone CR line endings", () => {
    expect(parseCsvRows("a,b\r\nc,d\re,f")).toEqual([
      ["a", "b"],
      ["c", "d"],
      ["e", "f"],
    ]);
  });
});

// Rule 2 (parseCsv): income first; else expense; comma/yen stripping; balance
// optional; invalid date OR no valid amount => skip.
describe("parseCsv", () => {
  it("classifies income when the income column has a non-zero value", () => {
    const csv = ["日付,内容,支出,収入,残高", "2025/07/01,給与,,300000,500000"].join("\n");
    const out = parseCsv(csv, fmt());
    expect(out).toEqual([
      {
        date: "2025-07-01",
        description: "給与",
        amount: 300000,
        type: "収入",
        institution: "テスト銀行",
        balance: 500000,
      },
    ]);
  });

  it("classifies expense when income is empty and expense has a value", () => {
    const csv = ["日付,内容,支出,収入,残高", "250701,コンビニ,\"1,500\",,10000"].join("\n");
    const out = parseCsv(csv, fmt());
    expect(out[0]).toMatchObject({ amount: 1500, type: "支出", date: "2025-07-01" });
  });

  it("prefers income when both columns have values (income checked first)", () => {
    const csv = ["h", "2025/07/01,両方,999,222,0"].join("\n");
    const out = parseCsv(csv, fmt());
    expect(out[0]).toMatchObject({ amount: 222, type: "収入" });
  });

  it("treats a 0 income as not-income and falls through to expense", () => {
    const csv = ["h", "2025/07/01,ゼロ収入,800,0,0"].join("\n");
    const out = parseCsv(csv, fmt());
    expect(out[0]).toMatchObject({ amount: 800, type: "支出" });
  });

  it("skips rows with an invalid date", () => {
    const csv = ["h", "not-a-date,x,100,,0", "2025/07/02,ok,200,,0"].join("\n");
    const out = parseCsv(csv, fmt());
    expect(out).toHaveLength(1);
    expect(out[0].description).toBe("ok");
  });

  it("skips rows where neither income nor expense is valid/non-zero", () => {
    const csv = ["h", "2025/07/01,空,,,0", "2025/07/02,ゼロ,0,0,0"].join("\n");
    expect(parseCsv(csv, fmt())).toHaveLength(0);
  });

  it("leaves balance null when the balance column is absent", () => {
    const csv = ["h", "2025/07/01,x,100,,"].join("\n");
    const out = parseCsv(csv, fmt({ balance_col: null }));
    expect(out[0].balance).toBeNull();
  });

  it("respects header_rows", () => {
    const csv = ["meta", "日付,内容,支出", "2025/07/01,x,100"].join("\n");
    const out = parseCsv(csv, fmt({ header_rows: 2, income_col: null, balance_col: null }));
    expect(out).toHaveLength(1);
  });
});
