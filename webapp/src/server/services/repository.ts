// D1 data-access layer. Thin wrappers around SQL so route handlers and the
// import/report services stay free of raw query strings. Business logic lives
// in src/shared/*; this file only reads/writes.

import type {
  CategoryRule,
  CsvFormat,
  ExcludedCategory,
  ExclusionScope,
  SecuritiesBalance,
  SplitRule,
  Transaction,
} from "../../shared/types";

// --- Settings: category rules ---------------------------------------------

export async function getCategoryRules(db: D1Database): Promise<CategoryRule[]> {
  const { results } = await db
    .prepare(
      "SELECT id, keyword, institution, category, priority FROM category_rules ORDER BY priority ASC, id ASC",
    )
    .all<CategoryRule>();
  return results;
}

export async function insertCategoryRule(
  db: D1Database,
  rule: Omit<CategoryRule, "id">,
): Promise<number> {
  const res = await db
    .prepare(
      "INSERT INTO category_rules (keyword, institution, category, priority) VALUES (?, ?, ?, ?)",
    )
    .bind(rule.keyword, rule.institution, rule.category, rule.priority)
    .run();
  return res.meta.last_row_id as number;
}

export async function updateCategoryRule(
  db: D1Database,
  id: number,
  rule: Omit<CategoryRule, "id">,
): Promise<void> {
  await db
    .prepare(
      "UPDATE category_rules SET keyword = ?, institution = ?, category = ?, priority = ? WHERE id = ?",
    )
    .bind(rule.keyword, rule.institution, rule.category, rule.priority, id)
    .run();
}

export async function deleteCategoryRule(db: D1Database, id: number): Promise<void> {
  await db.prepare("DELETE FROM category_rules WHERE id = ?").bind(id).run();
}

// --- Settings: CSV formats -------------------------------------------------

export async function getCsvFormats(db: D1Database): Promise<CsvFormat[]> {
  const { results } = await db
    .prepare(
      "SELECT id, name, date_col, desc_col, expense_col, income_col, balance_col, header_rows, encoding FROM csv_formats ORDER BY id ASC",
    )
    .all<CsvFormat>();
  return results;
}

