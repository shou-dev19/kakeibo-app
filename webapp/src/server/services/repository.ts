// D1 data-access layer. Thin wrappers around SQL so route handlers and the
// import/report services stay free of raw query strings. Business logic lives
// in src/shared/*; this file only reads/writes.

import type {
  CategoryRule,
  CsvFormat,
  ExcludedCategory,
  ExclusionScope,
  Owner,
  OwnerScope,
  SecuritiesBalance,
  SplitRule,
  Transaction,
} from "../../shared/types";

/**
 * Build the owner condition for a read query. `'all'` (夫婦合算) adds nothing,
 * so callers can splice the result into any WHERE clause unconditionally.
 */
function ownerCondition(
  scope: OwnerScope,
  column = "owner",
): { conds: string[]; binds: unknown[] } {
  if (scope === "all") return { conds: [], binds: [] };
  return { conds: [`${column} = ?`], binds: [scope] };
}

/** Same as `ownerCondition` but rendered as a leading `WHERE`/`AND` fragment. */
function ownerClause(scope: OwnerScope, keyword: "WHERE" | "AND"): string {
  return scope === "all" ? "" : ` ${keyword} owner = ?`;
}

/** Bindings that pair with `ownerClause`. */
function ownerBinds(scope: OwnerScope): unknown[] {
  return scope === "all" ? [] : [scope];
}

// --- Settings: categories -------------------------------------------------

/**
 * Return every non-blank category name currently stored by the application.
 *
 * Deliberately NOT scoped by owner. Classification *rules* are per-user, but the
 * category *vocabulary* is shared: excluded categories and the combined reports
 * both match on category name, so letting the two users' names drift apart would
 * make combined reports unreadable. Sourcing the list from both users means a
 * category one of them invents shows up in the other's pickers automatically.
 */
export async function getCategories(db: D1Database): Promise<string[]> {
  const { results } = await db
    .prepare(
      `SELECT category
       FROM (
         SELECT category FROM category_rules
         UNION
         SELECT category FROM transactions
         UNION
         SELECT category FROM excluded_categories
       )
       WHERE category IS NOT NULL
         AND TRIM(category) <> ''
       ORDER BY category ASC`,
    )
    .all<{ category: string }>();
  return results.map((row) => row.category);
}

// --- Settings: category rules ---------------------------------------------

/**
 * Category rules are always read for exactly one user — never combined. Import
 * classification, the settings screen and bulk re-categorization must all see
 * only the acting user's rules.
 */
export async function getCategoryRules(
  db: D1Database,
  owner: Owner,
): Promise<CategoryRule[]> {
  const { results } = await db
    .prepare(
      "SELECT id, owner, keyword, institution, category, priority FROM category_rules WHERE owner = ? ORDER BY priority ASC, id ASC",
    )
    .bind(owner)
    .all<CategoryRule>();
  return results;
}

export async function insertCategoryRule(
  db: D1Database,
  rule: Omit<CategoryRule, "id">,
): Promise<number> {
  const res = await db
    .prepare(
      "INSERT INTO category_rules (owner, keyword, institution, category, priority) VALUES (?, ?, ?, ?, ?)",
    )
    .bind(rule.owner, rule.keyword, rule.institution, rule.category, rule.priority)
    .run();
  return res.meta.last_row_id as number;
}

/**
 * Update/delete carry `owner` in the WHERE clause, so passing another user's
 * rule id is a silent no-op rather than a cross-user write.
 */
export async function updateCategoryRule(
  db: D1Database,
  id: number,
  owner: Owner,
  rule: Omit<CategoryRule, "id" | "owner">,
): Promise<boolean> {
  const res = await db
    .prepare(
      "UPDATE category_rules SET keyword = ?, institution = ?, category = ?, priority = ? WHERE id = ? AND owner = ?",
    )
    .bind(rule.keyword, rule.institution, rule.category, rule.priority, id, owner)
    .run();
  return (res.meta.changes ?? 0) > 0;
}

export async function deleteCategoryRule(
  db: D1Database,
  id: number,
  owner: Owner,
): Promise<boolean> {
  const res = await db
    .prepare("DELETE FROM category_rules WHERE id = ? AND owner = ?")
    .bind(id, owner)
    .run();
  return (res.meta.changes ?? 0) > 0;
}

// --- Settings: CSV formats -------------------------------------------------

type CsvFormatRow = Omit<CsvFormat, "encodings"> & {
  encoding: string;
  encodings: string | null;
};

export function parseCsvFormatEncodings(
  encodings: string | null,
  encoding: string,
): string[] {
  if (encodings != null) {
    try {
      const parsed: unknown = JSON.parse(encodings);
      if (
        Array.isArray(parsed) &&
        parsed.length > 0 &&
        parsed.every(
          (value): value is string =>
            value === "UTF-8" || value === "Shift_JIS",
        ) &&
        new Set(parsed).size === parsed.length
      ) {
        return parsed;
      }
    } catch {
      // Legacy/corrupt rows safely fall back to the original single value.
    }
  }
  return [encoding];
}

