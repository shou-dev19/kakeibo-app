
/**
 * スプレッドシートを開いたときに実行される特殊関数。
 * UIにカスタムメニューを追加します。
 */
function onOpen() {
  SpreadsheetApp.getUi()
      .createMenu('家計簿アプリ')
      .addItem('初期設定', 'initializeSheets')
      .addSeparator()
      .addItem('CSVファイルを手動インポート', 'showCsvImportDialog')
      .addSeparator()
      .addItem('月次レポートを生成', 'showGenerateReportDialog')
      .addItem('資産推移グラフを生成', 'generateAssetTransitionGraph')
      .addSeparator()
      .addItem('割り勘計算', 'showSplitwiseDialog')
      .addSeparator()
      .addItem('分類ルールをCSVから更新', 'updateRulesFromCsv')
      .addSeparator()
      .addItem('全取引のカテゴリを再分類', 'showRecategorizeDialog')
      .addToUi();
}

/**
 * 全取引の再分類を実行する前に確認ダイアログを表示する
 */
function showRecategorizeDialog() {
  const ui = SpreadsheetApp.getUi();
  const response = ui.alert(
    '確認',
    'DB_Transactionsシートにある全取引のカテゴリを、最新のルールで上書きします。この操作は元に戻せません。\n\n本当に実行しますか？',
    ui.ButtonSet.OK_CANCEL);

  if (response == ui.Button.OK) {
    reCategorizeAllTransactions();
  }
}

/**
 * スクリプトプロパティで指定されたCSVファイルから分類ルールを読み込み、Settingsシートを更新する
 */
function updateRulesFromCsv() {
  try {
    const properties = PropertiesService.getScriptProperties();
    const csvFileId = properties.getProperty('RULE_CSV_FILE_ID');

    if (!csvFileId) {
      throw new Error('ルールCSVのファイルIDがスクリプトプロパティに設定されていません。(プロパティ名: RULE_CSV_FILE_ID)');
    }

    const csvFile = DriveApp.getFileById(csvFileId);
    const csvData = csvFile.getBlob().getDataAsString('UTF-8');
    const records = Utilities.parseCsv(csvData);

    const newRules = [];
    records.forEach(record => {
      const category = record[0];
      // 2列目以降のキーワードをルールとして追加
      for (let i = 1; i < record.length; i++) {
        if (record[i]) { // 空のキーワードは無視
          newRules.push([record[i], category]);
        }
      }
    });

    if (newRules.length === 0) {
      throw new Error('CSVから有効なルールを読み取れませんでした。');
    }

    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Settings');
    // 既存のルールをクリア（ヘッダーは残す）
    sheet.getRange('A2:B' + Math.max(sheet.getLastRow(), 2)).clearContent();
    // 新しいルールを書き込み
    sheet.getRange(2, 1, newRules.length, 2).setValues(newRules);

    SpreadsheetApp.getUi().alert('新しいカテゴリ分類ルールをSettingsシートに書き込みました。');

  } catch (e) {
    SpreadsheetApp.getUi().alert('ルールの更新に失敗しました: ' + e.message);
  }
}

/**
 * CSVインポート用のファイル選択ダイアログを表示する
 */
function showCsvImportDialog() {
  // CSVフォーマット定義を取得
  const formats = getCsvFormats();
  const formatNames = formats.map(format => format[0]); // FormatNameのリストを作成

  // プルダウンメニューのHTMLを生成
  let optionsHtml = '';
  formatNames.forEach(name => {
    optionsHtml += `<option value="${name}">${name}</option>`;
  });

  const htmlContent = `
    <style>
      .loading-overlay {
        position: fixed; top: 0; left: 0; width: 100%; height: 100%;
        background: rgba(255, 255, 255, 0.8);
        display: flex; justify-content: center; align-items: center;
        z-index: 10;
        display: none; /* 初期状態では非表示 */
      }
      .loader {
        border: 5px solid #f3f3f3;
        border-top: 5px solid #3498db;
        border-radius: 50%;
        width: 40px;
        height: 40px;
        animation: spin 1s linear infinite;
      }
      @keyframes spin {
        0% { transform: rotate(0deg); }
        100% { transform: rotate(360deg); }
      }
    </style>
    <div id="loader-overlay" class="loading-overlay">
      <div class="loader"></div>
    </div>
    <form id="csv-form">
      <p><b>1. フォーマットを選択</b></p>
      <select name="formatName" id="formatName">
        ${optionsHtml}
      </select>
      <p><b>2. CSVファイルを選択</b></p>
      <input type="file" name="csvFile" id="csvFile" />
      <br><br>
      <input type="button" value="インポート" onclick="processForm()" />
    </form>
    <script>
      function processForm() {
        // ローディング画面を表示
        document.getElementById('loader-overlay').style.display = 'flex';

        const form = document.getElementById('csv-form');
        google.script.run
          .withSuccessHandler(google.script.host.close)
          .withFailureHandler(err => { 
            // エラー時もローディングを消してダイアログを閉じる
            google.script.host.close(); 
            alert('インポートに失敗しました: ' + err.message);
          })
          .importCsv(form);
      }
    </script>
  `;
  const html = HtmlService.createHtmlOutput(htmlContent)
      .setWidth(300)
      .setHeight(200);
  SpreadsheetApp.getUi().showModalDialog(html, 'CSVファイルを選択');
}

