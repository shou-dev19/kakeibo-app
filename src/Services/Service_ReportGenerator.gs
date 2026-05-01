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
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAMES.REPORT_MONTHLY_SUMMARY);
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

  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAMES.REPORT_TRANSACTION_LIST);
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
  const securitiesSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAMES.DB_SECURITIES);
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
  const reportSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAMES.REPORT_ASSET_TRANSITION);
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

/**
 * 最新の資産ポートフォリオを計算し、円グラフで出力する
 */
function generatePortfolioReport() {
  // 1. 最新の預金残高を計算
  const bankTxSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAMES.DB_TRANSACTIONS);
  let totalBankBalance = 0;
  if (bankTxSheet.getLastRow() >= 2) {
    const bankTransactions = bankTxSheet.getRange(2, 1, bankTxSheet.getLastRow() - 1, 8).getValues()
      .filter(tx => tx[7] !== null && tx[7] !== '');
    
    const latestBankBalances = {};
    bankTransactions.forEach(tx => {
      const institution = tx[4];
      const balance = tx[7];
      latestBankBalances[institution] = balance;
    });
    totalBankBalance = Object.values(latestBankBalances).reduce((sum, b) => sum + b, 0);
  }

  // 2. 最新の証券評価額を計算
  const securitiesSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAMES.DB_SECURITIES);
  let totalSecuritiesBalance = 0;
  if (securitiesSheet.getLastRow() >= 2) {
    const securitiesHistory = securitiesSheet.getRange(2, 1, securitiesSheet.getLastRow() - 1, 3).getValues();
    const latestSecuritiesBalances = {};
    securitiesHistory.forEach(h => {
      const brokerage = h[1];
      const value = h[2];
      latestSecuritiesBalances[brokerage] = value;
    });
    totalSecuritiesBalance = Object.values(latestSecuritiesBalances).reduce((sum, v) => sum + v, 0);
  }

  if (totalBankBalance === 0 && totalSecuritiesBalance === 0) {
    SpreadsheetApp.getUi().alert('残高データがありません。ポートフォリオレポートは生成できません。');
    return;
  }

  // 3. シートに出力してグラフを作成
  const reportSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAMES.REPORT_PORTFOLIO);
  reportSheet.clear();
  
  const chartData = [
    ['資産種別', '評価額'],
    ['預金・現金', totalBankBalance],
    ['証券', totalSecuritiesBalance]
  ];
  reportSheet.getRange(1, 1, chartData.length, 2).setValues(chartData);

  reportSheet.getCharts().forEach(chart => reportSheet.removeChart(chart));

  const chart = reportSheet.newChart()
    .setChartType(Charts.ChartType.PIE)
    .addRange(reportSheet.getRange('A1:B3'))
    .setPosition(1, 4, 0, 0) // D1セルあたりに配置
    .setOption('title', '保有資産ポートフォリオ')
    .setOption('colors', ['#4285F4', '#34A853']) // Googleカラーの青と緑
    .build();

  reportSheet.insertChart(chart);
  }

/**
 * 直近1年間の年間サマリーレポートを生成する
 */
