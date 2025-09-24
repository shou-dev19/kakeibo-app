
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
  const htmlContent = `
    <form id="csv-form">
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
      .setHeight(120);
  SpreadsheetApp.getUi().showModalDialog(html, 'CSVファイルを選択');
}

/**
 * CSVファイルをインポートしてDBシートに書き込む（サーバーサイド関数）
 * @param {Object} formObject - ファイル入力フォームオブジェクト
 */
function importCsv(formObject) {
  try {
    const fileBlob = formObject.csvFile;
    if (!fileBlob) {
      throw new Error('ファイルが選択されていません。');
    }
    const csvData = fileBlob.getDataAsString('Shift_JIS'); // 文字コードを指定

    // 1. CSVを解析
    const parsedData = parseMitsuiCardCsv(csvData);
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
}
