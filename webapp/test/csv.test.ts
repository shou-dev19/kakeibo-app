import { describe, it, expect } from "vitest";
import { parseAmount, parseCsv, parseCsvRows } from "../src/shared/csv";
import type { CsvFormat } from "../src/shared/types";

function fmt(overrides: Partial<CsvFormat> = {}): CsvFormat {
  return {
    id: 1,
    name: "テスト銀行",
    date_col: 1,
    desc_col: 2,
    desc_col2: null,
    expense_col: 3,
    income_col: 4,
    balance_col: 5,
    header_rows: 1,
    encodings: ["UTF-8"],
    header_signature: null,
    expected_columns: null,
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

  // Rule 5: マイナス金額は符号反転して逆の種別へ。
  it("treats a negative expense as income (キャッシュバック・返金)", () => {
    const csv = ["h", "2025/07/01,ＭｙＪＣＢ　Ｐａｙポイント利用（キャッシュバック）,-1648,,0"].join("\n");
    const out = parseCsv(csv, fmt());
    expect(out[0]).toMatchObject({ amount: 1648, type: "収入" });
  });

  it("treats a negative income as expense", () => {
    const csv = ["h", "2025/07/01,取消,,-500,0"].join("\n");
    const out = parseCsv(csv, fmt());
    expect(out[0]).toMatchObject({ amount: 500, type: "支出" });
  });

  it("keeps a negative balance as-is", () => {
    const csv = ["h", "2025/07/01,x,100,,-2000"].join("\n");
    const out = parseCsv(csv, fmt());
    expect(out[0]).toMatchObject({ amount: 100, type: "支出", balance: -2000 });
  });

  it("respects header_rows", () => {
    const csv = ["meta", "日付,内容,支出", "2025/07/01,x,100"].join("\n");
    const out = parseCsv(csv, fmt({ header_rows: 2, income_col: null, balance_col: null }));
    expect(out).toHaveLength(1);
  });
});

// 摘要が2列に分かれるCSV（三菱UFJ）向けの内容連結。
describe("desc_col2 (内容列の連結)", () => {
  const mufg = fmt({
    name: "三菱UFJ",
    desc_col: 2,
    desc_col2: 3,
    expense_col: 4,
    income_col: 5,
    balance_col: 6,
  });

  it("joins both description columns with a single space", () => {
    const csv = [
      "h",
      '"2025/7/10","ＪＣＢ","ＪＣＢカ－ド","129,365","","461,036","","","振替支払い"',
    ].join("\n");
    expect(parseCsv(csv, mufg)[0]).toMatchObject({
      description: "ＪＣＢ ＪＣＢカ－ド",
      amount: 129365,
      type: "支出",
      institution: "三菱UFJ",
      balance: 461036,
    });
  });

  it("falls back to the populated column when 摘要内容 is empty (ATM出金など)", () => {
    const csv = [
      "h",
      '"2025/9/25","カ－ド","","10,000","","344,059","","","支払い"',
    ].join("\n");
    expect(parseCsv(csv, mufg)[0].description).toBe("カ－ド");
  });

  it("keeps 預かり金額 rows as 収入", () => {
    const csv = [
      "h",
      '"2025/7/25","振込１","ヤマダ　タロウ","","500,000","961,036","","","振替入金"',
    ].join("\n");
    expect(parseCsv(csv, mufg)[0]).toMatchObject({
      description: "振込１ ヤマダ　タロウ",
      amount: 500000,
      type: "収入",
    });
  });

  it("leaves single-column formats unchanged", () => {
    const csv = ["h", "2025/07/01,コンビニ,100,,0"].join("\n");
    expect(parseCsv(csv, fmt())[0].description).toBe("コンビニ");
  });
});
