
/**
 * @fileoverview 割り勘計算を担当するサービス層のモジュール
 */

/**
 * 指定された年月の取引から、割り勘対象の合計金額を計算する
 * @param {number} year - 対象年
 * @param {number} month - 対象月
 * @returns {number} 割り勘対象の合計金額
 */
function calculateSplitwiseTotal(year, month) {
  // 1. 割り勘キーワードを取得
  const keywords = getSplitwiseKeywords();
  if (keywords.length === 0) {
    SpreadsheetApp.getUi().alert('割り勘対象のキーワードが設定されていません。Settingsシートで定義してください。');
    return { total: 0, transactions: [] };
  }

  // 2. 指定年月の取引を取得
  const transactions = getTransactionsForMonth(year, month);
  if (transactions.length === 0) {
    return { total: 0, transactions: [] };
  }

  // 3. キーワードに合致する取引（支出のみ）をフィルタリング
  const splitwiseTransactions = [];
  let total = 0;
  transactions.forEach(tx => {
    const description = tx[1];
    const amount = tx[2];
    const type = tx[3];

    if (type === '支出') {
      for (const keyword of keywords) {
        if (description.includes(keyword)) {
          total += amount;
          splitwiseTransactions.push(tx);
          break; // 該当したら次の取引へ
        }
      }
    }
  });

  return { total: total, transactions: splitwiseTransactions };
}
