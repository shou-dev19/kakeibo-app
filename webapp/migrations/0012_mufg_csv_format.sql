-- 三菱UFJ銀行のCSVフォーマットを追加する。
--
-- 三菱UFJのCSVは摘要が2列に分かれている（例: 摘要「口座振替４」＋摘要内容
-- 「ラクテンカ−ドサ−ビ」）。摘要だけでは引落先を区別できず、摘要内容だけでは
-- ATM出金など空欄の行が出るため、任意の第2内容列 desc_col2 を追加して両方を
-- 連結できるようにする。既存フォーマットは NULL のまま = 従来どおり1列。

ALTER TABLE csv_formats ADD COLUMN desc_col2 INTEGER;

-- 列構成 (1-based):
--   1 日付 / 2 摘要 / 3 摘要内容 / 4 支払い金額 / 5 預かり金額 / 6 差引残高
--   7 メモ / 8 未資金化区分 / 9 入払区分
INSERT INTO csv_formats (
  name, date_col, desc_col, desc_col2, expense_col, income_col, balance_col,
  header_rows, encoding, encodings, header_signature, expected_columns
) VALUES (
  '三菱UFJ', 1, 2, 3, 4, 5, 6,
  1, 'Shift_JIS', '["Shift_JIS","UTF-8"]',
  '"日付","摘要","摘要内容","支払い金額","預かり金額","差引残高","メモ","未資金化区分","入払区分"',
  9
);
