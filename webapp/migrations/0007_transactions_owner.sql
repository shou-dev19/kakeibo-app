-- 0007_transactions_owner.sql
-- 明細に利用者 (owner) を持たせ、重複判定を利用者ごとに分離する。
--
-- import_hash の計算式 (src/shared/hash.ts) は意図的に変更しない。owner を
-- ハッシュ入力に加えると既存行のハッシュ値が変わり、過去にアップロード済みの
-- CSV を再アップロードしたときの重複検知が効かなくなるため。owner による分離は
-- ハッシュではなく UNIQUE(owner, import_hash) 側で行う。
--   - 同じ人が同じ CSV を再取込  -> owner も hash も同じ -> 従来どおりスキップ
--   - 夫婦が同内容の明細を別々に持つ -> owner が違う      -> 両方保存される
--
-- SQLite は列に付いた UNIQUE 制約を後から外せないため、テーブルを作り直す。
-- 既存行はすべて 'husband' として移行する (これまで夫のみが取り込んでいるため)。

CREATE TABLE transactions_new (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  owner           TEXT    NOT NULL CHECK (owner IN ('husband', 'wife')),
  date            TEXT    NOT NULL,          -- ISO date (YYYY-MM-DD)
  description     TEXT    NOT NULL,          -- 内容
  amount          INTEGER NOT NULL,          -- 金額 (円)
  type            TEXT    NOT NULL,          -- 種別: '収入' | '支出'
  institution     TEXT,                      -- 金融機関
  category        TEXT,                      -- カテゴリ
  category_locked INTEGER NOT NULL DEFAULT 0 CHECK (category_locked IN (0, 1)),
  memo            TEXT,                      -- メモ
  balance         INTEGER,                   -- 残高 (円, nullable)
  import_hash     TEXT    NOT NULL,          -- 重複取込防止 (計算式は 0001 から不変)
  created_at      TEXT    NOT NULL DEFAULT (datetime('now')),
  UNIQUE (owner, import_hash)
);

INSERT INTO transactions_new
  (id, owner, date, description, amount, type, institution, category,
   category_locked, memo, balance, import_hash, created_at)
SELECT
  id, 'husband', date, description, amount, type, institution, category,
  category_locked, memo, balance, import_hash, created_at
FROM transactions;

DROP TABLE transactions;

ALTER TABLE transactions_new RENAME TO transactions;

CREATE INDEX idx_transactions_date ON transactions (date);
CREATE INDEX idx_transactions_category ON transactions (category);
CREATE INDEX idx_transactions_owner_date ON transactions (owner, date);
