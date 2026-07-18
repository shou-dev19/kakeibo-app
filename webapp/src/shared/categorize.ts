// Category assignment. Pure functions, no runtime/D1 dependencies.
//
// Ported from Service_Categorizer.gs. The GAS version had a hard-coded special
// case (イオンカード × 十日市場 → 食料品) plus keyword rules. Here both are
// unified into `category_rules` rows: the special case is simply a rule with
// `institution = 'イオンカード'`, `keyword = '十日市場'`, `priority = 0`.

import type { CategoryRule } from "./types";

/** Default category when no rule matches. */
export const UNCATEGORIZED = "未分類";

/** The subset of a transaction needed to categorize it. */
export interface Categorizable {
  description: string;
  institution: string | null;
}

/**
 * Determine the category for a single transaction.
 *
 * Rules are evaluated in ascending `priority` order (ties broken by `id` if the
 * caller pre-sorts that way). The first matching rule wins:
 *   - `keyword` must be a substring of `description` (部分一致).
 *   - if `institution` on the rule is non-null, it must exactly equal the
 *     transaction's institution (完全一致).
 * No match => UNCATEGORIZED.
 */
export function categorizeOne(tx: Categorizable, rules: CategoryRule[]): string {
  const description = tx.description ?? "";
  for (const rule of rules) {
    if (rule.institution != null && rule.institution !== "") {
      if (tx.institution !== rule.institution) continue;
    }
    if (description.includes(rule.keyword)) {
      return rule.category;
    }
  }
  return UNCATEGORIZED;
}

/**
 * Sort rules into evaluation order: ascending priority, then ascending id as a
 * stable tiebreaker. Returns a new array; does not mutate the input.
 */
export function sortRules(rules: CategoryRule[]): CategoryRule[] {
  return [...rules].sort((a, b) => a.priority - b.priority || a.id - b.id);
}

/** Categorize a batch of transactions with the given (unsorted) rules. */
export function categorizeMany<T extends Categorizable>(
  txs: T[],
  rules: CategoryRule[],
): (T & { category: string })[] {
  const sorted = sortRules(rules);
  return txs.map((tx) => ({ ...tx, category: categorizeOne(tx, sorted) }));
}
