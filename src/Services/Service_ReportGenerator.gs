
/**
 * @fileoverview レポート生成を担当するサービス層のモジュール
 */

/**
 * 指定された年月の月次サマリーレポートを生成し、シートに出力する
 * @param {number} year - 対象年 (例: 2025)
 * @param {number} month - 対象月 (1-12)
 */
function generateMonthlySummaryReport(year, month) {
  const transactions = getTransactionsForMonth(year, month);
  if (transactions.length === 0) {
    SpreadsheetApp.getUi().alert(`${year}年${month}月の取引データはありません。`);
    return;
  }

  // カテゴリ別に金額を集計
  const summary = {};
  let totalIncome = 0;
  let totalExpense = 0;

  transactions.forEach(tx => {
    const amount = tx[2];
    const category = tx[3] || '未分類';

    if (amount > 0) {
      totalIncome += amount;
    } else {
      totalExpense += Math.abs(amount);
    }

    if (!summary[category]) {
      summary[category] = 0;
    }
    summary[category] += amount;
  });

  // シートに出力
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Report_MonthlySummary');
  sheet.clear();
  sheet.getRange('A1').setValue(`${year}年${month}月 収支レポート`);
  
  let row = 3;
  sheet.getRange(row, 1, 1, 2).setValues([['収入合計', totalIncome]]);
  row++;
  sheet.getRange(row, 1, 1, 2).setValues([['支出合計', totalExpense]]);
  row++;
  sheet.getRange(row, 1, 1, 2).setValues([['収支', totalIncome - totalExpense]]);
  row += 2;

  sheet.getRange(row, 1, 1, 2).setValues([['カテゴリ別支出', '金額']]);
  row++;

  for (const category in summary) {
    if (summary[category] < 0) { // 支出のみ表示
      sheet.getRange(row, 1, 1, 2).setValues([[category, Math.abs(summary[category])]]);
      row++;
    }
  }

  SpreadsheetApp.getUi().alert('月次サマリーレポートを生成しました。');
}

/**
 * 指定された年月の取引明細レポートを生成し、シートに出力する
 * @param {number} year - 対象年
 * @param {number} month - 対象月
 */
function generateTransactionListReport(year, month) {
  const transactions = getTransactionsForMonth(year, month);
  if (transactions.length === 0) {
    SpreadsheetApp.getUi().alert(`${year}年${month}月の取引データはありません。`);
    return;
  }

  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Report_TransactionList');
  sheet.clear();
  const headers = ['日付', '内容', '金額', 'カテゴリ', 'メモ'];
  sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  sheet.getRange(2, 1, transactions.length, transactions[0].length).setValues(transactions);

  SpreadsheetApp.getUi().alert('取引明細レポートを生成しました。');
}


/**
 * DB_Transactionsシートから指定された年月の取引データを取得するヘルパー関数
 * @param {number} year - 対象年
 * @param {number} month - 対象月
 * @returns {Array<Array<any>>} 取引データの2次元配列
 */
function getTransactionsForMonth(year, month) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAMES.DB_TRANSACTIONS);
  const allData = sheet.getRange(2, 1, sheet.getLastRow() - 1, 5).getValues();

  const filteredData = allData.filter(row => {
    if (!row[0] || !(row[0] instanceof Date)) return false;
    const txDate = new Date(row[0]);
    return txDate.getFullYear() === year && (txDate.getMonth() + 1) === month;
  });

  return filteredData;
}
