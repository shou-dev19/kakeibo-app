-- 0002_seed.sql
-- Seed the default rules that were hard-coded in the GAS version.

-- category_rules
-- Special case from Service_Categorizer.gs: イオンカード × 十日市場 → 食料品 (highest priority).
INSERT INTO category_rules (keyword, institution, category, priority) VALUES
  ('十日市場', 'イオンカード', '食料品', 0),
  ('楽天',   NULL, '固定費', 100),
  ('Amazon', NULL, '変動費', 100);

-- split_rules
-- Special case from Service_SplitwiseCalculator.gs: ﾖｺﾊﾏｼﾎｲｸﾘﾖｳ → 31% (保育料).
-- Default 50% split and 100% full-charge examples from initializeSheets.
INSERT INTO split_rules (match_type, pattern, rate) VALUES
  ('keyword',     'ﾖｺﾊﾏｼﾎｲｸﾘﾖｳ', 31),
  ('keyword',     '割り勘',        50),
  ('keyword',     '立替',          50),
  ('keyword',     'ワリカン',       50),
  ('institution', 'イオンカード',   100);

-- excluded_categories
-- From Main.gs initializeSheets: 投資 excluded from balance, 振替 excluded from annual report.
-- 振替 is always excluded from balance in app logic, but is also seeded here for clarity.
INSERT INTO excluded_categories (category, scope) VALUES
  ('投資', 'balance'),
  ('振替', 'annual');

-- csv_formats
-- From Main.gs initializeSheets initial format (三井住友カード).
INSERT INTO csv_formats (name, date_col, desc_col, expense_col, income_col, balance_col, header_rows, encoding) VALUES
  ('三井住友カード', 1, 2, 3, NULL, NULL, 1, 'Shift_JIS');
