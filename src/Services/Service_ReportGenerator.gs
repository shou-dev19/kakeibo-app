
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
  const excludeCategories = getExcludeFromBalanceCategories();

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
    const type = tx[3];
    const category = tx[5] || '未分類';

    // 「振替」カテゴリと「除外指定カテゴリ」はすべての計算から除外
    if (category === '振替' || excludeCategories.includes(category)) {
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
  // 1. 預金残高の履歴を取得
  const bankTxSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAMES.DB_TRANSACTIONS);
  const bankTransactions = (bankTxSheet.getLastRow() < 2) ? [] : 
    bankTxSheet.getRange(2, 1, bankTxSheet.getLastRow() - 1, 8).getValues()
      .filter(tx => tx[7] !== null && tx[7] !== '');

  // 2. 証券残高の履歴を取得
  const securitiesSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('DB_Securities');
  const securitiesHistory = (securitiesSheet.getLastRow() < 2) ? [] : 
    securitiesSheet.getRange(2, 1, securitiesSheet.getLastRow() - 1, 3).getValues();

  if (bankTransactions.length === 0 && securitiesHistory.length === 0) {
    SpreadsheetApp.getUi().alert('残高データがありません。資産推移グラフは生成できません。');
    return;
  }

  // 3. 全ての日付を洗い出し、ユニークでソートされた日付リストを作成
  const allDates = [
    ...bankTransactions.map(tx => new Date(tx[0])),
    ...securitiesHistory.map(h => new Date(h[0]))
  ];
  const uniqueDateStrings = [...new Set(allDates.map(d => Utilities.formatDate(d, 'JST', 'yyyy-MM-dd')))].sort();

  // 4. 日付ごとの総資産を計算
  const dailyTotalAssets = [];
  let lastBankBalances = {};
  let lastSecuritiesBalances = {};

  for (const dateStr of uniqueDateStrings) {
    const targetDate = new Date(dateStr);

    // その日までの銀行取引から各口座の最新残高を更新
    bankTransactions.forEach(tx => {
      if (new Date(tx[0]) <= targetDate) {
        const institution = tx[4];
        const balance = tx[7];
        lastBankBalances[institution] = balance;
      }
    });

    // その日までの証券履歴から各証券会社の最新評価額を更新
    securitiesHistory.forEach(h => {
      if (new Date(h[0]) <= targetDate) {
        const brokerage = h[1];
        const value = h[2];
        lastSecuritiesBalances[brokerage] = value;
      }
    });

    // 合計を計算
    const totalBankBalance = Object.values(lastBankBalances).reduce((sum, b) => sum + b, 0);
    const totalSecuritiesBalance = Object.values(lastSecuritiesBalances).reduce((sum, v) => sum + v, 0);
    const totalAssets = totalBankBalance + totalSecuritiesBalance;
    
    dailyTotalAssets.push([targetDate, totalAssets]);
  }

  // 5. シートに出力してグラフを作成
  const chartData = [['日付', '総資産残高'], ...dailyTotalAssets];
  const reportSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Report_AssetTransition');
  reportSheet.clear();
  reportSheet.getRange(1, 1, chartData.length, 2).setValues(chartData);

  reportSheet.getCharts().forEach(chart => reportSheet.removeChart(chart));

  const chart = reportSheet.newChart()
    .setChartType(Charts.ChartType.LINE)
    .addRange(reportSheet.getRange('A1:B' + chartData.length))
    .setPosition(3, 3, 0, 0)
    .setOption('title', '総資産推移グラフ')
    .setOption('hAxis.format', 'yyyy/MM/dd')
    .build();

  reportSheet.insertChart(chart);
  SpreadsheetApp.getUi().alert('総資産推移グラフを生成しました。');
}