export async function insertCsvFormat(
  db: D1Database,
  f: Omit<CsvFormat, "id">,
): Promise<number> {
  const res = await db
    .prepare(
      "INSERT INTO csv_formats (name, date_col, desc_col, expense_col, income_col, balance_col, header_rows, encoding) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    )
    .bind(
      f.name,
      f.date_col,
      f.desc_col,
      f.expense_col,
      f.income_col,
      f.balance_col,
      f.header_rows,
      f.encoding,
    )
    .run();
  return res.meta.last_row_id as number;
}

export async function updateCsvFormat(
  db: D1Database,
  id: number,
  f: Omit<CsvFormat, "id">,
): Promise<void> {
  await db
    .prepare(
      "UPDATE csv_formats SET name = ?, date_col = ?, desc_col = ?, expense_col = ?, income_col = ?, balance_col = ?, header_rows = ?, encoding = ? WHERE id = ?",
    )
    .bind(
      f.name,
      f.date_col,
      f.desc_col,
      f.expense_col,
      f.income_col,
      f.balance_col,
      f.header_rows,
      f.encoding,
      id,
    )
    .run();
}

export async function deleteCsvFormat(db: D1Database, id: number): Promise<void> {
  await db.prepare("DELETE FROM csv_formats WHERE id = ?").bind(id).run();
}

// --- Settings: split rules -------------------------------------------------

export async function getSplitRules(db: D1Database): Promise<SplitRule[]> {
  const { results } = await db
    .prepare("SELECT id, match_type, pattern, rate FROM split_rules ORDER BY id ASC")
    .all<SplitRule>();
  return results;
}

export async function insertSplitRule(
  db: D1Database,
  r: Omit<SplitRule, "id">,
): Promise<number> {
  const res = await db
    .prepare("INSERT INTO split_rules (match_type, pattern, rate) VALUES (?, ?, ?)")
    .bind(r.match_type, r.pattern, r.rate)
    .run();
  return res.meta.last_row_id as number;
}

export async function updateSplitRule(
  db: D1Database,
  id: number,
  r: Omit<SplitRule, "id">,
): Promise<void> {
  await db
    .prepare("UPDATE split_rules SET match_type = ?, pattern = ?, rate = ? WHERE id = ?")
    .bind(r.match_type, r.pattern, r.rate, id)
    .run();
}

export async function deleteSplitRule(db: D1Database, id: number): Promise<void> {
  await db.prepare("DELETE FROM split_rules WHERE id = ?").bind(id).run();
}

// --- Settings: excluded categories -----------------------------------------

export async function getExcludedCategories(
  db: D1Database,
): Promise<ExcludedCategory[]> {
  const { results } = await db
    .prepare("SELECT id, category, scope FROM excluded_categories ORDER BY id ASC")
    .all<ExcludedCategory>();
  return results;
}

export async function getExcludedByScope(
  db: D1Database,
  scope: ExclusionScope,
): Promise<string[]> {
  const { results } = await db
    .prepare("SELECT category FROM excluded_categories WHERE scope = ?")
    .bind(scope)
    .all<{ category: string }>();
  return results.map((r) => r.category);
}

export async function insertExcludedCategory(
  db: D1Database,
  category: string,
  scope: ExclusionScope,
): Promise<number> {
  const res = await db
    .prepare("INSERT INTO excluded_categories (category, scope) VALUES (?, ?)")
    .bind(category, scope)
    .run();
  return res.meta.last_row_id as number;
}

export async function deleteExcludedCategory(
  db: D1Database,
  id: number,
): Promise<void> {
  await db.prepare("DELETE FROM excluded_categories WHERE id = ?").bind(id).run();
}

// --- Securities ------------------------------------------------------------

export async function getSecurities(db: D1Database): Promise<SecuritiesBalance[]> {
  const { results } = await db
    .prepare("SELECT id, date, brokerage, value FROM securities_balances ORDER BY date ASC, id ASC")
    .all<SecuritiesBalance>();
  return results;
}

export async function insertSecurity(
  db: D1Database,
  s: Omit<SecuritiesBalance, "id">,
): Promise<number> {
  const res = await db
    .prepare("INSERT INTO securities_balances (date, brokerage, value) VALUES (?, ?, ?)")
    .bind(s.date, s.brokerage, s.value)
    .run();
  return res.meta.last_row_id as number;
}

export async function deleteSecurity(db: D1Database, id: number): Promise<void> {
  await db.prepare("DELETE FROM securities_balances WHERE id = ?").bind(id).run();
}

// --- Transactions ----------------------------------------------------------

export interface TransactionFilter {
  year?: number;
  month?: number;
  category?: string;
  institution?: string;
  keyword?: string;
  limit?: number;
  offset?: number;
}

export interface TransactionPage {
  items: Transaction[];
  total: number;
  limit: number;
  offset: number;
}

/** Build the shared WHERE clause + bindings for transaction queries. */
function buildTransactionWhere(filter: TransactionFilter): {
  clause: string;
  binds: unknown[];
} {
  const conds: string[] = [];
  const binds: unknown[] = [];

  if (filter.year != null && filter.month != null) {
    conds.push("date LIKE ?");
    binds.push(`${filter.year}-${String(filter.month).padStart(2, "0")}-%`);
  } else if (filter.year != null) {
    conds.push("date LIKE ?");
    binds.push(`${filter.year}-%`);
  }
  if (filter.category != null && filter.category !== "") {
    conds.push("category = ?");
    binds.push(filter.category);
  }
  if (filter.institution != null && filter.institution !== "") {
    conds.push("institution = ?");
    binds.push(filter.institution);
  }
  if (filter.keyword != null && filter.keyword !== "") {
    conds.push("(description LIKE ? OR memo LIKE ?)");
    binds.push(`%${filter.keyword}%`, `%${filter.keyword}%`);
  }

  const clause = conds.length > 0 ? `WHERE ${conds.join(" AND ")}` : "";
  return { clause, binds };
}

export async function listTransactions(
  db: D1Database,
  filter: TransactionFilter,
): Promise<TransactionPage> {
  const { clause, binds } = buildTransactionWhere(filter);
  const limit = filter.limit ?? 100;
  const offset = filter.offset ?? 0;

  const countRow = await db
    .prepare(`SELECT COUNT(*) AS count FROM transactions ${clause}`)
    .bind(...binds)
    .first<{ count: number }>();
  const total = countRow?.count ?? 0;

  const { results } = await db
    .prepare(
      `SELECT id, date, description, amount, type, institution, category, memo, balance, import_hash, created_at
       FROM transactions ${clause}
       ORDER BY date DESC, id DESC
       LIMIT ? OFFSET ?`,
    )
    .bind(...binds, limit, offset)
    .all<Transaction>();

  return { items: results, total, limit, offset };
}

/** Fetch all transactions (for reports), ordered by date/id ascending. */
export async function getAllTransactions(db: D1Database): Promise<Transaction[]> {
  const { results } = await db
    .prepare(
      "SELECT id, date, description, amount, type, institution, category, memo, balance, import_hash, created_at FROM transactions ORDER BY date ASC, id ASC",
    )
    .all<Transaction>();
  return results;
}

export async function getTransactionsForMonth(
  db: D1Database,
  year: number,
  month: number,
): Promise<Transaction[]> {
  const { results } = await db
    .prepare(
      `SELECT id, date, description, amount, type, institution, category, memo, balance, import_hash, created_at
       FROM transactions WHERE date LIKE ? ORDER BY date ASC, id ASC`,
    )
    .bind(`${year}-${String(month).padStart(2, "0")}-%`)
    .all<Transaction>();
  return results;
}

export async function updateTransactionFields(
  db: D1Database,
  id: number,
  fields: { category?: string | null; memo?: string | null },
): Promise<void> {
  const sets: string[] = [];
  const binds: unknown[] = [];
  if (Object.prototype.hasOwnProperty.call(fields, "category")) {
    sets.push("category = ?");
    binds.push(fields.category ?? null);
  }
  if (Object.prototype.hasOwnProperty.call(fields, "memo")) {
    sets.push("memo = ?");
    binds.push(fields.memo ?? null);
  }
  if (sets.length === 0) return;
  binds.push(id);
  await db
    .prepare(`UPDATE transactions SET ${sets.join(", ")} WHERE id = ?`)
    .bind(...binds)
    .run();
}

export async function deleteTransaction(db: D1Database, id: number): Promise<void> {
  await db.prepare("DELETE FROM transactions WHERE id = ?").bind(id).run();
}

export async function updateTransactionCategory(
  db: D1Database,
  id: number,
  category: string,
): Promise<void> {
  await db
    .prepare("UPDATE transactions SET category = ? WHERE id = ?")
    .bind(category, id)
    .run();
}

/** Fetch the set of all existing import_hash values (for preview dup checks). */
export async function getExistingImportHashes(
  db: D1Database,
): Promise<Set<string>> {
  const { results } = await db
    .prepare("SELECT import_hash FROM transactions")
    .all<{ import_hash: string }>();
  return new Set(results.map((r) => r.import_hash));
}

export interface InsertableTransaction {
  date: string;
  description: string;
  amount: number;
  type: string;
  institution: string | null;
  category: string | null;
  memo: string | null;
  balance: number | null;
  import_hash: string;
}

/**
 * Insert a transaction, skipping (returning false) on an import_hash UNIQUE
 * violation. `INSERT OR IGNORE` makes duplicate rows a no-op; we detect skips
 * via the affected-row count.
 */
export async function insertTransactionIgnoreDup(
  db: D1Database,
  tx: InsertableTransaction,
): Promise<boolean> {
  const res = await db
    .prepare(
      `INSERT OR IGNORE INTO transactions
        (date, description, amount, type, institution, category, memo, balance, import_hash)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      tx.date,
      tx.description,
      tx.amount,
      tx.type,
      tx.institution,
      tx.category,
      tx.memo,
      tx.balance,
      tx.import_hash,
    )
    .run();
  // meta.changes is 1 on insert, 0 when the row was ignored as a duplicate.
  return (res.meta.changes ?? 0) > 0;
}
