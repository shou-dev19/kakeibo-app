
/**
 * @fileoverview スプレッドシートへのデータアクセスを担当するリポジトリ層のモジュール
 */

const SHEET_NAMES = {
  DB_TRANSACTIONS: 'DB_Transactions',
  SETTINGS: 'Settings',
  SETTINGS_CSV_FORMATS: 'Settings_CsvFormats'
};

/**
 * DB_Transactionsシートに取引データを追記する
 * @param {Array<Array<any>>} data - 追記するデータの2次元配列
 */
function appendTransactions(data) {
  if (!data || data.length === 0) {
    console.warn('追記するデータがありません。');
    return;
  }
  try {
    const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = spreadsheet.getSheetByName(SHEET_NAMES.DB_TRANSACTIONS);
    if (!sheet) {
      throw new Error(`シート「${SHEET_NAMES.DB_TRANSACTIONS}」が見つかりません。`);
    }
    sheet.getRange(sheet.getLastRow() + 1, 1, data.length, data[0].length).setValues(data);
    console.log(`${data.length}件の取引データを追記しました。`);
  } catch (e) {
    console.error('取引データの追記に失敗しました。', e);
    throw e;
  }
}

/**
 * Settingsシートからカテゴリ分類ルールを取得する
 * @returns {Array<Array<string>>} カテゴリ分類ルールの2次元配列（キーワード, カテゴリ）
 */
function getCategoryRules() {
  try {
    const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = spreadsheet.getSheetByName(SHEET_NAMES.SETTINGS);
    if (!sheet) {
      throw new Error(`シート「${SHEET_NAMES.SETTINGS}」が見つかりません。`);
    }
    // ヘッダーを除き、2行目から最終行まで取得
    const lastRow = sheet.getLastRow();
    if (lastRow < 2) {
      return []; // ルールがない場合は空の配列を返す
    }
    const rules = sheet.getRange(2, 1, lastRow - 1, 2).getValues();
    console.log(`${rules.length}件のカテゴリ分類ルールを取得しました。`);
    return rules;
  } catch (e) {
    console.error('カテゴリ分類ルールの取得に失敗しました。', e);
    throw e;
  }
}

/**
 * Settings_CsvFormatsシートからCSVフォーマット定義を取得する
 * @returns {Array<Array<any>>} CSVフォーマット定義の2次元配列
 */
function getCsvFormats() {
  try {
    const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = spreadsheet.getSheetByName(SHEET_NAMES.SETTINGS_CSV_FORMATS);
    if (!sheet) {
      throw new Error(`シート「Settings_CsvFormats」が見つかりません。`);
    }
    const lastRow = sheet.getLastRow();
    if (lastRow < 2) {
      return []; // 定義がない場合は空の配列を返す
    }
    const formats = sheet.getRange(2, 1, lastRow - 1, 6).getValues();
    console.log(`${formats.length}件のCSVフォーマット定義を取得しました。`);
    return formats;
  } catch (e) {
    console.error('CSVフォーマット定義の取得に失敗しました。', e);
    throw e;
  }
}
