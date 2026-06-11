
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
  // 1. キーワードおよび金融機関設定を取得
  const keywords = getSplitwiseKeywords();
  const splitKeywords = keywords.split || [];
  const fullKeywords = keywords.full || [];
  const splitInstitutions = keywords.splitInstitutions || [];
  const fullInstitutions = keywords.fullInstitutions || [];

  if (splitKeywords.length === 0 && fullKeywords.length === 0 && splitInstitutions.length === 0 && fullInstitutions.length === 0) {
    SpreadsheetApp.getUi().alert('割り勘・全額請求のキーワードまたは金融機関が設定されていません。Settings_Splitwiseシートで定義してください。');
    return { splitTotal: 0, fullTotal: 0, specialSplitTotal: 0, transactions: [] };
  }

  // 2. 指定年月の取引を取得
  const transactions = getTransactionsForMonth(year, month);
  if (transactions.length === 0) {
    return { splitTotal: 0, fullTotal: 0, specialSplitTotal: 0, transactions: [] };
  }

  // 3. ルールに合致する取引を分類・集計
  const resultTransactions = [];
  let splitTotal = 0;
  let fullTotal = 0;
  let specialSplitTotal = 0;

  transactions.forEach(tx => {
    const description = tx[1];
    const amount = tx[2];
    const type = tx[3];
    const institution = tx[4] || ''; // 金融機関名 (E列)
    const category = tx[5];

    if (type === '支出' && category !== '振替') {
      // 1. 全額請求金融機関 (部分一致) を優先
      for (const inst of fullInstitutions) {
        if (institution.includes(inst)) {
          fullTotal += amount;
          tx.push('全額請求'); // 計算タイプを追記
          resultTransactions.push(tx);
          return; // 次の取引へ
        }
      }

      // 2. 割り勘金融機関 (部分一致)
      for (const inst of splitInstitutions) {
        if (institution.includes(inst)) {
          splitTotal += amount;
          tx.push('割り勘'); // 計算タイプを追記
          resultTransactions.push(tx);
          return; // 次の取引へ
        }
      }

      // 3. 全額請求キーワードをチェック
      for (const keyword of fullKeywords) {
        if (description.includes(keyword)) {
          fullTotal += amount;
          tx.push('全額請求'); // 計算タイプを追記
          resultTransactions.push(tx);
          return; // 次の取引へ
        }
      }

      // 4. 「ﾖｺﾊﾏｼﾎｲｸﾘﾖｳ」の特別判定
      if (description.includes('ﾖｺﾊﾏｼﾎｲｸﾘﾖｳ')) {
        specialSplitTotal += amount;
        tx.push('特別割り勘(31%)'); // 計算タイプを追記
        resultTransactions.push(tx);
        return; // 次の取引へ
      }

      // 5. 割り勘キーワードをチェック
      for (const keyword of splitKeywords) {
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
