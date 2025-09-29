
/**
 * @fileoverview トリガーによって実行される関数を管理するモジュール
 */

// NOTE: このファイル内の関数をトリガーとして設定するには、Apps Scriptのエディタから手動で設定が必要です。

/**
 * 時間主導型トリガーによって定期的に実行される関数。
 * 指定されたGoogle Driveフォルダを監視し、新しいファイルがあればインポート処理を実行する。
 */

/**
 * @fileoverview トリガーによって実行される関数を管理するモジュール
 */

// NOTE: このファイル内の関数をトリガーとして設定するには、Apps Scriptのエディタから手動で設定が必要です。

/**
 * 時間主導型トリガーによって定期的に実行される関数。
 * 指定されたGoogle Driveのルートフォルダ配下を再帰的に探索し、新しいCSVファイルがあればインポート処理を実行する。
 */
function checkDriveFolderForNewFiles() {
  const properties = PropertiesService.getScriptProperties();
  const rootFolderId = properties.getProperty('DRIVE_ROOT_FOLDER_ID');

  if (!rootFolderId) {
    console.error('監視対象のルートフォルダIDがスクリプトプロパティに設定されていません。プロパティ名: DRIVE_ROOT_FOLDER_ID');
    return;
  }

  try {
    const rootFolder = DriveApp.getFolderById(rootFolderId);
    processFolder(rootFolder);
  } catch (err) {
    console.error('自動インポート処理中にエラーが発生しました。', err);
  }
}

/**
 * 指定されたフォルダ内のファイルを処理し、サブフォルダがあれば再帰的に探索する
 * @param {GoogleAppsScript.Drive.Folder} folder 
 */
function processFolder(folder) {
  // 1. 各金融機関のフォルダを処理
  const subFolders = folder.getFolders();
  while (subFolders.hasNext()) {
    const financialInstitutionFolder = subFolders.next();
    // `imported`フォルダ自体はスキップ
    if (financialInstitutionFolder.getName() === 'imported') {
      continue;
    }
    
    console.log(`フォルダ「${financialInstitutionFolder.getName()}」をチェックしています...`);

    // 2. `imported`サブフォルダを取得または作成
    const importedFolders = financialInstitutionFolder.getFoldersByName('imported');
    const importedFolder = importedFolders.hasNext() ? importedFolders.next() : financialInstitutionFolder.createFolder('imported');

    // 3. フォルダ内のCSVファイルを処理
    const files = financialInstitutionFolder.getFilesByType(MimeType.CSV);
    while (files.hasNext()) {
      const file = files.next();
      const success = processFile(file, financialInstitutionFolder.getName());
      if (success) {
        file.moveTo(importedFolder);
        console.log(`ファイル「${file.getName()}」を「imported」フォルダに移動しました。`);
      }
    }
  }
}


/**
 * ファイルを処理してインポートを実行する
 * @param {GoogleAppsScript.Drive.File} file 
 * @param {string} formatName - ファイルが置かれているフォルダ名（金融機関名）
 * @returns {boolean} 処理が成功したかどうか
 */
function processFile(file, formatName) {
  try {
    const fileName = file.getName();
    const fileBlob = file.getBlob();

    // フォーマット定義を取得
    const formats = getCsvFormats();
    const selectedFormat = formats.find(f => f[0] === formatName);

    if (!selectedFormat) {
      console.warn(`フォルダ名「${formatName}」に合致するCSVフォーマット定義が見つかりませんでした。ファイル「${fileName}」はスキップされます。`);
      return false;
    }

    // 古い7列の定義を補完する
    if (selectedFormat.length === 7) {
      selectedFormat.splice(5, 0, ''); // 5番目の位置（BalanceColumn）に空文字を挿入
    }

    console.log(`ファイル「${fileName}」をフォーマット「${formatName}」でインポートします。`);

    const encoding = selectedFormat[7];
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
