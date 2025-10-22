/**
 * @fileoverview スプレッドシートへのデータアクセスを担当するリポジトリ層のモジュール
 */

const SHEET_NAMES = {
  DB_TRANSACTIONS: '取引履歴DB',
  DB_SECURITIES: '証券残高DB',
  SETTINGS: '分類・除外設定',
  SETTINGS_CSV_FORMATS: 'CSVフォーマット設定',
  SETTINGS_SPLITWISE: '割り勘キーワード設定',
  REPORT_MONTHLY_SUMMARY: '月次レポート',
  REPORT_TRANSACTION_LIST: '月次明細一覧',
  REPORT_ASSET_TRANSITION: '総資産推移グラフ',
  REPORT_SPLITWISE: '割り勘計算レポート',
  REPORT_PORTFOLIO: '資産ポートフォリオ'
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
      throw new Error(`シート「${SHEET_NAMES.SETTINGS_CSV_FORMATS}」が見つかりません。`);
    }
    const lastRow = sheet.getLastRow();
    if (lastRow < 2) {
      return []; // 定義がない場合は空の配列を返す
    }
    const formats = sheet.getRange(2, 1, lastRow - 1, 8).getValues();
    console.log(`${formats.length}件のCSVフォーマット定義を取得しました。`);
    return formats;
  } catch (e) {
    console.error('CSVフォーマット定義の取得に失敗しました。', e);
    throw e;
  }
}

/**
 * Settings_Splitwiseシートからキーワードを取得する
 * @returns {{split: Array<string>, full: Array<string>}} 割り勘と全額請求のキーワードオブジェクト
 */
function getSplitwiseKeywords() {
  try {
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAMES.SETTINGS_SPLITWISE);
    if (!sheet) {
      throw new Error(`シート「${SHEET_NAMES.SETTINGS_SPLITWISE}」が見つかりません。`);
    }
    const lastRow = sheet.getLastRow();
    if (lastRow < 2) {
      return { split: [], full: [] };
    }
    const data = sheet.getRange(2, 1, lastRow - 1, 2).getValues();
    const splitKeywords = data.map(row => row[0]).filter(Boolean);
    const fullKeywords = data.map(row => row[1]).filter(Boolean);
    
    console.log(`割り勘キーワード: ${splitKeywords.length}件, 全額請求キーワード: ${fullKeywords.length}件を取得しました。`);
    return { split: splitKeywords, full: fullKeywords };

  } catch (e) {
    console.error('割り勘キーワードの取得に失敗しました。', e);
    throw e;
  }
}

/**
 * Settingsシートから「収支から除外するカテゴリ」を取得する
 * @returns {Array<string>} 除外カテゴリ名の配列
 */
function getExcludeFromBalanceCategories() {
  try {
    const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = spreadsheet.getSheetByName(SHEET_NAMES.SETTINGS);
    if (!sheet) {
      throw new Error(`シート「${SHEET_NAMES.SETTINGS}」が見つかりません。`);
    }
    // E列の2行目から最後まで読み込む
    const lastRow = sheet.getLastRow();
    if (lastRow < 2) {
      return [];
    }
    const categories = sheet.getRange(2, 5, lastRow - 1, 1).getValues()
      .flat()
      .filter(Boolean);
    console.log(`${categories.length}件の除外カテゴリを取得しました。`);
    return categories;
  } catch (e) {
    console.error('除外カテゴリの取得に失敗しました。', e);
    throw e;
  }
}