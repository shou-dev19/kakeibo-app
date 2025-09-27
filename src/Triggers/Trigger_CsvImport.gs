
/**
 * @fileoverview トリガーによって実行される関数を管理するモジュール
 */

// NOTE: このファイル内の関数をトリガーとして設定するには、Apps Scriptのエディタから手動で設定が必要です。

/**
 * 時間主導型トリガーによって定期的に実行される関数。
 * 指定されたGoogle Driveフォルダを監視し、新しいファイルがあればインポート処理を実行する。
 */
function checkDriveFolderForNewFiles() {
  const folderId = 'YOUR_GOOGLE_DRIVE_FOLDER_ID'; // TODO: 監視対象のフォルダIDに書き換える

  try {
    const folder = DriveApp.getFolderById(folderId);
    
    // 「imported」サブフォルダを取得または作成
    const subFolders = folder.getFoldersByName('imported');
    const importedFolder = subFolders.hasNext() ? subFolders.next() : folder.createFolder('imported');
    
    const files = folder.getFiles();

    while (files.hasNext()) {
      const file = files.next();
      console.log(`ファイル「${file.getName()}」を処理します。`);
      // ファイルを処理し、成功したら移動する
      const success = processFile(file);
      if (success) {
        file.moveTo(importedFolder);
        console.log(`ファイル「${file.getName()}」を「imported」フォルダに移動しました。`);
      }
    }
  } catch (err) {
    console.error('自動インポート処理中にエラーが発生しました。', err);
  }
}


/**
 * ファイルを処理してインポートを実行する
 * @param {GoogleAppsScript.Drive.File} file 
 * @returns {boolean} 処理が成功したかどうか
 */
function processFile(file) {
  try {
    const fileName = file.getName();
    const fileBlob = file.getBlob();

    // フォーマット定義を取得
    const formats = getCsvFormats();
    let selectedFormat = null;

    // ファイル名に含まれるキーワードでフォーマットを判定
    for (const format of formats) {
      const formatName = format[0];
      if (fileName.toLowerCase().includes(formatName.toLowerCase())) {
        selectedFormat = format;
        break;
      }
    }

    if (!selectedFormat) {
      console.warn(`ファイル名「${fileName}」に合致するCSVフォーマット定義が見つかりませんでした。`);
      return false;
    }

    console.log(`ファイル「${fileName}」をフォーマット「${selectedFormat[0]}」でインポートします。`);

    const encoding = selectedFormat[6];
    const csvData = fileBlob.getDataAsString(encoding);

    // 1. CSVを解析
    const parsedData = parseCsv(csvData, selectedFormat);
    if (parsedData.length === 0) {
      console.warn('CSVから有効なデータを読み取れませんでした。');
      return false;
    }

    // 2. カテゴリを分類
    const categorizedData = categorizeTransactions(parsedData);

    // 3. スプレッドシートに追記
    appendTransactions(categorizedData);

    console.log(`${categorizedData.length}件のデータを自動インポートしました。`);
    return true; // 成功

  } catch (e) {
    console.error(`ファイル「${file.getName()}」の処理中にエラーが発生しました。`, e);
    return false; // 失敗
  }
}
