
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

    // 「振替」カテゴリは収支計算から除外
    if (category === '振替') {
      return; // 次の取引へ
    }

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

  // 既存のグラフを削除
  sheet.getCharts().forEach(chart => sheet.removeChart(chart));

  // 円グラフを作成
  const chartRange = sheet.getRange(`A${row - Object.keys(summary).length}:B${row - 1}`);
  const pieChart = sheet.newChart()
    .setChartType(Charts.ChartType.PIE)
    .addRange(chartRange)
    .setPosition(3, 4, 0, 0) // C3セルあたりに配置
    .setOption('title', 'カテゴリ別支出割合')
    .build();

  sheet.insertChart(pieChart);

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
  const headers = ['日付', '内容', '金額', '種別', '金融機関', 'カテゴリ', 'メモ', '残高'];
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
  const allData = sheet.getRange(2, 1, sheet.getLastRow() - 1, 8).getValues();

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
  // 1. 全取引履歴を取得
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAMES.DB_TRANSACTIONS);
  if (sheet.getLastRow() < 2) {
    SpreadsheetApp.getUi().alert('取引データがありません。');
    return;
  }
  // 日付(0), 金融機関(4), 残高(7) の列を取得
  const allData = sheet.getRange(2, 1, sheet.getLastRow() - 1, 8).getValues();

  // 2. 残高情報がある取引のみフィルタリング
  const balanceTransactions = allData.filter(tx => tx[7] !== null && tx[7] !== '');
  if (balanceTransactions.length === 0) {
    SpreadsheetApp.getUi().alert('残高情報を含む取引データがありません。資産推移グラフは生成できません。');
    return;
  }

  // 3. 日付でソート
  balanceTransactions.sort((a, b) => new Date(a[0]) - new Date(b[0]));

  // 4. 日付ごとの各金融機関の最終残高を記録
  const dailyLastBalances = {}; // { 'YYYY-MM-DD': { '金融機関A': 1000, '金融機関B': 2000 }, ... }
  const uniqueDates = [...new Set(balanceTransactions.map(tx => Utilities.formatDate(new Date(tx[0]), 'JST', 'yyyy-MM-dd')))];
  
  uniqueDates.forEach(dateStr => {
    dailyLastBalances[dateStr] = {};
    const targetDate = new Date(dateStr);

    // その日までの取引に絞り込み
    const upToDateTxs = balanceTransactions.filter(tx => new Date(tx[0]) <= targetDate);

    // 各金融機関の最新の残高を取得
    const latestBalances = {};
    upToDateTxs.forEach(tx => {
      const institution = tx[4];
      const balance = tx[7];
      latestBalances[institution] = balance; // 日付でソート済みなので、最後のものが最新
    });
    dailyLastBalances[dateStr] = latestBalances;
  });

  // 5. 日付ごとの合計残高を計算
  const chartData = [['日付', '総資産残高']];
  for (const dateStr in dailyLastBalances) {
    let totalBalance = 0;
    const balances = dailyLastBalances[dateStr];
    for (const institution in balances) {
      totalBalance += balances[institution];
    }
    chartData.push([new Date(dateStr), totalBalance]);
  }

  // 6. シートに出力してグラフを作成
  const reportSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Report_AssetTransition');
  reportSheet.clear();
  reportSheet.getRange(1, 1, chartData.length, 2).setValues(chartData);

  reportSheet.getCharts().forEach(chart => reportSheet.removeChart(chart));

  const chart = reportSheet.newChart()
    .setChartType(Charts.ChartType.LINE)
    .addRange(reportSheet.getRange('A1:B' + chartData.length))
    .setPosition(3, 3, 0, 0)
    .setOption('title', '資産推移グラフ')
    .setOption('hAxis.format', 'yyyy/MM/dd')
    .build();

  reportSheet.insertChart(chart);
  SpreadsheetApp.getUi().alert('資産推移グラフを生成しました。');
}
