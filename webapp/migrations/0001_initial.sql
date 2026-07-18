-- 0001_initial.sql
-- Initial schema for the kakeibo (household finance) web app.
-- Amounts and balances are stored as INTEGER (Japanese yen).

-- 取引履歴 (transactions)
CREATE TABLE transactions (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  date         TEXT    NOT NULL,          -- ISO date (YYYY-MM-DD)
  description  TEXT    NOT NULL,          -- 内容
  amount       INTEGER NOT NULL,          -- 金額 (円)
  type         TEXT    NOT NULL,          -- 種別: '収入' | '支出'
  institution  TEXT,                      -- 金融機関
  category     TEXT,                      -- カテゴリ
  memo         TEXT,                      -- メモ
  balance      INTEGER,                   -- 残高 (円, nullable)
  import_hash  TEXT    NOT NULL UNIQUE,   -- 重複取込防止: 日付+内容+金額+種別+金融機関のハッシュ
  created_at   TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_transactions_date ON transactions (date);
CREATE INDEX idx_transactions_category ON transactions (category);

-- 証券残高 (securities_balances) — 手入力の各証券会社の評価額
CREATE TABLE securities_balances (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  date       TEXT    NOT NULL,   -- ISO date (YYYY-MM-DD)
  brokerage  TEXT    NOT NULL,   -- 証券会社名
  value      INTEGER NOT NULL    -- 評価額 (円)
);

CREATE INDEX idx_securities_balances_date ON securities_balances (date);

-- カテゴリ分類ルール (category_rules)
-- 金融機関 + キーワードの複合条件。institution が NULL の場合は金融機関を問わない。
-- priority が小さいほど優先。
CREATE TABLE category_rules (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  keyword      TEXT    NOT NULL,
  institution  TEXT,
  category     TEXT    NOT NULL,
  priority     INTEGER NOT NULL DEFAULT 100
);

CREATE INDEX idx_category_rules_priority ON category_rules (priority);

-- CSVフォーマット定義 (csv_formats). 列番号は 1-based。
CREATE TABLE csv_formats (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  name         TEXT    NOT NULL UNIQUE,   -- FormatName (= 金融機関名)
  date_col     INTEGER NOT NULL,
  desc_col     INTEGER NOT NULL,
  expense_col  INTEGER,
  income_col   INTEGER,
  balance_col  INTEGER,
  header_rows  INTEGER NOT NULL DEFAULT 1,
  encoding     TEXT    NOT NULL DEFAULT 'UTF-8'
);

-- 割り勘ルール (split_rules)
-- match_type: 'keyword' | 'institution'
-- rate: 負担率 (%). 50 / 31 / 100 など。
CREATE TABLE split_rules (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  match_type  TEXT    NOT NULL CHECK (match_type IN ('keyword', 'institution')),
  pattern     TEXT    NOT NULL,
  rate        INTEGER NOT NULL
);

-- 除外カテゴリ (excluded_categories)
-- scope: 'balance' (収支計算から除外) | 'annual' (年間レポートから除外)
CREATE TABLE excluded_categories (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  category  TEXT    NOT NULL,
  scope     TEXT    NOT NULL CHECK (scope IN ('balance', 'annual')),
  UNIQUE (category, scope)
);