/**
 * CSVファイルをインポートしてDBシートに書き込む（サーバーサイド関数）
 * @param {Object} formObject - ファイル入力フォームオブジェクト
 */
function importCsv(formObject) {
  try {
    const fileBlob = formObject.csvFile;
    const formatName = formObject.formatName;

    if (!fileBlob) {
      throw new Error('ファイルが選択されていません。');
    }
    if (!formatName) {
      throw new Error('CSVフォーマットが選択されていません。');
    }

    // 対応するフォーマット定義を検索
    const formats = getCsvFormats();
    const selectedFormat = formats.find(f => f[0] === formatName);

    if (!selectedFormat) {
      throw new Error(`定義されていないCSVフォーマットです: ${formatName}`);
    }

    // 古い7列の定義を補完する
    if (selectedFormat.length === 7) {
      selectedFormat.splice(5, 0, ''); // 5番目の位置（BalanceColumn）に空文字を挿入
    }

    const encoding = selectedFormat[7];
    const csvData = fileBlob.getDataAsString(encoding);

    // 1. CSVを解析
    const parsedData = parseCsv(csvData, selectedFormat);
    if (parsedData.length === 0) {
      SpreadsheetApp.getUi().alert('CSVから有効なデータを読み取れませんでした。');
      return;
    }

    // 2. カテゴリを分類
    const categorizedData = categorizeTransactions(parsedData);

    // 3. スプレッドシートに追記
    appendTransactions(categorizedData);

    SpreadsheetApp.getUi().alert(`${categorizedData.length}件のデータをインポートしました。`);

  } catch (e) {
    // エラーをクライアントに投げる
    throw new Error('インポート処理中にエラーが発生しました: ' + e.message);
  }
}

/**
 * レポート生成の対象年月をユーザーに問い合わせるダイアログを表示する
 */
function showGenerateReportDialog() {
  const ui = SpreadsheetApp.getUi();
  const yearResult = ui.prompt('レポート生成', '対象の年を入力してください（例: 2025）', ui.ButtonSet.OK_CANCEL);

  if (yearResult.getSelectedButton() !== ui.Button.OK) return;
  const year = parseInt(yearResult.getResponseText(), 10);

  const monthResult = ui.prompt('レポート生成', '対象の月を入力してください（1-12）', ui.ButtonSet.OK_CANCEL);
  if (monthResult.getSelectedButton() !== ui.Button.OK) return;
  const month = parseInt(monthResult.getResponseText(), 10);

  if (isNaN(year) || isNaN(month) || month < 1 || month > 12) {
    ui.alert('無効な年月です。処理を中断します。');
    return;
  }

  generateReports(year, month);
}

/**
 * 指定された年月の各種レポートを生成する
 * @param {number} year 
 * @param {number} month 
 */
function generateReports(year, month) {
  generateMonthlySummaryReport(year, month);
  generateTransactionListReport(year, month);
}

/**
 * 割り勘計算の対象年月をユーザーに問い合わせ、結果を表示する
 */
function showSplitwiseDialog() {
  const ui = SpreadsheetApp.getUi();
  const yearResult = ui.prompt('割り勘計算', '対象の年を入力してください（例: 2025）', ui.ButtonSet.OK_CANCEL);
  if (yearResult.getSelectedButton() !== ui.Button.OK) return;
  const year = parseInt(yearResult.getResponseText(), 10);

  const monthResult = ui.prompt('割り勘計算', '対象の月を入力してください（1-12）', ui.ButtonSet.OK_CANCEL);
  if (monthResult.getSelectedButton() !== ui.Button.OK) return;
  const month = parseInt(monthResult.getResponseText(), 10);

  if (isNaN(year) || isNaN(month) || month < 1 || month > 12) {
    ui.alert('無効な年月です。処理を中断します。');
    return;
  }

  const result = calculateSplitwiseTotal(year, month);
  const total = result.total;
  const transactions = result.transactions;

  // Report_Splitwiseシートに出力
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Report_Splitwise');
  sheet.clear();
  sheet.getRange('A1').setValue(`${year}年${month}月 割り勘対象リスト`);
  if (transactions.length > 0) {
    const headers = ['日付', '内容', '金額', '種別', 'カテゴリ', 'メモ'];
    sheet.getRange(3, 1, 1, headers.length).setValues([headers]);
    sheet.getRange(4, 1, transactions.length, transactions[0].length).setValues(transactions);
  }

  const perPerson = total / 2; // 2人で割ることを想定
  ui.alert(`${year}年${month}月の割り勘対象合計: ${total}円\n\n1人あたり: ${perPerson}円\n\n詳細は「Report_Splitwise」シートに出力しました。`);
}