function generateAnnualSummaryReport() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAMES.REPORT_ANNUAL_SUMMARY);
  sheet.clear();
  sheet.getRange('A1').setValue('年間サマリーレポート');

  const today = new Date();
  const monthlySummaries = [];
  const monthlyCategoryExpenses = {}; // { '2025/09': { '食費': 50000, ... }, ... }
  const allCategories = new Set();

  const excludeFromBalanceCategories = getExcludeFromBalanceCategories();
  const excludeFromAnnualReportCategories = getExcludeFromAnnualReportCategories();

  // 1. 直近12ヶ月分のデータを月ごとに処理し、中間データを構築
  for (let i = 0; i < 12; i++) {
    const targetDate = new Date(today.getFullYear(), today.getMonth() - i, 1);
    const year = targetDate.getFullYear();
    const month = targetDate.getMonth() + 1;
    const monthKey = `${year}/${('0' + month).slice(-2)}`;

    const transactions = getTransactionsForMonth(year, month);
    monthlyCategoryExpenses[monthKey] = {};

    let monthlyIncome = 0;
    let monthlyExpense = 0;

    transactions.forEach(tx => {
      const amount = tx[2];
      const type = tx[3];
      const category = tx[5] || '未分類';

      // 月次収支の計算（「振替」と「収支除外カテゴリ」を除く）
      if (category !== '振替' && !excludeFromBalanceCategories.includes(category)) {
        if (type === '収入') {
          monthlyIncome += amount;
        } else {
          monthlyExpense += amount;
        }
      }

      // 年間レポート用のカテゴリ別集計（「振替」と「年間レポート除外カテゴリ」を除く）
      if (type === '支出' && category !== '振替' && !excludeFromAnnualReportCategories.includes(category)) {
        monthlyCategoryExpenses[monthKey][category] = (monthlyCategoryExpenses[monthKey][category] || 0) + amount;
        allCategories.add(category);
      }
    });
    monthlySummaries.unshift([monthKey, monthlyIncome, monthlyExpense, monthlyIncome - monthlyExpense]);
  }

  // 月次サマリーをシートに出力
  const monthlyHeaders = ['年月', '収入', '支出', '収支'];
  sheet.getRange(3, 1, 1, monthlyHeaders.length).setValues([monthlyHeaders]).setFontWeight('bold');
  sheet.getRange(4, 1, monthlySummaries.length, monthlyHeaders.length).setValues(monthlySummaries);

  // 合計行を追加
  const totalIncome = monthlySummaries.reduce((sum, row) => sum + row[1], 0);
  const totalExpense = monthlySummaries.reduce((sum, row) => sum + row[2], 0);
  const totalBalance = totalIncome - totalExpense;
  const totalRow = ['合計', totalIncome, totalExpense, totalBalance];
  sheet.getRange(4 + monthlySummaries.length, 1, 1, totalRow.length).setValues([totalRow]).setFontWeight('bold');

  // 3. 月別カテゴリ支出テーブルを作成
  const sortedCategories = Array.from(allCategories).sort();
  const categoryTableStartRow = 4;
  const categoryTableStartCol = 6; // F列

  const categoryHeaders = ['カテゴリ', ...monthlySummaries.map(s => s[0]), '平均', '合計'];
  const categoryTable = sortedCategories.map(category => {
    const monthlyValues = monthlySummaries.map(s => monthlyCategoryExpenses[s[0]][category] || 0);
    const total = monthlyValues.reduce((sum, v) => sum + v, 0);
    const average = total / 12;
    return [category, ...monthlyValues, average, total];
  });

  sheet.getRange(categoryTableStartRow, categoryTableStartCol, 1, categoryHeaders.length).setValues([categoryHeaders]).setFontWeight('bold');
  sheet.getRange(categoryTableStartRow + 1, categoryTableStartCol, categoryTable.length, categoryHeaders.length).setValues(categoryTable);

  // 4. 平均支出割合の円グラフを作成
  const pieChartData = sortedCategories.map(category => {
    const monthlyValues = monthlySummaries.map(s => monthlyCategoryExpenses[s[0]][category] || 0);
    const total = monthlyValues.reduce((sum, v) => sum + v, 0);
    return [category, total / 12]; // 平均値でグラフ作成
  }).filter(row => row[1] > 0);

  // 平均支出額で降順ソート
  pieChartData.sort((a, b) => b[1] - a[1]);

  const pieChartStartRow = categoryTableStartRow + categoryTable.length + 2;
  sheet.getRange(pieChartStartRow, categoryTableStartCol, 1, 2).setValues([['カテゴリ', '月平均支出']]).setFontWeight('bold');
  sheet.getRange(pieChartStartRow + 1, categoryTableStartCol, pieChartData.length, 2).setValues(pieChartData);

  sheet.getCharts().forEach(chart => sheet.removeChart(chart));
  const chartRange = sheet.getRange(pieChartStartRow, categoryTableStartCol, pieChartData.length + 1, 2);
  const pieChart = sheet.newChart()
    .setChartType(Charts.ChartType.PIE)
    .addRange(chartRange)
    .setPosition(pieChartStartRow, categoryTableStartCol + 3, 0, 0) // I列あたり
    .setOption('title', '月平均の支出カテゴリ割合')
    .build();

  sheet.insertChart(pieChart);

  SpreadsheetApp.getUi().alert('年間レポートを生成しました。');
}