export async function getCsvFormats(db: D1Database): Promise<CsvFormat[]> {
  const { results } = await db
    .prepare(
      "SELECT id, name, date_col, desc_col, desc_col2, expense_col, income_col, balance_col, header_rows, encoding, encodings, header_signature, expected_columns FROM csv_formats ORDER BY id ASC",
    )
    .all<CsvFormatRow>();
  return results.map(({ encoding, encodings, ...format }) => ({
    ...format,
    encodings: parseCsvFormatEncodings(encodings, encoding),
  }));
}

export async function insertCsvFormat(
  db: D1Database,
  f: Omit<CsvFormat, "id">,
): Promise<number> {
  const res = await db
    .prepare(
      "INSERT INTO csv_formats (name, date_col, desc_col, desc_col2, expense_col, income_col, balance_col, header_rows, encoding, encodings, header_signature, expected_columns) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    )
    .bind(
      f.name,
      f.date_col,
      f.desc_col,
      f.desc_col2,
      f.expense_col,
      f.income_col,
      f.balance_col,
      f.header_rows,
      f.encodings[0],
      JSON.stringify(f.encodings),
      f.header_signature,
      f.expected_columns,
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
      "UPDATE csv_formats SET name = ?, date_col = ?, desc_col = ?, desc_col2 = ?, expense_col = ?, income_col = ?, balance_col = ?, header_rows = ?, encoding = ?, encodings = ?, header_signature = ?, expected_columns = ? WHERE id = ?",
    )
    .bind(
      f.name,
      f.date_col,
      f.desc_col,
      f.desc_col2,
      f.expense_col,
      f.income_col,
      f.balance_col,
      f.header_rows,
      f.encodings[0],
      JSON.stringify(f.encodings),
      f.header_signature,
      f.expected_columns,
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
    .prepare(
      "SELECT id, match_type, pattern, rate, priority FROM split_rules ORDER BY priority ASC, id ASC",
    )
    .all<SplitRule>();
  return results;
}

export async function insertSplitRule(
  db: D1Database,
  r: Omit<SplitRule, "id">,
): Promise<number> {
  const res = await db
    .prepare(
      "INSERT INTO split_rules (match_type, pattern, rate, priority) VALUES (?, ?, ?, ?)",
    )
    .bind(r.match_type, r.pattern, r.rate, r.priority)
    .run();
  return res.meta.last_row_id as number;
}

export async function updateSplitRule(
  db: D1Database,
  id: number,
  r: Omit<SplitRule, "id">,
): Promise<void> {
  await db
    .prepare(
      "UPDATE split_rules SET match_type = ?, pattern = ?, rate = ?, priority = ? WHERE id = ?",
    )
    .bind(r.match_type, r.pattern, r.rate, r.priority, id)
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

export async function getSecurities(
  db: D1Database,
  scope: OwnerScope = "all",
): Promise<SecuritiesBalance[]> {
  const { results } = await db
    .prepare(
      `SELECT id, owner, date, brokerage, value FROM securities_balances${ownerClause(
        scope,
        "WHERE",
      )} ORDER BY date ASC, id ASC`,
    )
    .bind(...ownerBinds(scope))
    .all<SecuritiesBalance>();
  return results;
}

export async function insertSecurity(
  db: D1Database,
  s: Omit<SecuritiesBalance, "id">,
): Promise<number> {
  const res = await db
    .prepare(
      "INSERT INTO securities_balances (owner, date, brokerage, value) VALUES (?, ?, ?, ?)",
    )
    .bind(s.owner, s.date, s.brokerage, s.value)
    .run();
  return res.meta.last_row_id as number;
}

/** Scoped to the owner so one user cannot delete the other's balance entries. */
export async function deleteSecurity(
  db: D1Database,
  id: number,
  owner: Owner,
): Promise<boolean> {
  const res = await db
    .prepare("DELETE FROM securities_balances WHERE id = ? AND owner = ?")
    .bind(id, owner)
    .run();
  return (res.meta.changes ?? 0) > 0;
}

// --- Transactions ----------------------------------------------------------

export interface TransactionFilter {
  /** 読み取りスコープ。未指定は 'all' (夫婦合算)。 */
  owner?: OwnerScope;
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

/** Return every non-blank institution with transactions in the specified month. */
export async function getTransactionInstitutionsForMonth(
  db: D1Database,
  year: number,
  month: number,
  scope: OwnerScope = "all",
): Promise<string[]> {
  const owner = ownerCondition(scope);
  const { results } = await db
    .prepare(
      `SELECT DISTINCT institution
       FROM transactions
       WHERE date LIKE ?
         AND institution IS NOT NULL
         AND TRIM(institution) <> ''
         ${owner.conds.map((cond) => `AND ${cond}`).join(" ")}
       ORDER BY institution ASC`,
    )
    .bind(`${year}-${String(month).padStart(2, "0")}-%`, ...owner.binds)
    .all<{ institution: string }>();
  return results.map((row) => row.institution);
}

/** Build the shared WHERE clause + bindings for transaction queries. */
function buildTransactionWhere(filter: TransactionFilter): {
  clause: string;
  binds: unknown[];
} {
  const owner = ownerCondition(filter.owner ?? "all");
  const conds: string[] = [...owner.conds];
  const binds: unknown[] = [...owner.binds];

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
      `SELECT ${TRANSACTION_COLUMNS}
       FROM transactions ${clause}
       ORDER BY date DESC, id DESC
       LIMIT ? OFFSET ?`,
    )
    .bind(...binds, limit, offset)
    .all<Transaction>();

  return { items: results, total, limit, offset };
}

const TRANSACTION_COLUMNS =
  "id, owner, date, description, amount, type, institution, category, category_locked, memo, balance, import_hash, created_at";

/** Fetch transactions in the given scope (for reports), ordered by date/id. */
export async function getAllTransactions(
  db: D1Database,
  scope: OwnerScope = "all",
): Promise<Transaction[]> {
  const { results } = await db
    .prepare(
      `SELECT ${TRANSACTION_COLUMNS} FROM transactions${ownerClause(
        scope,
        "WHERE",
      )} ORDER BY date ASC, id ASC`,
    )
    .bind(...ownerBinds(scope))
    .all<Transaction>();
  return results;
}

export async function getTransactionsForMonth(
  db: D1Database,
  year: number,
  month: number,
  scope: OwnerScope = "all",
): Promise<Transaction[]> {
  const { results } = await db
    .prepare(
      `SELECT ${TRANSACTION_COLUMNS}
       FROM transactions WHERE date LIKE ?${ownerClause(scope, "AND")}
       ORDER BY date ASC, id ASC`,
    )
    .bind(`${year}-${String(month).padStart(2, "0")}-%`, ...ownerBinds(scope))
    .all<Transaction>();
  return results;
}

export async function getTransactionById(
  db: D1Database,
  id: number,
): Promise<Transaction | null> {
  return db
    .prepare(`SELECT ${TRANSACTION_COLUMNS} FROM transactions WHERE id = ?`)
    .bind(id)
    .first<Transaction>();
}

/**
 * How many of the owner's transactions a prospective category rule would match.
 * Scoped by owner because the rule being previewed only ever belongs to (and
 * only ever affects) that one user.
 */
export async function countTransactionsMatchingCategoryRule(
  db: D1Database,
  owner: Owner,
  keyword: string,
  institution: string | null,
): Promise<number> {
  const institutionClause = institution == null ? "" : " AND institution = ?";
  const binds =
    institution == null ? [owner, keyword] : [owner, keyword, institution];
  const row = await db
    .prepare(
      `SELECT COUNT(*) AS count FROM transactions
       WHERE owner = ? AND instr(description, ?) > 0${institutionClause}`,
    )
    .bind(...binds)
    .first<{ count: number }>();
  return row?.count ?? 0;
}

/** Owner-scoped so one user's id cannot be used to write the other's row. */
export async function updateTransactionFields(
  db: D1Database,
  id: number,
  owner: Owner,
  fields: {
    category?: string | null;
    category_locked?: number;
    memo?: string | null;
  },
): Promise<boolean> {
  const sets: string[] = [];
  const binds: unknown[] = [];
  if (Object.prototype.hasOwnProperty.call(fields, "category")) {
    sets.push("category = ?");
    binds.push(fields.category ?? null);
  }
  if (Object.prototype.hasOwnProperty.call(fields, "category_locked")) {
    sets.push("category_locked = ?");
    binds.push(fields.category_locked ?? 0);
  }
  if (Object.prototype.hasOwnProperty.call(fields, "memo")) {
    sets.push("memo = ?");
    binds.push(fields.memo ?? null);
  }
  if (sets.length === 0) return false;
  binds.push(id, owner);
  const res = await db
    .prepare(
      `UPDATE transactions SET ${sets.join(", ")} WHERE id = ? AND owner = ?`,
    )
    .bind(...binds)
    .run();
  return (res.meta.changes ?? 0) > 0;
}

export async function deleteTransaction(
  db: D1Database,
  id: number,
  owner: Owner,
): Promise<boolean> {
  const res = await db
    .prepare("DELETE FROM transactions WHERE id = ? AND owner = ?")
    .bind(id, owner)
    .run();
  return (res.meta.changes ?? 0) > 0;
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

/**
 * Fetch the owner's existing import_hash values (for preview dup checks).
 * Scoped by owner to match the UNIQUE(owner, import_hash) constraint — the other
 * user's identical-looking rows must not be reported as duplicates.
 */
export async function getExistingImportHashes(
  db: D1Database,
  owner: Owner,
): Promise<Set<string>> {
  const { results } = await db
    .prepare("SELECT import_hash FROM transactions WHERE owner = ?")
    .bind(owner)
    .all<{ import_hash: string }>();
  return new Set(results.map((r) => r.import_hash));
}

export interface InsertableTransaction {
  owner: Owner;
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
        (owner, date, description, amount, type, institution, category, memo, balance, import_hash)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      tx.owner,
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
