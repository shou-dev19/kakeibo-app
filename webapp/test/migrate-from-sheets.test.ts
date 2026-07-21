import { describe, it, expect } from "vitest";
import { parseCsvRows } from "../src/shared/csv";
import {
  transformTransactions,
  transformSecurities,
  transformSettings,
  transformSplitRules,
  transformCsvFormats,
  withSpecialCategoryRule,
  withSpecialSplitRule,
  sqlValue,
  RULE_PRIORITY_BASE,
  AEON_TOOKAICHIBA_RULE,
  HOIKURYO_SPLIT_RULE,
} from "../scripts/transform-sheets";

// The migration transforms operate on the raw cell matrices produced by the
// shared CSV tokenizer. Tests here cover the tricky conversion rules:
//   - dual-layout settings sheet (rules in A/B, exclusions in E/F)
//   - split-rule column-position parsing
//   - priority numbering
//   - re-injection of the two GAS-hardcoded special cases
//   - SQL escaping

describe("transformTransactions", () => {
  it("normalizes YYYY/M/D dates and maps NULLs for empty memo/balance", () => {
    const rows = parseCsvRows(
      [
        "日付,内容,金額,種別,金融機関,カテゴリ,メモ,残高",
        "2024/11/11,ダイエー,486,支出,イオンカード,食料品,,",
        "2025/7/3,給与,300000,収入,SBI,収入,ボーナス,1200000",
      ].join("\n"),
    );
    const out = transformTransactions(rows);
    expect(out).toHaveLength(2);
    expect(out[0]).toEqual({
      date: "2024-11-11",
      description: "ダイエー",
      amount: 486,
      type: "支出",
      institution: "イオンカード",
      category: "食料品",
      memo: null,
      balance: null,
    });
    expect(out[1].date).toBe("2025-07-03");
    expect(out[1].memo).toBe("ボーナス");
    expect(out[1].balance).toBe(1200000);
  });

  it("skips rows with an unparseable date and blank rows", () => {
    const rows = parseCsvRows(
      [
        "日付,内容,金額,種別,金融機関,カテゴリ,メモ,残高",
        "not-a-date,x,100,支出,A,B,,",
        ",,,,,,,",
        "2025/01/02,ok,100,支出,A,B,,",
      ].join("\n"),
    );
    const out = transformTransactions(rows);
    expect(out).toHaveLength(1);
    expect(out[0].description).toBe("ok");
  });

  it("strips thousands separators and yen signs from amounts", () => {
    const rows = parseCsvRows(
      ["日付,内容,金額,種別,金融機関,カテゴリ,メモ,残高", '2025/01/02,x,"1,234",支出,A,B,,'].join("\n"),
    );
    expect(transformTransactions(rows)[0].amount).toBe(1234);
  });
});

describe("transformSecurities", () => {
  it("maps 日付/証券会社名/評価額 and skips incomplete rows", () => {
    const rows = parseCsvRows(
      ["日付,証券会社名,評価額", "2025/10/21,SBI証券,3914477", "2025/10/21,,100"].join("\n"),
    );
    const out = transformSecurities(rows);
    expect(out).toEqual([{ date: "2025-10-21", brokerage: "SBI証券", value: 3914477 }]);
  });
});

describe("transformSettings (dual layout)", () => {
  const rows = parseCsvRows(
    [
      "キーワード,カテゴリ,,,収支から除外するカテゴリ,年間レポートから除外するカテゴリ",
      "給与,収入,,,投資,振替",
      "振込,収入,,,,投資",
      "利息,収入,,,,",
    ].join("\n"),
  );

  it("extracts A/B keyword->category rules in row order with ascending priority", () => {
    const { categoryRules } = transformSettings(rows);
    expect(categoryRules).toEqual([
      { keyword: "給与", institution: null, category: "収入", priority: RULE_PRIORITY_BASE + 0 },
      { keyword: "振込", institution: null, category: "収入", priority: RULE_PRIORITY_BASE + 1 },
      { keyword: "利息", institution: null, category: "収入", priority: RULE_PRIORITY_BASE + 2 },
    ]);
  });

  it("extracts E->balance and F->annual exclusions, skipping empty cells", () => {
    const { excludedCategories } = transformSettings(rows);
    expect(excludedCategories).toEqual([
      { category: "投資", scope: "balance" },
      { category: "振替", scope: "annual" },
      { category: "投資", scope: "annual" },
    ]);
  });

  it("skips rows missing keyword or category for the rule side", () => {
    const partial = parseCsvRows(
      ["キーワード,カテゴリ,,,E,F", "onlykw,,,,X,", ",onlycat,,,,Y"].join("\n"),
    );
    const { categoryRules, excludedCategories } = transformSettings(partial);
    expect(categoryRules).toHaveLength(0);
    expect(excludedCategories).toEqual([
      { category: "X", scope: "balance" },
      { category: "Y", scope: "annual" },
    ]);
  });
});

