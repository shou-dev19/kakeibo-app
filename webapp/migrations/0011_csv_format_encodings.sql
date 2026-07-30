-- Allow each CSV format to try multiple strict decoding candidates.
-- Keep the legacy encoding column for backward compatibility.

ALTER TABLE csv_formats ADD COLUMN encodings TEXT;

UPDATE csv_formats
SET encodings = json_array(encoding);

UPDATE csv_formats
SET
  encoding = 'Shift_JIS',
  encodings = '["Shift_JIS","UTF-8"]'
WHERE name IN (
  'JCBW',
  'VIEWカード',
  'イオンカード',
  'イオン銀行',
  '住信SBIネット銀行'
);
