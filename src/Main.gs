/**
 * スプレッドシートを開いたときに実行される特殊関数。
 * UIにカスタムメニューを追加します。
 */
function onOpen() {
  SpreadsheetApp.getUi()
      .createMenu('家計簿アプリ')
      .addItem('初期設定', 'initializeSheets')
      .addToUi();
}

/**
 * アプリケーションの初期設定を行います。
 * 必要なシートを作成し、ヘッダーを定義します。
 */
function initializeSheets() {
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  
  // DB_Transactionsシートの作成とヘッダー設定
  const transactionsSheetName = 'DB_Transactions';
  let sheet = spreadsheet.getSheetByName(transactionsSheetName);
  if (!sheet) {
    sheet = spreadsheet.insertSheet(transactionsSheetName);
    const headers = ['日付', '内容', '金額', 'カテゴリ', 'メモ'];
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    SpreadsheetApp.getUi().alert(`「${transactionsSheetName}」シートを作成しました。`);
  } else {
    SpreadsheetApp.getUi().alert(`「${transactionsSheetName}」シートは既に存在します。`);
  }
  
  // Settingsシートの作成とヘッダー設定
  const settingsSheetName = 'Settings';
  sheet = spreadsheet.getSheetByName(settingsSheetName);
  if (!sheet) {
    sheet = spreadsheet.insertSheet(settingsSheetName);
    const headers = ['キーワード', 'カテゴリ'];
    const rules = [
      ['楽天', '固定費'],
      ['Amazon', '変動費'],
    ];
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    sheet.getRange(2, 1, rules.length, rules[0].length).setValues(rules);
    SpreadsheetApp.getUi().alert(`「${settingsSheetName}」シートを作成し、サンプルルールを定義しました。`);
  } else {
    SpreadsheetApp.getUi().alert(`「${settingsSheetName}」シートは既に存在します。`);
  }
}