describe("transformSplitRules (parse by column position)", () => {
  it("maps the 4 columns to keyword/institution x 50/100, skipping blanks", () => {
    // Header names intentionally carry trailing spaces (as in the real export).
    const rows = parseCsvRows(
      [
        "割り勘キーワード (50%),全額請求キーワード (100%),割り勘金融機関 (50%) ,全額請求金融機関 (100%) ",
        "映画,ダイエー,,イオンカード",
        "カフェ,,,",
      ].join("\n"),
    );
    const out = transformSplitRules(rows);
    expect(out).toEqual([
      { match_type: "keyword", pattern: "映画", rate: 50 },
      { match_type: "keyword", pattern: "ダイエー", rate: 100 },
      { match_type: "institution", pattern: "イオンカード", rate: 100 },
      { match_type: "keyword", pattern: "カフェ", rate: 50 },
    ]);
  });
});

describe("transformCsvFormats", () => {
  it("maps 8 columns and nulls out empty Income/Balance columns", () => {
    const rows = parseCsvRows(
      [
        "FormatName,DateColumn,DescriptionColumn,ExpenseColumn,IncomeColumn,BalanceColumn,HeaderRows,Encoding",
        "SBI新生銀行,1,2,3,4,5,1,UTF-8",
        "三井住友カード,1,2,3,,,1,Shift_JIS",
      ].join("\n"),
    );
    const out = transformCsvFormats(rows);
    expect(out[0]).toEqual({
      name: "SBI新生銀行",
      date_col: 1,
      desc_col: 2,
      expense_col: 3,
      income_col: 4,
      balance_col: 5,
      header_rows: 1,
      encoding: "UTF-8",
      header_signature: `"取引日","摘要","出金金額","入金金額","残高","メモ"`,
      expected_columns: 6,
    });
    expect(out[1].income_col).toBeNull();
    expect(out[1].balance_col).toBeNull();
    expect(out[1].encoding).toBe("Shift_JIS");
  });
});

describe("special-case re-injection", () => {
  it("prepends the イオンカード×十日市場 rule (priority 0)", () => {
    const rules = withSpecialCategoryRule([
      { keyword: "楽天", institution: null, category: "固定費", priority: 100 },
    ]);
    expect(rules[0]).toEqual(AEON_TOOKAICHIBA_RULE);
    expect(rules).toHaveLength(2);
  });

  it("does not duplicate the special category rule if already present", () => {
    const rules = withSpecialCategoryRule([{ ...AEON_TOOKAICHIBA_RULE }]);
    expect(rules).toHaveLength(1);
    expect(rules[0]).toEqual(AEON_TOOKAICHIBA_RULE);
  });

  it("prepends the ﾖｺﾊﾏｼﾎｲｸﾘﾖｳ 31% split rule", () => {
    const rules = withSpecialSplitRule([
      { match_type: "keyword", pattern: "映画", rate: 50 },
    ]);
    expect(rules[0]).toEqual(HOIKURYO_SPLIT_RULE);
    expect(rules).toHaveLength(2);
  });

  it("does not duplicate the special split rule if already present", () => {
    const rules = withSpecialSplitRule([{ ...HOIKURYO_SPLIT_RULE }]);
    expect(rules).toHaveLength(1);
  });
});

describe("sqlValue escaping", () => {
  it("quotes and doubles single quotes; handles yen signs literally", () => {
    expect(sqlValue("O'Brien")).toBe("'O''Brien'");
    expect(sqlValue("￥1,000")).toBe("'￥1,000'");
  });
  it("emits NULL for null/undefined and bare numbers for numbers", () => {
    expect(sqlValue(null)).toBe("NULL");
    expect(sqlValue(undefined)).toBe("NULL");
    expect(sqlValue(1234)).toBe("1234");
  });
  it("throws on non-finite numbers", () => {
    expect(() => sqlValue(NaN)).toThrow();
  });
});