/**
 * アプリケーションの初期設定を行います。
 * 必要なシートを作成し、ヘッダーを定義します。
 */
function initializeSheets() {
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();

  // DB_Transactionsシートの作成とヘッダー設定
  const transactionsSheetName = 'DB_Transactions';
  sheet = spreadsheet.getSheetByName(transactionsSheetName);
  if (!sheet) {
    sheet = spreadsheet.insertSheet(transactionsSheetName);
    const headers = ['日付', '内容', '金額', '種別', '金融機関', 'カテゴリ', 'メモ', '残高'];
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

    // 割り勘キーワードのセクションを追加
    const splitwiseHeader = ['割り勘対象キーワード'];
    const splitwiseKeywords = [['割り勘'], ['立替']];
    sheet.getRange(1, 4, 1, 1).setValue(splitwiseHeader);
    sheet.getRange(2, 4, splitwiseKeywords.length, 1).setValues(splitwiseKeywords);

  } else {
    SpreadsheetApp.getUi().alert(`「${settingsSheetName}」シートは既に存在します。`);
  }

  // Settings_CsvFormatsシートの作成とヘッダー設定
  const formatsSheetName = 'Settings_CsvFormats';
  sheet = spreadsheet.getSheetByName(formatsSheetName);
  if (!sheet) {
    sheet = spreadsheet.insertSheet(formatsSheetName);
    const headers = ['FormatName', 'DateColumn', 'DescriptionColumn', 'ExpenseColumn', 'IncomeColumn', 'BalanceColumn', 'HeaderRows', 'Encoding'];
    const initialFormat = ['三井住友カード', 1, 2, 3, '', '', 1, 'Shift_JIS']; // 残高列は空
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    sheet.getRange(2, 1, 1, initialFormat.length).setValues([initialFormat]);
    SpreadsheetApp.getUi().alert(`「${formatsSheetName}」シートを作成し、サンプルフォーマットを定義しました。`);
  } else {
    SpreadsheetApp.getUi().alert(`「${formatsSheetName}」シートは既に存在します。`);
  }

  // Report_MonthlySummaryシートの作成
  const monthlySummarySheetName = 'Report_MonthlySummary';
  sheet = spreadsheet.getSheetByName(monthlySummarySheetName);
  if (!sheet) {
    sheet = spreadsheet.insertSheet(monthlySummarySheetName);
    SpreadsheetApp.getUi().alert(`「${monthlySummarySheetName}」シートを作成しました。`);
  } else {
    SpreadsheetApp.getUi().alert(`「${monthlySummarySheetName}」シートは既に存在します。`);
  }

  // Report_TransactionListシートの作成
  const transactionListSheetName = 'Report_TransactionList';
  sheet = spreadsheet.getSheetByName(transactionListSheetName);
  if (!sheet) {
    sheet = spreadsheet.insertSheet(transactionListSheetName);
    SpreadsheetApp.getUi().alert(`「${transactionListSheetName}」シートを作成しました。`);
  } else {
    SpreadsheetApp.getUi().alert(`「${transactionListSheetName}」シートは既に存在します。`);
  }

  // Report_AssetTransitionシートの作成
  const assetTransitionSheetName = 'Report_AssetTransition';
  sheet = spreadsheet.getSheetByName(assetTransitionSheetName);
  if (!sheet) {
    sheet = spreadsheet.insertSheet(assetTransitionSheetName);
    SpreadsheetApp.getUi().alert(`「${assetTransitionSheetName}」シートを作成しました。`);
  } else {
    SpreadsheetApp.getUi().alert(`「${assetTransitionSheetName}」シートは既に存在します。`);
  }

  // Report_Splitwiseシートの作成
  const splitwiseSheetName = 'Report_Splitwise';
  sheet = spreadsheet.getSheetByName(splitwiseSheetName);
  if (!sheet) {
    sheet = spreadsheet.insertSheet(splitwiseSheetName);
    SpreadsheetApp.getUi().alert(`「${splitwiseSheetName}」シートを作成しました。`);
  } else {
    SpreadsheetApp.getUi().alert(`「${splitwiseSheetName}」シートは既に存在します。`);
  }

}
