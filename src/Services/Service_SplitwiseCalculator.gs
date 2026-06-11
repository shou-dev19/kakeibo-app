
/**
 * @fileoverview 割り勘計算を担当するサービス層のモジュール
 */

/**
 * 指定された年月の取引から、割り勘対象の合計金額を計算する
 * @param {number} year - 対象年
 * @param {number} month - 対象月
 * @returns {{splitTotal: number, fullTotal: number, specialSplitTotal: number, transactions: Array<Array<any>>}} 割り勘計算結果のオブジェクト
 */
function calculateSplitwiseTotal(year, month) {
  // 1. キーワードを取得
  const keywords = getSplitwiseKeywords();
  if (keywords.split.length === 0 && keywords.full.length === 0) {
    SpreadsheetApp.getUi().alert('割り勘・全額請求のキーワードが設定されていません。Settings_Splitwiseシートで定義してください。');
    return { splitTotal: 0, fullTotal: 0, specialSplitTotal: 0, transactions: [] };
  }

  // 2. 指定年月の取引を取得
  const transactions = getTransactionsForMonth(year, month);
  if (transactions.length === 0) {
    return { splitTotal: 0, fullTotal: 0, specialSplitTotal: 0, transactions: [] };
  }

  // 3. キーワードに合致する取引を分類・集計
  const resultTransactions = [];
  let splitTotal = 0;
  let fullTotal = 0;
  let specialSplitTotal = 0;

  transactions.forEach(tx => {
    const description = tx[1];
    const amount = tx[2];
    const type = tx[3];
    const category = tx[5];

    if (type === '支出' && category !== '振替') {
      // 全額請求キーワードを優先
      for (const keyword of keywords.full) {
        if (description.includes(keyword)) {
          fullTotal += amount;
          tx.push('全額請求'); // 計算タイプを追記
          resultTransactions.push(tx);
          return; // 次の取引へ
        }
      }

      // 「ﾖｺﾊﾏｼﾎｲｸﾘﾖｳ」の特別判定
      if (description.includes('ﾖｺﾊﾏｼﾎｲｸﾘﾖｳ')) {
        specialSplitTotal += amount;
        tx.push('特別割り勘(31%)'); // 計算タイプを追記
        resultTransactions.push(tx);
        return; // 次の取引へ
      }

      // 割り勘キーワードをチェック
      for (const keyword of keywords.split) {
        if (description.includes(keyword)) {
          splitTotal += amount;
          tx.push('割り勘'); // 計算タイプを追記
          resultTransactions.push(tx);
          return; // 次の取引へ
        }
      }
    }
  });

  return { splitTotal, fullTotal, specialSplitTotal, transactions: resultTransactions };
}
