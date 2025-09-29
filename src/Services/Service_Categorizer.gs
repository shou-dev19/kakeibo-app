
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

  const rules = getCategoryRules();

  const categorizedTransactions = transactions.map(transaction => {
    const description = transaction[1];
    let category = '未分類'; // デフォルトカテゴリ

    // ルールが存在する場合のみ、カテゴリのマッチングを行う
    if (rules.length > 0) {
      for (const rule of rules) {
        const keyword = rule[0];
        const assignedCategory = rule[1];
        if (description.includes(keyword)) {
          category = assignedCategory;
          break;
        }
      }
    }
    
    // 新しい配列を作成して返す
    return [
      transaction[0], // 日付
      transaction[1], // 内容
      transaction[2], // 金額
      transaction[3], // 種別
      transaction[4], // 金融機関
      category,       // ★決定したカテゴリ
      transaction[6], // メモ (現在は空'')
      transaction[7]  // 残高
    ];
  });

  console.log(`${categorizedTransactions.length}件の取引データをカテゴリ分類しました。`);
  return categorizedTransactions;
}

/**
 * DB_Transactionsシートのすべての取引を、最新のルールで再分類する
 */
function reCategorizeAllTransactions() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAMES.DB_TRANSACTIONS);
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) {
    SpreadsheetApp.getUi().alert('取引データがありません。');
    return;
  }

  const range = sheet.getRange(2, 1, lastRow - 1, 8); // 全8列を取得
  const transactions = range.getValues();
  const rules = getCategoryRules();

  if (rules.length === 0) {
    SpreadsheetApp.getUi().alert('カテゴリ分類ルールが設定されていません。');
    return;
  }

  const updatedTransactions = transactions.map(transaction => {
    const description = transaction[1];
    let category = '未分類';

    for (const rule of rules) {
      const keyword = rule[0];
      const assignedCategory = rule[1];
      if (description.includes(keyword)) {
        category = assignedCategory;
        break;
      }
    }
    transaction[5] = category; // カテゴリ列（6番目、index 5）を更新
    return transaction;
  });

  range.setValues(updatedTransactions);
  SpreadsheetApp.getUi().alert(`全${updatedTransactions.length}件の取引カテゴリを更新しました。`);
}
