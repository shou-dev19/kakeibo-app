
/**
 * @fileoverview トリガーによって実行される関数を管理するモジュール
 */

// NOTE: このファイル内の関数をトリガーとして設定するには、Apps Scriptのエディタから手動で設定が必要です。

/**
 * 時間主導型トリガーによって定期的に実行される関数。
 * 指定されたGoogle Driveフォルダを監視し、新しいファイルがあればインポート処理を実行する。
 */
function checkDriveFolderForNewFiles() {
  const scriptProperties = PropertiesService.getScriptProperties();
  const folderId = 'YOUR_GOOGLE_DRIVE_FOLDER_ID'; // TODO: 監視対象のフォルダIDに書き換える
  const lastCheckedTimestamp = scriptProperties.getProperty('LAST_CHECKED_TIMESTAMP') || 0;
  const lastCheckedDate = new Date(parseInt(lastCheckedTimestamp, 10));

  try {
    const folder = DriveApp.getFolderById(folderId);
    const files = folder.getFiles();
    let latestTimestamp = lastCheckedDate.getTime();

    while (files.hasNext()) {
      const file = files.next();
      const lastUpdated = file.getLastUpdated();

      if (lastUpdated > lastCheckedDate) {
        console.log(`新しいファイル「${file.getName()}」を検出しました。`);
        processFile(file); // 既存の処理関数を呼び出す
      }

      if (lastUpdated.getTime() > latestTimestamp) {
        latestTimestamp = lastUpdated.getTime();
      }
    }

    // 次回のために、今回チェックした最新のタイムスタンプを保存
    scriptProperties.setProperty('LAST_CHECKED_TIMESTAMP', latestTimestamp.toString());

  } catch (err) {
    console.error('自動インポート処理中にエラーが発生しました。', err);
  }
}


/**
 * ファイルを処理してインポートを実行する
 * @param {GoogleAppsScript.Drive.File} file 
 */
function processFile(file) {
  const fileName = file.getName();
  const fileBlob = file.getBlob();

  // フォーマット定義を取得
  const formats = getCsvFormats();
  let selectedFormat = null;

  // ファイル名に含まれるキーワードでフォーマットを判定
  // NOTE: フォーマット名の部分一致で判定しているため、命名規則の工夫が必要（例: 「三井住友」と「三井住友NL」など）
  for (const format of formats) {
    const formatName = format[0];
    if (fileName.toLowerCase().includes(formatName.toLowerCase())) {
      selectedFormat = format;
      break;
    }
  }

  if (!selectedFormat) {
    console.warn(`ファイル名「${fileName}」に合致するCSVフォーマット定義が見つかりませんでした。`);
    return;
  }

  console.log(`ファイル「${fileName}」をフォーマット「${selectedFormat[0]}」でインポートします。`);

  const encoding = selectedFormat[6];
  const csvData = fileBlob.getDataAsString(encoding);

  // 1. CSVを解析
  const parsedData = parseCsv(csvData, selectedFormat);
  if (parsedData.length === 0) {
    console.warn('CSVから有効なデータを読み取れませんでした。');
    return;
  }

  // 2. カテゴリを分類
  const categorizedData = categorizeTransactions(parsedData);

  // 3. スプレッドシートに追記
  appendTransactions(categorizedData);

  console.log(`${categorizedData.length}件のデータを自動インポートしました。`);
}
