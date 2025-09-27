
/**
 * @fileoverview CSVデータのインポートを担当するサービス層のモジュール
 */

/**
 * CSVデータ（文字列）を、指定されたフォーマット定義に基づいて解析し、取引データの配列に変換する
 * @param {string} csvData - CSVファイルの内容（文字列）
 * @param {Array<any>} format - 使用するCSVフォーマット定義 [FormatName, DateColumn, DescriptionColumn, AmountColumn, HeaderRows, Encoding]
 * @returns {Array<Array<any>>} 取引データの2次元配列 [[日付, 内容, 金額], ...]
 */
function parseCsv(csvData, format) {
  if (!csvData || !format) {
    return [];
  }

  const [formatName, dateCol, descCol, expenseCol, incomeCol, balanceCol, headerRows, encoding] = format;

  const records = Utilities.parseCsv(csvData);

  // 指定されたヘッダー行数をスキップ
  for (let i = 0; i < headerRows; i++) {
    if (records.length > 0) {
      records.shift();
    }
  }

  const transactions = records.map(record => {
    const rawDate = record[dateCol - 1];
    const description = record[descCol - 1];
    
    const date = normalizeDate(rawDate);
    if (!date) {
      return null; // 無効な日付フォーマットの行はスキップ
    }

    let amount = 0;
    let type = '';

    // 収入列を確認
    if (incomeCol && record[incomeCol - 1]) {
      const incomeAmount = parseInt(record[incomeCol - 1].replace(/[,\uffe5]/g, ''), 10);
      if (!isNaN(incomeAmount) && incomeAmount !== 0) {
        amount = incomeAmount;
        type = '収入';
      }
    }

    // 収入でない場合、支出列を確認
    if (type === '' && expenseCol && record[expenseCol - 1]) {
      const expenseAmount = parseInt(record[expenseCol - 1].replace(/[,\uffe5]/g, ''), 10);
      if (!isNaN(expenseAmount) && expenseAmount !== 0) {
        amount = expenseAmount;
        type = '支出';
      }
    }

    // 有効な取引でない場合はスキップ
    if (type === '') {
      return null;
    }

    // 残高を取得
    let balance = null;
    if (balanceCol && record[balanceCol - 1]) {
      const balanceAmount = parseInt(record[balanceCol - 1].replace(/[,\uffe5]/g, ''), 10);
      if (!isNaN(balanceAmount)) {
        balance = balanceAmount;
      }
    }

    // Repositoryに渡す形式 [日付, 内容, 金額, 種別, 金融機関, カテゴリ(空), メモ(空), 残高]
    return [date, description, amount, type, formatName, '', '', balance];
  }).filter(Boolean); // nullの要素を除外

  console.log(`${transactions.length}件の取引データをCSV(${formatName})から解析しました。`);
  return transactions;
}
/**
 * 様々な形式の日付文字列を正規化し、Dateオブジェクトを返す
 * @param {string} dateStr - 日付文字列 (例: '2025/07/12', '250712')
 * @returns {Date|null} 正規化されたDateオブジェクト、または無効な場合はnull
 */
function normalizeDate(dateStr) {
  if (!dateStr) return null;

  // YYYY/MM/DD 形式
  if (dateStr.includes('/')) {
    const d = new Date(dateStr);
    return isNaN(d.getTime()) ? null : d;
  }

  // YYMMDD 形式 (6桁の数字)
  if (/^\d{6}$/.test(dateStr)) {
    const year = parseInt('20' + dateStr.substring(0, 2), 10);
    const month = parseInt(dateStr.substring(2, 4), 10) - 1; // Month is 0-indexed
    const day = parseInt(dateStr.substring(4, 6), 10);
    const d = new Date(year, month, day);
    return isNaN(d.getTime()) ? null : d;
  }

  return null;
}
