// Bulk re-categorization: re-apply the latest category rules to every stored
// transaction. Mirrors reCategorizeAllTransactions in Service_Categorizer.gs.

import { categorizeOne, sortRules } from "../../shared/categorize";
import {
  getAllTransactions,
  getCategoryRules,
  updateTransactionCategory,
} from "./repository";

export interface RecategorizeResult {
  updated: number;
  total: number;
  skippedLocked: number;
}

/**
 * Recompute the category for all transactions using current rules and persist
 * any that changed. Returns how many rows were updated out of the total.
 */
export async function recategorizeAll(db: D1Database): Promise<RecategorizeResult> {
  const [txs, rules] = await Promise.all([
    getAllTransactions(db),
    getCategoryRules(db),
  ]);
  const sorted = sortRules(rules);

  let updated = 0;
  let skippedLocked = 0;
  for (const tx of txs) {
    if (tx.category_locked === 1) {
      skippedLocked += 1;
      continue;
    }
    const next = categorizeOne(
      { description: tx.description, institution: tx.institution },
      sorted,
    );
    if (next !== (tx.category ?? "未分類")) {
      await updateTransactionCategory(db, tx.id, next);
      updated += 1;
    }
  }
  return { updated, total: txs.length, skippedLocked };
}
