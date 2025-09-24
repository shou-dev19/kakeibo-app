
/**
 * @fileoverview 取引データのカテゴリ分類を担当するサービス層のモジュール
 */

/**
 * 取引データ配列を受け取り、カテゴリ分類ルールに基づいて各取引にカテゴリを付与する
 * @param {Array<Array<any>>} transactions - 取引データの2次元配列 [[日付, 内容, 金額], ...]
 * @returns {Array<Array<any>>} カテゴリが付与された取引データの2次元配列 [[日付, 内容, 金額, カテゴリ, メモ], ...]
 */
function categorizeTransactions(transactions) {
  if (!transactions || transactions.length === 0) {
    return [];
  }

  // 設定シートから分類ルールを取得
  const rules = getCategoryRules();
  if (rules.length === 0) {
    console.warn('カテゴリ分類ルールが設定されていません。');
    // カテゴリが空のままデータを返す
    return transactions.map(t => [t[0], t[1], t[2], '', '']);
  }

  const categorizedTransactions = transactions.map(transaction => {
    const description = transaction[1]; // 取引内容
    let category = '未分類'; // デフォルトカテゴリ

    // ルールに合致するかチェック
    for (const rule of rules) {
      const keyword = rule[0];
      const assignedCategory = rule[1];
      if (description.includes(keyword)) {
        category = assignedCategory;
        break; // 最初に見つかったルールを適用
      }
    }
    
    // 元のデータにカテゴリと空のメモを追加して返す
    return [transaction[0], transaction[1], transaction[2], category, ''];
  });

  console.log(`${categorizedTransactions.length}件の取引データをカテゴリ分類しました。`);
  return categorizedTransactions;
}
