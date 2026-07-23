// Shared type definitions mirroring the D1 schema (migrations/0001_initial.sql).

/** 種別 */
export type TransactionType = "収入" | "支出";

/** 除外スコープ */
export type ExclusionScope = "balance" | "annual";

/** 割り勘ルールのマッチ種別 */
export type SplitMatchType = "keyword" | "institution";

/** 取引 (transactions) */
export interface Transaction {
  id: number;
  date: string; // YYYY-MM-DD
  description: string;
  amount: number; // 円
  type: TransactionType;
  institution: string | null;
  category: string | null;
  memo: string | null;
  balance: number | null; // 円
  import_hash: string;
  created_at: string;
}

/** 証券残高 (securities_balances) */
export interface SecuritiesBalance {
  id: number;
  date: string; // YYYY-MM-DD
  brokerage: string;
  value: number; // 円
}

/** カテゴリ分類ルール (category_rules) */
export interface CategoryRule {
  id: number;
  keyword: string;
  institution: string | null;
  category: string;
  priority: number;
}

/** CSVフォーマット定義 (csv_formats). 列番号は 1-based。 */
export interface CsvFormat {
  id: number;
  name: string;
  date_col: number;
  desc_col: number;
  expense_col: number | null;
  income_col: number | null;
  balance_col: number | null;
  header_rows: number;
  encoding: string;
  header_signature: string | null;
  expected_columns: number | null;
}

/** 割り勘ルール (split_rules) */
export interface SplitRule {
  id: number;
  match_type: SplitMatchType;
  pattern: string;
  rate: number; // 負担率 (%)
  priority: number;
}

/** 除外カテゴリ (excluded_categories) */
export interface ExcludedCategory {
  id: number;
  category: string;
  scope: ExclusionScope;
}

/** GET /api/health のレスポンス */
export interface HealthResponse {
  status: "ok";
  tables: number;
}

/** 全テーブル名 (D1 と型定義の整合チェックに利用) */
export const TABLE_NAMES = [
  "transactions",
  "securities_balances",
  "category_rules",
  "csv_formats",
  "split_rules",
  "excluded_categories",
] as const;
