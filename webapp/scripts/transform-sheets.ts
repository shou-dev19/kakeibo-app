// Pure transformation logic for the Google Sheets -> D1 migration.
//
// These functions take the raw CSV cell matrices (produced by the shared CSV
// tokenizer, `parseCsvRows`) exported from the current spreadsheet and turn them
// into row objects that map 1:1 onto the D1 tables. They contain NO filesystem,
// D1, or process dependencies so they can be unit-tested in isolation.
//
// Source files (input/, exported from the live spreadsheet):
//   - 取引履歴DB       -> transactions
//   - 証券残高DB       -> securities_balances
//   - 分類・除外設定    -> category_rules + excluded_categories (dual layout)
//   - 割り勘キーワード設定 -> split_rules
//   - CSVフォーマット設定 -> csv_formats

import { normalizeDate } from "../src/shared/dates";
import { parseAmount } from "../src/shared/csv";
import type { TransactionType } from "../src/shared/types";

// ---------------------------------------------------------------------------
// GAS-hardcoded special cases that must survive the migration.
// (Step-1 seed 0002_seed.sql carried these, but a full reload wipes the seed,
// so the migration script must re-inject them explicitly.)
// ---------------------------------------------------------------------------

/** イオンカード × 十日市場 → 食料品, highest priority. From Service_Categorizer.gs. */
export const AEON_TOOKAICHIBA_RULE = {
  keyword: "十日市場",
  institution: "イオンカード",
  category: "食料品",
  priority: 0,
} as const;

/** ﾖｺﾊﾏｼﾎｲｸﾘﾖｳ → 31% (保育料). From Service_SplitwiseCalculator.gs. */
export const HOIKURYO_SPLIT_RULE = {
  match_type: "keyword" as const,
  pattern: "ﾖｺﾊﾏｼﾎｲｸﾘﾖｳ",
  rate: 31,
} as const;

/** Base priority for rules coming from the settings sheet. Kept above the
 *  hardcoded special case (priority 0) so the special case always wins. */
export const RULE_PRIORITY_BASE = 100;

// ---------------------------------------------------------------------------
// Row shapes (mirror the D1 tables, minus the auto-increment id / created_at).
// ---------------------------------------------------------------------------

export interface TransactionRow {
  date: string;
  description: string;
  amount: number;
  type: TransactionType;
  institution: string | null;
  category: string | null;
  memo: string | null;
  balance: number | null;
}

export interface SecurityRow {
  date: string;
  brokerage: string;
  value: number;
}

export interface CategoryRuleRow {
  keyword: string;
  institution: string | null;
  category: string;
  priority: number;
}

export interface SplitRuleRow {
  match_type: "keyword" | "institution";
  pattern: string;
  rate: number;
}

export interface ExcludedCategoryRow {
  category: string;
  scope: "balance" | "annual";
}

export interface CsvFormatRow {
  name: string;
  date_col: number;
  desc_col: number;
  expense_col: number | null;
  income_col: number | null;
  balance_col: number | null;
  header_rows: number;
  encoding: string;
}

// ---------------------------------------------------------------------------
// Transformers. Each takes the full cell matrix INCLUDING the header row.
// ---------------------------------------------------------------------------

const cell = (row: string[], i: number): string => (row[i] ?? "").trim();
const emptyToNull = (s: string): string | null => (s === "" ? null : s);

/**
 * 取引履歴DB -> transactions.
 * Columns: 日付, 内容, 金額, 種別, 金融機関, カテゴリ, メモ, 残高.
 * Dates accept YYYY/M/D and are normalized to YYYY-MM-DD; rows with an
 * unparseable date are skipped. Empty memo/balance become NULL.
 */
export function transformTransactions(rows: string[][]): TransactionRow[] {
  const out: TransactionRow[] = [];
  for (const r of rows.slice(1)) {
    // Skip fully-blank trailing rows.
    if (r.every((c) => (c ?? "").trim() === "")) continue;

    const date = normalizeDate(cell(r, 0));
    if (!date) continue;

    const description = cell(r, 1);
    const amount = parseAmount(cell(r, 2));
    if (Number.isNaN(amount)) continue;

    const type = cell(r, 3) as TransactionType;
    const institution = emptyToNull(cell(r, 4));
    const category = emptyToNull(cell(r, 5));
    const memo = emptyToNull(cell(r, 6));

    const balanceRaw = cell(r, 7);
    const balance =
      balanceRaw === "" || Number.isNaN(parseAmount(balanceRaw))
        ? null
        : parseAmount(balanceRaw);

    out.push({ date, description, amount, type, institution, category, memo, balance });
  }
  return out;
}

/**
 * 証券残高DB -> securities_balances.
 * Columns: 日付, 証券会社名, 評価額.
 */
export function transformSecurities(rows: string[][]): SecurityRow[] {
  const out: SecurityRow[] = [];
  for (const r of rows.slice(1)) {
    if (r.every((c) => (c ?? "").trim() === "")) continue;
    const date = normalizeDate(cell(r, 0));
    const brokerage = cell(r, 1);
    const value = parseAmount(cell(r, 2));
    if (!date || brokerage === "" || Number.isNaN(value)) continue;
    out.push({ date, brokerage, value });
  }
  return out;
}

