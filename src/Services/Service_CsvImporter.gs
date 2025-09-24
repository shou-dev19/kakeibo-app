
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

  const [formatName, dateCol, descCol, amountCol, headerRows, encoding] = format;

  // parseCsvはShift_JISでも動作するが、明示的に文字コードを指定してパースするのが望ましい
  // ただし、GASの標準機能ではBlobの文字コード変換が一手間かかるため、ここではUtilities.parseCsvに任せる
  const records = Utilities.parseCsv(csvData);

  // 指定されたヘッダー行数をスキップ
  for (let i = 0; i < headerRows; i++) {
    if (records.length > 0) {
      records.shift();
    }
  }

  const transactions = records.map(record => {
    // 列番号は1-basedなので、配列アクセス用に-1する
    const date = record[dateCol - 1];
    const description = record[descCol - 1];
    const amountStr = record[amountCol - 1];

    // データが不完全な行はスキップ
    if (!date || !description || !amountStr) {
      return null;
    }
    
    // 金額からカンマや通貨記号などを取り除く
    const amount = parseInt(amountStr.replace(/[,\uffe5]/g, ''), 10);

    // 日付形式の簡易チェックと、金額が有効な数値でない場合はスキップ
    if (date.indexOf('/') === -1 || isNaN(amount)) {
      return null;
    }

    // Repositoryに渡す形式 [日付, 内容, 金額]
    return [date, description, amount];
  }).filter(Boolean); // nullの要素を除外

  console.log(`${transactions.length}件の取引データをCSV(${formatName})から解析しました。`);
  return transactions;
}
