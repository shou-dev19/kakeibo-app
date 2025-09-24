
/**
 * @fileoverview CSVデータのインポートを担当するサービス層のモジュール
 */

/**
 * 三井住友カードのCSVデータ（文字列）を解析し、取引データの配列に変換する
 * @param {string} csvData - CSVファイルの内容（文字列）
 * @returns {Array<Array<any>>} 取引データの2次元配列 [[日付, 内容, 金額], ...]
 * 
 * NOTE: 三井住友カードのCSVフォーマット（2025年9月時点を想定）
 * - 文字コード: Shift_JIS
 * - ヘッダー行: 1行目にあり、処理でスキップ
 * - データ形式: 日付,ご利用店名,ご利用金額,...
 */
function parseMitsuiCardCsv(csvData) {
  if (!csvData) {
    return [];
  }

  // Shift_JISでエンコードされていると仮定し、パースする
  // clasp push時にUTF-8に変換されるが、GASのUtilities.parseCsvは正しく処理できる
  const records = Utilities.parseCsv(csvData);

  // ヘッダー行をスキップ
  if (records.length > 0) {
    records.shift();
  }

  const transactions = records.map(record => {
    // 想定される列: [日付, 内容, 金額, ...]
    if (record.length < 3 || !record[0] || !record[2]) {
      return null; // データが不完全な行、日付や金額がない行はスキップ
    }
    const date = record[0];
    const description = record[1];
    const amount = parseInt(record[2], 10); // ご利用金額

    // 日付が "/" を含まない、または金額が有効な数値でない場合はスキップ（合計行などを除外）
    if (date.indexOf('/') === -1 || isNaN(amount)) {
      return null;
    }

    // Repositoryに渡す形式 [日付, 内容, 金額]
    return [date, description, amount];
  }).filter(Boolean); // nullの要素を除外

  console.log(`${transactions.length}件の取引データをCSVから解析しました。`);
  return transactions;
}
