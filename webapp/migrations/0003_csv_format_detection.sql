-- Add deterministic CSV format detection metadata.
-- Header signatures contain column labels only; no transaction data.

ALTER TABLE csv_formats ADD COLUMN header_signature TEXT;
ALTER TABLE csv_formats ADD COLUMN expected_columns INTEGER;

UPDATE csv_formats SET
  header_signature = '"取引日","摘要","出金金額","入金金額","残高","メモ"',
  expected_columns = 6
WHERE name = 'SBI新生銀行';

UPDATE csv_formats SET
  header_signature = '"日付","お取引内容","お引出し","お預入れ","残高（お借入れはマイナス表示）"',
  expected_columns = 5
WHERE name = 'イオン銀行';

UPDATE csv_formats SET
  header_signature = '"日付","内容","出金金額(円)","入金金額(円)","残高(円)","メモ"',
  expected_columns = 6
WHERE name = '住信SBIネット銀行';

UPDATE csv_formats SET
  header_signature = NULL,
  expected_columns = 7
WHERE name = '三井住友カード';

UPDATE csv_formats SET
  header_signature = '"ご利用者","カテゴリ","ご利用日","ご利用先など","ご利用金額(￥)","支払区分","今回回数","訂正サイン","お支払い金額(￥)","国内／海外","摘要","備考"',
  expected_columns = 12
WHERE name = 'JCBW';

UPDATE csv_formats SET
  header_signature = 'ご利用日,利用者区分,ご利用先,支払方法,,,ご利用金額,備考,',
  expected_columns = 9
WHERE name = 'イオンカード';

UPDATE csv_formats SET
  header_signature = 'ご利用年月日,ご利用箇所,ご利用額,払戻額,ご請求額（うち手数料・利息）,支払区分（回数）,今回回数,今回ご請求額・弁済金（うち手数料・利息）,現地通貨額,通貨略称,換算レート',
  expected_columns = 11
WHERE name = 'VIEWカード';

UPDATE csv_formats SET
  header_signature = '"利用日","利用店名・商品名","利用者","支払方法","利用金額","手数料/利息","支払総額","*","当月請求額","*","新規サイン"',
  expected_columns = 11
WHERE name = '楽天カード';

UPDATE csv_formats SET
  header_signature = NULL,
  expected_columns = 13,
  header_rows = 0
WHERE name = '東急カード';
