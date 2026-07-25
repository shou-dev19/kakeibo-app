-- 手動でカテゴリを固定した明細を、全件再分類から保護する。
ALTER TABLE transactions ADD COLUMN category_locked INTEGER NOT NULL DEFAULT 0
  CHECK (category_locked IN (0, 1));
