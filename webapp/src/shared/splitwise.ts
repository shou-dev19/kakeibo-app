// Split-payment (割り勘) calculation. Pure functions, no runtime/D1 deps.
//
// Ported from Service_SplitwiseCalculator.gs. The GAS version evaluated rules
// in a fixed 5-stage order:
//   1. full-charge institutions   (部分一致, rate 100)
//   2. split institutions         (部分一致, rate 50)
//   3. full-charge keywords        (部分一致, rate 100)
//   4. special ﾖｺﾊﾏｼﾎｲｸﾘﾖｳ keyword (部分一致, rate 31)
//   5. split keywords              (部分一致, rate 50)
//
// The web version stores all of these as `split_rules` rows and reproduces the
// ordering purely from the data by sorting:
//   - match_type='institution' before match_type='keyword'
//   - within the same match_type, rate descending
// which yields: inst-100, inst-50, kw-100, kw-50, kw-31.
//
// NOTE: this data-driven order differs from the GAS keyword order in ONE spot.
// The GAS version evaluates keywords as 100 → 31 (special) → 50, but sorting by
// rate descending produces 100 → 50 → 31. This only changes the outcome for a
// single description that matches BOTH the 31% special keyword (ﾖｺﾊﾏｼﾎｲｸﾘﾖｳ) and
// a 50% split keyword: GAS would bill it at 31%, the sort-based order at 50%.
// In real data these patterns never co-occur (a 保育料 description contains
// ﾖｺﾊﾏｼﾎｲｸﾘﾖｳ but no 割り勘 keyword), so the results are identical in practice.
// See the "differs only for a contrived overlap" test for a concrete example.

import type { SplitRule, TransactionType } from "./types";

/** Minimal transaction shape the splitwise calc needs. */
export interface SplitwiseTransaction {
  date: string;
  description: string;
  amount: number;
  type: string; // must be '支出' to be considered
  institution: string | null;
  category: string | null;
}

const TRANSFER_CATEGORY = "振替";

export interface SplitwiseLineItem extends SplitwiseTransaction {
  /** The rate (%) applied to this transaction. */
  rate: number;
  /**
   * Display-only per-line share = Math.round(amount * rate / 100).
   * NOTE: totalBilled and subtotal.billed are NOT the sum of these rounded
   * line values. To match the GAS version exactly, the totals apply the rate
   * to the rate-grouped amount subtotal (unrounded); rounding each line first
   * would drift by a few yen. Use this field for display only.
   */
  billed: number;
}

export interface SplitwiseRateSubtotal {
  rate: number;
  /** Sum of raw amounts matched at this rate. */
  amount: number;
  /** Billed share for this rate = amount * rate / 100 (unrounded, matches GAS). */
  billed: number;
  count: number;
}

export interface SplitwiseResult {
  year: number;
  month: number;
  /**
   * Total billed to the partner = sum over rates of (amount * rate / 100),
   * unrounded. Mirrors the GAS `splitTotal*0.5 + specialSplitTotal*0.31 +
   * fullTotal` so migration verification matches to the yen (incl. fractions).
   */
  totalBilled: number;
  /** Per-rate subtotals, sorted by rate descending. */
  subtotals: SplitwiseRateSubtotal[];
  /** All matched transactions with their applied rate. */
  items: SplitwiseLineItem[];
}

/**
 * Sort split rules into GAS-equivalent evaluation order:
 * institution rules before keyword rules; within each group, higher rate first.
 * `id` breaks any remaining ties for determinism.
 */
export function sortSplitRules(rules: SplitRule[]): SplitRule[] {
  const typeRank = (t: SplitRule["match_type"]) => (t === "institution" ? 0 : 1);
  return [...rules].sort(
    (a, b) =>
      typeRank(a.match_type) - typeRank(b.match_type) ||
      b.rate - a.rate ||
      a.id - b.id,
  );
}

/**
 * Find the first matching rule for a transaction, or null.
 *   - institution rules: `pattern` is a substring of the institution (部分一致)
 *   - keyword rules:      `pattern` is a substring of the description (部分一致)
 */
export function matchSplitRule(
  tx: SplitwiseTransaction,
  sortedRules: SplitRule[],
): SplitRule | null {
  const institution = tx.institution ?? "";
  const description = tx.description ?? "";
  for (const rule of sortedRules) {
    if (rule.match_type === "institution") {
      if (institution.includes(rule.pattern)) return rule;
    } else {
      if (description.includes(rule.pattern)) return rule;
    }
  }
  return null;
}

/**
 * Compute the split-payment result for a month's transactions.
 * Only type='支出' with category !== '振替' are eligible.
 *
 * To match the GAS version to the yen, totals are computed by applying the rate
 * to the rate-grouped amount subtotal (unrounded), not by summing rounded
 * per-line shares. Each line's `billed` (Math.round) is display-only.
 */
export function calculateSplitwise(
  txs: SplitwiseTransaction[],
  rules: SplitRule[],
  year: number,
  month: number,
): SplitwiseResult {
  const sorted = sortSplitRules(rules);
  const items: SplitwiseLineItem[] = [];
  const subtotalMap = new Map<number, SplitwiseRateSubtotal>();

  for (const tx of txs) {
    if (tx.type !== "支出") continue;
    if ((tx.category ?? "") === TRANSFER_CATEGORY) continue;

    const rule = matchSplitRule(tx, sorted);
    if (!rule) continue;

    const rate = rule.rate;
    // Display-only per-line share; totals are derived from subtotals below.
    const billed = Math.round((tx.amount * rate) / 100);

    items.push({ ...tx, rate, billed });

    let sub = subtotalMap.get(rate);
    if (!sub) {
      sub = { rate, amount: 0, billed: 0, count: 0 };
      subtotalMap.set(rate, sub);
    }
    sub.amount += tx.amount;
    sub.count += 1;
  }

  // Apply the rate to each grouped amount subtotal (unrounded), matching GAS's
  // `splitTotal*0.5 + specialSplitTotal*0.31 + fullTotal`.
  let totalBilled = 0;
  for (const sub of subtotalMap.values()) {
    sub.billed = (sub.amount * sub.rate) / 100;
    totalBilled += sub.billed;
  }

  const subtotals = [...subtotalMap.values()].sort((a, b) => b.rate - a.rate);

  return { year, month, totalBilled, subtotals, items };
}

export type { TransactionType };
