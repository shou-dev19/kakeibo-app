
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
    const type = tx[3]; // 種別列
    const category = tx[5] || '未分類'; // カテゴリ列

    if (type === '収入') {
      totalIncome += amount;
    } else { // 支出または未定義
      totalExpense += amount;
    }

    if (type === '支出') {
      if (!summary[category]) {
        summary[category] = 0;
      }
      summary[category] += amount;
    }
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
    sheet.getRange(row, 1, 1, 2).setValues([[category, summary[category]]]);
    row++;
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
  const headers = ['日付', '内容', '金額', '種別', '金融機関', 'カテゴリ', 'メモ'];
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
  const allData = sheet.getRange(2, 1, sheet.getLastRow() - 1, 7).getValues();

  const filteredData = allData.filter(row => {
    if (!row[0] || !(row[0] instanceof Date)) return false;
    const txDate = new Date(row[0]);
    return txDate.getFullYear() === year && (txDate.getMonth() + 1) === month;
  });

  return filteredData;
}

/**
 * 全期間の取引データから資産推移を計算し、グラフを生成する
 */
function generateAssetTransitionGraph() {
  // 1. 口座情報を取得し、初期残高の合計と最も古い基準日を特定
  const accounts = getAccounts();
  if (accounts.length === 0) {
    SpreadsheetApp.getUi().alert('口座情報が未登録です。Accountsシートに初期残高を登録してください。');
    return;
  }

  let totalInitialBalance = 0;
  let oldestInitialDate = new Date();
  accounts.forEach(acc => {
    const balance = acc[1];
    const date = new Date(acc[2]);
    totalInitialBalance += balance;
    if (date < oldestInitialDate) {
      oldestInitialDate = date;
    }
  });

  // 2. 全取引履歴を取得し、基準日以降のものをフィルタリング
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAMES.DB_TRANSACTIONS);
  if (sheet.getLastRow() < 2) {
    SpreadsheetApp.getUi().alert('取引データがありません。');
    return;
  }
  const allData = sheet.getRange(2, 1, sheet.getLastRow() - 1, 7).getValues();
  const filteredData = allData.filter(tx => new Date(tx[0]) >= oldestInitialDate);

  // 3. 月末ごとの残高を計算
  const monthlyBalances = {};
  let currentBalance = totalInitialBalance;

  // まず全取引を日付でソート
  filteredData.sort((a, b) => new Date(a[0]) - new Date(b[0]));

  // 計算開始月の月初残高を設定
  const startMonthKey = `${oldestInitialDate.getFullYear()}-${('0' + (oldestInitialDate.getMonth() + 1)).slice(-2)}`;
  monthlyBalances[startMonthKey] = totalInitialBalance;

  filteredData.forEach(tx => {
    const date = new Date(tx[0]);
    const amount = tx[2];
    const type = tx[3];

    if (type === '収入') {
      currentBalance += amount;
    } else {
      currentBalance -= amount;
    }

    const monthKey = `${date.getFullYear()}-${('0' + (date.getMonth() + 1)).slice(-2)}`;
    monthlyBalances[monthKey] = currentBalance;
  });

  // 4. データをシート出力用に整形
  const chartData = Object.keys(monthlyBalances).sort().map(key => [key, monthlyBalances[key]]);
  chartData.unshift(['年月', '月末残高']); // ヘッダーを追加

  // 5. シートに出力してグラフを作成
  const reportSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Report_AssetTransition');
  reportSheet.clear();
  reportSheet.getRange(1, 1, chartData.length, 2).setValues(chartData);

  reportSheet.getCharts().forEach(chart => reportSheet.removeChart(chart));

  const chart = reportSheet.newChart()
    .setChartType(Charts.ChartType.LINE)
    .addRange(reportSheet.getRange('A1:B' + chartData.length))
    .setPosition(3, 3, 0, 0)
    .setOption('title', '資産推移グラフ')
    .build();

  reportSheet.insertChart(chart);
  SpreadsheetApp.getUi().alert('資産推移グラフを生成しました。');
}
