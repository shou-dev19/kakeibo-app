-- 0008_securities_owner.sql
-- 証券残高に利用者を持たせる。owner がないと「夫のみの総資産」も
-- 「夫婦合算の総資産」も正しく算出できない。既存行はすべて夫のものとして移行する。

ALTER TABLE securities_balances ADD COLUMN owner TEXT NOT NULL DEFAULT 'husband';

CREATE INDEX idx_securities_balances_owner_date ON securities_balances (owner, date);
