
/**
 * @fileoverview スプレッドシートへのデータアクセスを担当するリポジトリ層のモジュール
 */

const SHEET_NAMES = {
  DB_TRANSACTIONS: 'DB_Transactions',
  SETTINGS: 'Settings',
  SETTINGS_CSV_FORMATS: 'Settings_CsvFormats',
  ACCOUNTS: 'Accounts'
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
    const formats = sheet.getRange(2, 1, lastRow - 1, 7).getValues();
    console.log(`${formats.length}件のCSVフォーマット定義を取得しました。`);
    return formats;
  } catch (e) {
    console.error('CSVフォーマット定義の取得に失敗しました。', e);
    throw e;
  }
}

/**
 * Accountsシートから口座情報を取得する
 * @returns {Array<Array<any>>} 口座情報の2次元配列
 */
function getAccounts() {
  try {
    const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = spreadsheet.getSheetByName(SHEET_NAMES.ACCOUNTS);
    if (!sheet) {
      throw new Error(`シート「${SHEET_NAMES.ACCOUNTS}」が見つかりません。`);
    }
    const lastRow = sheet.getLastRow();
    if (lastRow < 2) {
      return []; // 口座定義がない場合は空の配列を返す
    }
    const accounts = sheet.getRange(2, 1, lastRow - 1, 3).getValues();
    console.log(`${accounts.length}件の口座情報を取得しました。`);
    return accounts;
  } catch (e) {
    console.error('口座情報の取得に失敗しました。', e);
    throw e;
  }
}

/**
 * Settingsシートから割り勘キーワードを取得する
 * @returns {Array<string>} 割り勘キーワードの配列
 */
function getSplitwiseKeywords() {
  try {
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAMES.SETTINGS);
    if (!sheet) {
      throw new Error(`シート「${SHEET_NAMES.SETTINGS}」が見つかりません。`);
    }
    // D列の2行目から最後まで読み込む
    const lastRow = sheet.getLastRow();
    if (lastRow < 2) {
      return [];
    }
    const keywords = sheet.getRange(2, 4, lastRow - 1, 1).getValues()
      .flat() // 2次元配列を1次元に変換
      .filter(Boolean); // 空のセルを除外
    console.log(`${keywords.length}件の割り勘キーワードを取得しました。`);
    return keywords;
  } catch (e) {
    console.error('割り勘キーワードの取得に失敗しました。', e);
    throw e;
  }
}
