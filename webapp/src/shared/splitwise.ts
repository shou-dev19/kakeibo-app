// Split-payment (割り勘) calculation. Pure functions, no runtime/D1 deps.
//
// `rate` means "妻の負担率 (%)" and is independent of who actually paid. The GAS
// original framed this as "夫視点での妻への請求額", which only worked while the
// husband was the sole importer. Now that both spouses' transactions are stored,
// the same rules are read objectively: every eligible expense is split into
// 夫負担額 / 妻負担額 regardless of whose card it went through. The stored rates
// already meant "the partner's (= the wife's) share", so no data migration is
// needed — only the framing changes.
//
// 夫負担額 is derived by subtraction (総額 − 妻負担額) so that the two shares
// always add back up to the total, whatever the rounding.
//
// Ported from Service_SplitwiseCalculator.gs. The GAS version evaluated rules
// in a fixed 5-stage order:
//   1. full-charge institutions   (部分一致, rate 100)
//   2. split institutions         (部分一致, rate 50)
//   3. full-charge keywords        (部分一致, rate 100)
//   4. special ﾖｺﾊﾏｼﾎｲｸﾘﾖｳ keyword (部分一致, rate 31)
//   5. split keywords              (部分一致, rate 50)
//
// The web version stores all of these as `split_rules` rows. Users can control
// overlap resolution with `priority` (smaller values win). Rules are sorted by:
//   - priority ascending
//   - within the same priority, match_type='institution' before 'keyword'
//   - within the same match_type, rate descending
//   - id ascending
// Existing rules all receive priority=100 from the migration default, so their
// evaluation order and results remain unchanged.
//
// NOTE: when priorities are equal, this data-driven order differs from the GAS
// keyword order in ONE spot. GAS evaluates keywords as 100 → 31 (special) → 50,
// while the rate-descending tie-break produces 100 → 50 → 31. This preserves
// the web app's pre-priority behavior. Users can explicitly override it by
// assigning a smaller priority to the rule that should win.

import type { Owner, SplitRule, TransactionType } from "./types";

/** Minimal transaction shape the splitwise calc needs. */
export interface SplitwiseTransaction {
  /** 実際に支払った利用者。精算額の算出に使う。 */
  owner: Owner;
  date: string;
  description: string;
  amount: number;
  type: string; // must be '支出' to be considered
  institution: string | null;
  category: string | null;
}

const TRANSFER_CATEGORY = "振替";

export interface SplitwiseLineItem extends SplitwiseTransaction {
  /** 妻の負担率 (%). */
  rate: number;
  /**
   * Display-only per-line wife's share = Math.round(amount * rate / 100).
   * NOTE: wifeShare and subtotal.wifeShare are NOT the sum of these rounded
   * line values. To match the GAS version exactly, the totals apply the rate
   * to the rate-grouped amount subtotal (unrounded); rounding each line first
   * would drift by a few yen. Use this field for display only.
   */
  wifeShare: number;
}

export interface SplitwiseRateSubtotal {
  rate: number;
  /** Sum of raw amounts matched at this rate. */
  amount: number;
  /** 妻負担額 = amount * rate / 100 (unrounded, matches GAS). */
  wifeShare: number;
  /** 夫負担額 = amount - wifeShare. */
  husbandShare: number;
  count: number;
}

export interface SplitwiseResult {
  year: number;
  month: number;
  /** 割り勘対象 (ルールに一致した支出) の総額。 */
  totalAmount: number;
  /**
   * 妻負担額 = sum over rates of (amount * rate / 100), unrounded. Mirrors the
   * GAS `splitTotal*0.5 + specialSplitTotal*0.31 + fullTotal`, which was framed
   * as "妻への請求額" — the same number, now named for what it is.
   */
  wifeShare: number;
  /** 夫負担額 = totalAmount - wifeShare (引き算なので合計が必ず一致する)。 */
  husbandShare: number;
  /** 夫が実際に立て替えた額 (owner='husband' の対象明細の合計)。 */
  husbandPaid: number;
  /** 妻が実際に立て替えた額。 */
  wifePaid: number;
  /**
   * 精算額 = wifeShare - wifePaid。
   * 正なら妻から夫へ、負なら夫から妻へ支払う。
   */
  settlement: number;
  /** Per-rate subtotals, sorted by rate descending. */
  subtotals: SplitwiseRateSubtotal[];
  /** All matched transactions with their applied rate. */
  items: SplitwiseLineItem[];
}

/**
 * Sort split rules into evaluation order. Smaller priority values win. Within
 * the same priority, preserve the existing tie-break order: institution rules
 * before keyword rules, higher rate first, then lower id for determinism.
 */
export function sortSplitRules(rules: SplitRule[]): SplitRule[] {
  const typeRank = (t: SplitRule["match_type"]) => (t === "institution" ? 0 : 1);
  return [...rules].sort(
    (a, b) =>
      a.priority - b.priority ||
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
 * Find the first matching rule for an eligible split-payment transaction.
 * Only expenses outside the transfer category can be split. The caller owns
 * sorting `sortedRules`; this function preserves that supplied precedence.
 */
export function matchEligibleSplitRule(
  tx: SplitwiseTransaction,
  sortedRules: SplitRule[],
): SplitRule | null {
  if (tx.type !== "支出") return null;
  if ((tx.category ?? "") === TRANSFER_CATEGORY) return null;

  return matchSplitRule(tx, sortedRules);
}

/**
 * Compute the split-payment result for a month's transactions, across BOTH
 * users. Only type='支出' with category !== '振替' that match a rule are
 * eligible; anything else is treated as that person's own personal spending and
 * stays out of the split entirely.
 *
 * To match the GAS version to the yen, totals are computed by applying the rate
 * to the rate-grouped amount subtotal (unrounded), not by summing rounded
 * per-line shares. Each line's `wifeShare` (Math.round) is display-only.
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
  let totalAmount = 0;
  let husbandPaid = 0;
  let wifePaid = 0;

  for (const tx of txs) {
    const rule = matchEligibleSplitRule(tx, sorted);
    if (!rule) continue;

    const rate = rule.rate;
    // Display-only per-line share; totals are derived from subtotals below.
    const wifeShare = Math.round((tx.amount * rate) / 100);

    items.push({ ...tx, rate, wifeShare });

    totalAmount += tx.amount;
    if (tx.owner === "wife") wifePaid += tx.amount;
    else husbandPaid += tx.amount;

    let sub = subtotalMap.get(rate);
    if (!sub) {
      sub = { rate, amount: 0, wifeShare: 0, husbandShare: 0, count: 0 };
      subtotalMap.set(rate, sub);
    }
    sub.amount += tx.amount;
    sub.count += 1;
  }

  // Apply the rate to each grouped amount subtotal (unrounded), matching GAS's
  // `splitTotal*0.5 + specialSplitTotal*0.31 + fullTotal`.
  let wifeShare = 0;
  for (const sub of subtotalMap.values()) {
    sub.wifeShare = (sub.amount * sub.rate) / 100;
    sub.husbandShare = sub.amount - sub.wifeShare;
    wifeShare += sub.wifeShare;
  }
  // Subtraction, not a second rate application: guarantees the two shares add
  // back up to totalAmount exactly, however the fractions fall.
  const husbandShare = totalAmount - wifeShare;

  const subtotals = [...subtotalMap.values()].sort((a, b) => b.rate - a.rate);

  return {
    year,
    month,
    totalAmount,
    wifeShare,
    husbandShare,
    husbandPaid,
    wifePaid,
    settlement: wifeShare - wifePaid,
    subtotals,
    items,
  };
}

export type { TransactionType };
