// CSV parsing. Pure functions, no runtime/D1 dependencies.
//
// Ported from Service_CsvImporter.gs (`parseCsv`) plus a small RFC-4180-style
// CSV tokenizer to replace GAS's `Utilities.parseCsv`.

import type { CsvFormat, TransactionType } from "./types";
import { normalizeDate } from "./dates";

/**
 * A parsed transaction, before categorization. Mirrors the GAS row shape
 * `[日付, 内容, 金額, 種別, 金融機関, カテゴリ(空), メモ(空), 残高]` as an object.
 * `category`/`memo` are intentionally left empty here; category is assigned by
 * the categorizer, memo is user-entered.
 */
export interface ParsedTransaction {
  date: string; // YYYY-MM-DD
  description: string;
  amount: number;
  type: TransactionType;
  institution: string;
  balance: number | null;
}

/**
 * Tokenize CSV text into a matrix of string cells. Handles:
 *   - `\r\n`, `\r` and `\n` line endings
 *   - double-quoted fields, with `""` as an escaped quote
 *   - commas and newlines inside quoted fields
 * A trailing empty line is dropped.
 */
export function parseCsvRows(text: string): string[][] {
  const rows: string[][] = [];
  let field = "";
  let row: string[] = [];
  let inQuotes = false;
  let i = 0;
  const n = text.length;

  const endField = () => {
    row.push(field);
    field = "";
  };
  const endRow = () => {
    endField();
    rows.push(row);
    row = [];
  };

  while (i < n) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 2;
        } else {
          inQuotes = false;
          i++;
        }
      } else {
        field += ch;
        i++;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
        i++;
      } else if (ch === ",") {
        endField();
        i++;
      } else if (ch === "\r") {
        // Treat \r\n and lone \r as one line break.
        endRow();
        if (text[i + 1] === "\n") i += 2;
        else i++;
      } else if (ch === "\n") {
        endRow();
        i++;
      } else {
        field += ch;
        i++;
      }
    }
  }

  // Flush the final field/row unless the input ended exactly on a line break
  // (in which case there is nothing pending).
  if (field !== "" || row.length > 0) {
    endRow();
  }

  return rows;
}

/**
 * Parse an amount cell to an integer number of yen.
 * Removes thousands separators (`,`) and the full-width yen sign (U+FFE5),
 * matching the GAS `.replace(/[,￥]/g, '')` + `parseInt` behavior.
 * Returns NaN for non-numeric input.
 */
export function parseAmount(cell: string | undefined): number {
  if (cell == null) return NaN;
  const cleaned = cell.replace(/[,￥]/g, "").trim();
  if (cleaned === "") return NaN;
  // parseInt-style: take the leading integer portion.
  const m = cleaned.match(/^[+-]?\d+/);
  if (!m) return NaN;
  return parseInt(m[0], 10);
}

/**
 * 内容（明細名）を組み立てる。`desc_col2` が設定されている場合は2列を半角
 * スペースで連結する。三菱UFJのように摘要が「口座振替４」＋「ラクテンカ−ド
 * サ−ビ」の2列に分かれるCSV向け。空の列は飛ばすので、片方だけの行は単独の値に
 * なる（ATM出金の「カ−ド」など）。
 */
export function buildDescription(record: string[], format: CsvFormat): string {
  const cols = [format.desc_col, format.desc_col2 ?? null];
  return cols
    .filter((col): col is number => col != null)
    .map((col) => (record[col - 1] ?? "").trim())
    .filter((cell) => cell !== "")
    .join(" ");
}

/**
 * Parse pre-tokenized CSV text into transactions using a format definition.
 *
 * Column indices on `format` are 1-based (as in the GAS CSV format sheet).
 * `institution` is set to the format's `name` (the GAS version used FormatName
 * as the 金融機関 value).
 *
 * Row rules (ported exactly from Service_CsvImporter.gs):
 *   1. Skip `header_rows` leading rows.
 *   2. Invalid/unparseable date => skip row.
 *   3. Income first: if income_col has a value that parses to a non-zero
 *      integer, it's 収入. Otherwise check expense_col; a non-zero integer is
 *      支出. If neither yields a valid non-zero amount, skip the row.
 *   4. balance_col is optional; a valid integer sets balance, else null.
 *
 * GAS版からの変更点:
 *   5. 金額がマイナスの行は符号を反転して種別を逆にする（支出のマイナス=返金・
 *      キャッシュバックは収入として扱う）。
 */
export function parseCsv(text: string, format: CsvFormat): ParsedTransaction[] {
  if (!text || !format) return [];

  const rows = parseCsvRows(text);
  const dataRows = rows.slice(Math.max(0, format.header_rows));

  const out: ParsedTransaction[] = [];
  for (const record of dataRows) {
    const rawDate = record[format.date_col - 1];
    const date = normalizeDate(rawDate);
    if (!date) continue; // invalid date row -> skip

    const description = buildDescription(record, format);

    let amount = 0;
    let type: TransactionType | "" = "";

    // Income column first.
    if (format.income_col != null) {
      const cell = record[format.income_col - 1];
      if (cell != null && cell !== "") {
        const val = parseAmount(cell);
        if (!Number.isNaN(val) && val !== 0) {
          amount = val;
          type = "収入";
        }
      }
    }

    // Otherwise expense column.
    if (type === "" && format.expense_col != null) {
      const cell = record[format.expense_col - 1];
      if (cell != null && cell !== "") {
        const val = parseAmount(cell);
        if (!Number.isNaN(val) && val !== 0) {
          amount = val;
          type = "支出";
        }
      }
    }

    if (type === "") continue; // no valid amount -> skip

    // マイナス金額は符号を反転して逆の種別に振り替える。
    // 例: JCBの「ＭｙＪＣＢ　Ｐａｙポイント利用（キャッシュバック）」はご利用金額
    // 列がマイナス表記だが、これは請求からの控除＝実質的な収入なので、収入として
    // プラス計上する（返金・取消行も同様）。
    if (amount < 0) {
      amount = -amount;
      type = type === "支出" ? "収入" : "支出";
    }

    // Optional balance column.
    let balance: number | null = null;
    if (format.balance_col != null) {
      const cell = record[format.balance_col - 1];
      if (cell != null && cell !== "") {
        const val = parseAmount(cell);
        if (!Number.isNaN(val)) balance = val;
      }
    }

    out.push({
      date,
      description,
      amount,
      type,
      institution: format.name,
      balance,
    });
  }

  return out;
}
