// Shared type definitions mirroring the D1 schema (migrations/0001_initial.sql).

/** 種別 */
export type TransactionType = "収入" | "支出";

/**
 * 利用者。DB には固定キーを保存し、メールアドレスは保存しない。
 * メール → Owner の対応は Worker Secret `OWNER_EMAILS` が持つ。
 */
export type Owner = "husband" | "wife";

/** 全 Owner。UI のタブ順もこの順に従う。 */
export const OWNERS = ["husband", "wife"] as const;

/** 画面表示用の利用者名。 */
export const OWNER_LABELS: Record<Owner, string> = {
  husband: "夫",
  wife: "妻",
};

/** 読み取りスコープ。'all' は夫婦合算。 */
export type OwnerScope = Owner | "all";

export function isOwner(value: unknown): value is Owner {
  return value === "husband" || value === "wife";
}

export function isOwnerScope(value: unknown): value is OwnerScope {
  return value === "all" || isOwner(value);
}

/** 除外スコープ */
export type ExclusionScope = "balance" | "annual";

/** 割り勘ルールのマッチ種別 */
export type SplitMatchType = "keyword" | "institution";

/** 取引 (transactions) */
export interface Transaction {
  id: number;
  owner: Owner;
  date: string; // YYYY-MM-DD
  description: string;
  amount: number; // 円
  type: TransactionType;
  institution: string | null;
  category: string | null;
  category_locked: number; // 0: 自動分類 / 1: 手動固定
  memo: string | null;
  balance: number | null; // 円
  import_hash: string;
  created_at: string;
}

/** 証券残高 (securities_balances) */
export interface SecuritiesBalance {
  id: number;
  owner: Owner;
  date: string; // YYYY-MM-DD
  brokerage: string;
  value: number; // 円
}

/** カテゴリ分類ルール (category_rules). 利用者ごとに独立している。 */
export interface CategoryRule {
  id: number;
  owner: Owner;
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
  encodings: string[];
  header_signature: string | null;
  expected_columns: number | null;
}

/**
 * 割り勘ルール (split_rules). 夫婦共用 — 世帯の合意そのものなので1組しか存在しない。
 * `rate` は「妻の負担率 (%)」で、支払者が誰かによらず解釈は変わらない。
 */
export interface SplitRule {
  id: number;
  match_type: SplitMatchType;
  pattern: string;
  rate: number; // 妻の負担率 (%)
  priority: number;
}

/** 除外カテゴリ (excluded_categories). 夫婦共用の集計方針。 */
export interface ExcludedCategory {
  id: number;
  category: string;
  scope: ExclusionScope;
}

/** 全件再分類の実行履歴 (recategorize_runs) */
export interface RecategorizeRun {
  id: number;
  owner: Owner;
  executed_at: string;
  updated_count: number;
  /** 取り消し済みなら日時、未取り消しなら null。 */
  reverted_at: string | null;
}

/** 全件再分類による1件分の変更 (recategorize_changes) */
export interface RecategorizeChange {
  id: number;
  run_id: number;
  transaction_id: number;
  previous_category: string | null;
  new_category: string;
}

/** GET /api/health のレスポンス */
export interface HealthResponse {
  status: "ok";
  tables: number;
}

/** GET /api/me のレスポンス */
export interface MeResponse {
  owner: Owner;
  label: string;
}

/** 全テーブル名 (D1 と型定義の整合チェックに利用) */
export const TABLE_NAMES = [
  "transactions",
  "securities_balances",
  "category_rules",
  "csv_formats",
  "split_rules",
  "excluded_categories",
  "recategorize_runs",
  "recategorize_changes",
] as const;

/** 0001_initial.sql が作るテーブル (それ以降のマイグレーションで追加された分を除く)。 */
export const INITIAL_TABLE_NAMES = [
  "transactions",
  "securities_balances",
  "category_rules",
  "csv_formats",
  "split_rules",
  "excluded_categories",
] as const;
