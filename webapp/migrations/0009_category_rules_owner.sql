-- 0009_category_rules_owner.sql
-- 分類ルールを利用者ごとに分離する。既存ルールはすべて夫のものとし、
-- 妻の初期ルールはその複製として作る (0 件から始めると初回取込がほぼ全件
-- 「未分類」になり実用に耐えないため)。複製後は互いに完全に独立する。

ALTER TABLE category_rules ADD COLUMN owner TEXT NOT NULL DEFAULT 'husband';

INSERT INTO category_rules (owner, keyword, institution, category, priority)
SELECT 'wife', keyword, institution, category, priority
FROM category_rules
WHERE owner = 'husband';

CREATE INDEX idx_category_rules_owner_priority ON category_rules (owner, priority);
