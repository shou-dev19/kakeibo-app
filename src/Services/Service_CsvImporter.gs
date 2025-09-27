
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

  const [formatName, dateCol, descCol, expenseCol, incomeCol, headerRows, encoding] = format;

  const records = Utilities.parseCsv(csvData);

  // 指定されたヘッダー行数をスキップ
  for (let i = 0; i < headerRows; i++) {
    if (records.length > 0) {
      records.shift();
    }
  }

  const transactions = records.map(record => {
    const date = record[dateCol - 1];
    const description = record[descCol - 1];
    
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
    if (type === '' || !date || date.indexOf('/') === -1) {
      return null;
    }

    // Repositoryに渡す形式 [日付, 内容, 金額, 種別, 金融機関]
    return [date, description, amount, type, formatName];
  }).filter(Boolean); // nullの要素を除外

  console.log(`${transactions.length}件の取引データをCSV(${formatName})から解析しました。`);
  return transactions;
}
