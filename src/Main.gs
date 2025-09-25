
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
      .addToUi();
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
        const form = document.getElementById('csv-form');
        // ボタンを無効化して二重送信を防ぐ
        this.disabled = true;
        google.script.run
          .withSuccessHandler(google.script.host.close)
          .withFailureHandler(err => { alert('インポートに失敗しました: ' + err.message); google.script.host.close(); })
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

    const encoding = selectedFormat[5]; // Encoding列
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

  // Settings_CsvFormatsシートの作成とヘッダー設定
  const formatsSheetName = 'Settings_CsvFormats';
  sheet = spreadsheet.getSheetByName(formatsSheetName);
  if (!sheet) {
    sheet = spreadsheet.insertSheet(formatsSheetName);
    const headers = ['FormatName', 'DateColumn', 'DescriptionColumn', 'AmountColumn', 'HeaderRows', 'Encoding'];
    const initialFormat = ['三井住友カード', 1, 2, 3, 1, 'Shift_JIS']; // 列番号は1-based
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
}