/**
 * 分類・除外設定 -> category_rules (A/B columns) + excluded_categories (E/F).
 * Dual layout (see CLAUDE.md):
 *   - Columns A(0)-B(1): keyword -> category rules. Row order matters; the first
 *     matching rule wins, so priority ascends with row index.
 *   - Column E(4): categories excluded from balance calc  -> scope 'balance'.
 *   - Column F(5): categories excluded from annual report -> scope 'annual'.
 * The header row (row 0) is skipped. Empty cells are skipped.
 */
export function transformSettings(rows: string[][]): {
  categoryRules: CategoryRuleRow[];
  excludedCategories: ExcludedCategoryRow[];
} {
  const categoryRules: CategoryRuleRow[] = [];
  const excludedCategories: ExcludedCategoryRow[] = [];

  const body = rows.slice(1);
  body.forEach((r, idx) => {
    const keyword = cell(r, 0);
    const category = cell(r, 1);
    if (keyword !== "" && category !== "") {
      categoryRules.push({
        keyword,
        institution: null,
        category,
        // Preserve sheet row order; base offset keeps these below the
        // hardcoded special case (priority 0).
        priority: RULE_PRIORITY_BASE + idx,
      });
    }

    const balanceExcl = cell(r, 4);
    if (balanceExcl !== "") {
      excludedCategories.push({ category: balanceExcl, scope: "balance" });
    }
    const annualExcl = cell(r, 5);
    if (annualExcl !== "") {
      excludedCategories.push({ category: annualExcl, scope: "annual" });
    }
  });

  return { categoryRules, excludedCategories };
}

/**
 * 割り勘キーワード設定 -> split_rules.
 * FOUR columns, parsed BY POSITION (header names have trailing spaces):
 *   col 0: 割り勘キーワード (50%)       -> keyword,     rate 50
 *   col 1: 全額請求キーワード (100%)     -> keyword,     rate 100
 *   col 2: 割り勘金融機関 (50%)          -> institution, rate 50
 *   col 3: 全額請求金融機関 (100%)       -> institution, rate 100
 * Empty cells are skipped. The header row (row 0) is skipped.
 */
export function transformSplitRules(rows: string[][]): SplitRuleRow[] {
  const out: SplitRuleRow[] = [];
  const columns: { col: number; match_type: "keyword" | "institution"; rate: number }[] = [
    { col: 0, match_type: "keyword", rate: 50 },
    { col: 1, match_type: "keyword", rate: 100 },
    { col: 2, match_type: "institution", rate: 50 },
    { col: 3, match_type: "institution", rate: 100 },
  ];
  for (const r of rows.slice(1)) {
    for (const { col, match_type, rate } of columns) {
      const pattern = cell(r, col);
      if (pattern !== "") out.push({ match_type, pattern, rate });
    }
  }
  return out;
}

/**
 * CSVフォーマット設定 -> csv_formats.
 * Columns (1-based semantics preserved): FormatName, DateColumn, DescriptionColumn,
 * ExpenseColumn, IncomeColumn, BalanceColumn, HeaderRows, Encoding.
 * Empty Income/Balance columns become NULL.
 */
export function transformCsvFormats(rows: string[][]): CsvFormatRow[] {
  const out: CsvFormatRow[] = [];
  const toInt = (s: string): number | null => {
    const t = s.trim();
    if (t === "") return null;
    const n = parseInt(t, 10);
    return Number.isNaN(n) ? null : n;
  };
  for (const r of rows.slice(1)) {
    const name = cell(r, 0);
    if (name === "") continue;
    const date_col = toInt(cell(r, 1));
    const desc_col = toInt(cell(r, 2));
    if (date_col == null || desc_col == null) continue;
    out.push({
      name,
      date_col,
      desc_col,
      expense_col: toInt(cell(r, 3)),
      income_col: toInt(cell(r, 4)),
      balance_col: toInt(cell(r, 5)),
      header_rows: toInt(cell(r, 6)) ?? 1,
      encoding: cell(r, 7) || "UTF-8",
    });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Special-case injection: prepend the two GAS-hardcoded rules so a full reload
// still contains them, and ensure they are not duplicated by sheet data.
// ---------------------------------------------------------------------------

export function withSpecialCategoryRule(rules: CategoryRuleRow[]): CategoryRuleRow[] {
  const special: CategoryRuleRow = { ...AEON_TOOKAICHIBA_RULE };
  const filtered = rules.filter(
    (r) =>
      !(
        r.keyword === special.keyword &&
        r.institution === special.institution &&
        r.category === special.category
      ),
  );
  return [special, ...filtered];
}

export function withSpecialSplitRule(rules: SplitRuleRow[]): SplitRuleRow[] {
  const special: SplitRuleRow = { ...HOIKURYO_SPLIT_RULE };
  const filtered = rules.filter(
    (r) =>
      !(
        r.match_type === special.match_type &&
        r.pattern === special.pattern &&
        r.rate === special.rate
      ),
  );
  return [special, ...filtered];
}

// ---------------------------------------------------------------------------
// SQL emission helpers.
// ---------------------------------------------------------------------------

/** Escape a value for inline SQL. NULL for null/undefined, quoted+escaped text
 *  otherwise (numbers may be passed as numbers). Doubles single quotes. */
export function sqlValue(v: string | number | null | undefined): string {
  if (v == null) return "NULL";
  if (typeof v === "number") {
    if (!Number.isFinite(v)) throw new Error(`non-finite number in SQL: ${v}`);
    return String(v);
  }
  return "'" + v.replace(/'/g, "''") + "'";
}
