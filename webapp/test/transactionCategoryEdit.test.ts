import { describe, expect, it } from "vitest";
import type { CategoryRule, Owner, Transaction } from "../src/shared/types";
import {
  getLastRecategorizeRun,
  previewRecategorize,
  recategorizeAll,
  undoLastRecategorize,
} from "../src/server/services/recategorize";
import {
  previewTransactionCategoryRule,
  saveTransactionEdit,
  TransactionEditError,
} from "../src/server/services/transactionCategoryEdit";

const HUSBAND: Owner = "husband";
const WIFE: Owner = "wife";

function transaction(
  overrides: Partial<Transaction> & Pick<Transaction, "id" | "description">,
): Transaction {
  const { id, description, ...rest } = overrides;
  return {
    id,
    owner: HUSBAND,
    date: "2026-07-01",
    description,
    amount: 1000,
    type: "支出",
    institution: "カードA",
    category: "旧カテゴリ",
    category_locked: 0,
    memo: null,
    balance: null,
    import_hash: `hash-${overrides.id}`,
    created_at: "",
    ...rest,
  };
}

interface RunRow {
  id: number;
  owner: Owner;
  executed_at: string;
  updated_count: number;
  reverted_at: string | null;
}

interface ChangeRow {
  run_id: number;
  transaction_id: number;
  previous_category: string | null;
  new_category: string;
}

/**
 * In-memory D1 fake covering the queries the edit + re-categorize services
 * issue. Owner filtering is modelled faithfully, since the point of most of
 * these tests is that one user's action never reaches the other's rows.
 */
function makeDb(initial: {
  transactions: Transaction[];
  rules: CategoryRule[];
}) {
  const transactions = initial.transactions.map((tx) => ({ ...tx }));
  const rules = initial.rules.map((rule) => ({ ...rule }));
  const runs: RunRow[] = [];
  const changes: ChangeRow[] = [];
  let batchCalls = 0;

  const db = {
    transactions,
    rules,
    runs,
    changes,
    get batchCalls() {
      return batchCalls;
    },
    prepare(sql: string) {
      const binds: unknown[] = [];
      const stmt = {
        bind(...values: unknown[]) {
          binds.push(...values);
          return stmt;
        },
        async first<T>() {
          if (sql.includes("FROM transactions WHERE id = ?")) {
            return (
              transactions.find((tx) => tx.id === Number(binds[0])) ?? null
            ) as T | null;
          }
          if (sql.includes("COUNT(*) AS count FROM transactions")) {
            const [owner, keyword, institution] = binds as [
              Owner,
              string,
              string?,
            ];
            return {
              count: transactions.filter(
                (tx) =>
                  tx.owner === owner &&
                  tx.description.includes(keyword) &&
                  (institution === undefined ||
                    tx.institution === institution),
              ).length,
            } as T;
          }
          if (sql.startsWith("INSERT INTO recategorize_runs")) {
            const row: RunRow = {
              id: runs.length + 1,
              owner: binds[0] as Owner,
              executed_at: `2026-07-29T00:00:0${runs.length}Z`,
              updated_count: Number(binds[1]),
              reverted_at: null,
            };
            runs.push(row);
            return { id: row.id } as T;
          }
          if (sql.includes("FROM recategorize_runs WHERE owner = ?")) {
            const owner = binds[0] as Owner;
            const found = [...runs]
              .reverse()
              .find((run) => run.owner === owner);
            return (found ?? null) as T | null;
          }
          return null;
        },
        async all<T>() {
          // Checked before the category_rules branch: the shared-vocabulary
          // query UNIONs over category_rules but is not owner-scoped.
          if (sql.includes("SELECT category") && sql.includes("UNION")) {
            const categories = new Set<string>();
            for (const rule of rules) categories.add(rule.category);
            for (const tx of transactions) {
              if (tx.category) categories.add(tx.category);
            }
            return {
              results: [...categories]
                .sort()
                .map((category) => ({ category })) as unknown as T[],
            };
          }
          if (sql.includes("FROM category_rules")) {
            const owner = binds[0] as Owner;
            return {
              results: rules.filter(
                (rule) => rule.owner === owner,
              ) as unknown as T[],
            };
          }
          if (sql.includes("FROM recategorize_changes WHERE run_id = ?")) {
            const runId = Number(binds[0]);
            return {
              results: changes.filter(
                (change) => change.run_id === runId,
              ) as unknown as T[],
            };
          }
          if (sql.includes("FROM transactions")) {
            const owner = sql.includes("WHERE owner = ?")
              ? (binds[0] as Owner)
              : null;
            return {
              results: transactions.filter(
                (tx) => owner == null || tx.owner === owner,
              ) as unknown as T[],
            };
          }
          return { results: [] as T[] };
        },
        async run() {
          if (sql.startsWith("INSERT INTO category_rules")) {
            rules.push({
              id: Math.max(0, ...rules.map((rule) => rule.id)) + 1,
              owner: binds[0] as Owner,
              keyword: String(binds[1]),
              institution: binds[2] == null ? null : String(binds[2]),
              category: String(binds[3]),
              priority: Number(binds[4]),
            });
            return { meta: { changes: 1, last_row_id: rules.at(-1)?.id } };
          }
          if (sql.startsWith("INSERT INTO recategorize_changes")) {
            changes.push({
              run_id: Number(binds[0]),
              transaction_id: Number(binds[1]),
              previous_category: binds[2] == null ? null : String(binds[2]),
              new_category: String(binds[3]),
            });
            return { meta: { changes: 1 } };
          }
          if (sql.includes("UPDATE recategorize_runs SET reverted_at")) {
            const run = runs.find((candidate) => candidate.id === Number(binds[0]));
            if (run) run.reverted_at = "2026-07-29T01:00:00Z";
            return { meta: { changes: run ? 1 : 0 } };
          }
          if (sql.startsWith("UPDATE transactions SET")) {
            return { meta: { changes: applyTransactionUpdate(sql, binds) } };
          }
          return { meta: { changes: 0 } };
        },
      };
      return stmt;
    },
    async batch(statements: Array<{ run(): Promise<unknown> }>) {
      batchCalls += 1;
      return Promise.all(statements.map((statement) => statement.run()));
    },
  };

  /** Apply one of the UPDATE transactions shapes; returns the affected count. */
  function applyTransactionUpdate(sql: string, binds: unknown[]): number {
    const setClause = sql.match(/SET ([\s\S]+?) WHERE/)?.[1] ?? "";
    const columns = setClause
      .split(",")
      .map((part) => part.trim().split(" = ")[0]);
    const whereBinds = binds.slice(columns.length);

    const [id, owner, expectedCategory] = whereBinds as [
      number,
      Owner?,
      string?,
    ];
    const tx = transactions.find((candidate) => candidate.id === Number(id));
    if (!tx) return 0;
    if (owner !== undefined && tx.owner !== owner) return 0;
    // The undo path only reverts rows still holding the category it set.
    if (expectedCategory !== undefined && tx.category !== expectedCategory) {
      return 0;
    }

    columns.forEach((column, index) => {
      if (column === "category") {
        tx.category = binds[index] == null ? null : String(binds[index]);
      }
      if (column === "category_locked") {
        tx.category_locked = Number(binds[index]);
      }
      if (column === "memo") {
        tx.memo = binds[index] == null ? null : String(binds[index]);
      }
    });
    return 1;
  }

  return db as unknown as D1Database & {
    transactions: Transaction[];
    rules: CategoryRule[];
    runs: RunRow[];
    changes: ChangeRow[];
    readonly batchCalls: number;
  };
}

describe("transaction category rule preview and save", () => {
  it("shows affected rows and inserts a higher-priority rule atomically", async () => {
    const db = makeDb({
      transactions: [
        transaction({ id: 1, description: "Amazon 注文1" }),
        transaction({ id: 2, description: "Amazon 注文2" }),
      ],
      rules: [
        {
          id: 1,
          owner: HUSBAND,
          keyword: "Amazon",
          institution: null,
          category: "旧カテゴリ",
          priority: 50,
        },
        {
          id: 2,
          owner: HUSBAND,
          keyword: "新カテゴリ",
          institution: null,
          category: "新カテゴリ",
          priority: 100,
        },
      ],
    });

    const preview = await previewTransactionCategoryRule(db, 1, HUSBAND, {
      category: "新カテゴリ",
      keyword: "Amazon",
      institution: "カードA",
    });
    expect(preview.matchCount).toBe(2);
    expect(preview.priority).toBe(49);
    expect(preview.currentRule?.id).toBe(1);

    await saveTransactionEdit(db, 1, HUSBAND, {
      memo: "確認済み",
      categoryChange: {
        mode: "rule",
        category: "新カテゴリ",
        keyword: "Amazon",
        institution: "カードA",
      },
    });

    expect(db.batchCalls).toBe(1);
    expect(db.rules.at(-1)).toMatchObject({
      owner: HUSBAND,
      keyword: "Amazon",
      institution: "カードA",
      category: "新カテゴリ",
      priority: 49,
    });
    expect(db.transactions[0]).toMatchObject({
      category: "新カテゴリ",
      category_locked: 0,
      memo: "確認済み",
    });
    expect(db.transactions[1].category).toBe("旧カテゴリ");
  });

  it("reuses an identical winning rule instead of adding a duplicate", async () => {
    const db = makeDb({
      transactions: [
        transaction({ id: 1, description: "Amazon 注文", category: "旧カテゴリ" }),
      ],
      rules: [
        {
          id: 1,
          owner: HUSBAND,
          keyword: "Amazon",
          institution: "カードA",
          category: "新カテゴリ",
          priority: 10,
        },
      ],
    });

    await saveTransactionEdit(db, 1, HUSBAND, {
      categoryChange: {
        mode: "rule",
        category: "新カテゴリ",
        keyword: "Amazon",
        institution: "カードA",
      },
    });

    expect(db.rules).toHaveLength(1);
    expect(db.transactions[0].category).toBe("新カテゴリ");
  });
});

// Editing is owner-only. A category change can mint a classification rule, and
// rules belong to whoever made the change — so allowing cross-user edits would
// silently grow the wrong person's rule set.
describe("editing another user's transaction", () => {
  function db() {
    return makeDb({
      transactions: [
        transaction({ id: 1, owner: WIFE, description: "Amazon 注文" }),
      ],
      rules: [
        {
          id: 1,
          owner: HUSBAND,
          keyword: "Amazon",
          institution: null,
          category: "新カテゴリ",
          priority: 100,
        },
      ],
    });
  }

  it("rejects a save with 403 and leaves the row untouched", async () => {
    const database = db();
    await expect(
      saveTransactionEdit(database, 1, HUSBAND, {
        categoryChange: { mode: "fixed", category: "新カテゴリ" },
      }),
    ).rejects.toMatchObject({ status: 403 });
    expect(database.transactions[0].category).toBe("旧カテゴリ");
    expect(database.rules).toHaveLength(1);
  });

  it("rejects a rule preview with 403", async () => {
    await expect(
      previewTransactionCategoryRule(db(), 1, HUSBAND, {
        category: "新カテゴリ",
        keyword: "Amazon",
        institution: null,
      }),
    ).rejects.toBeInstanceOf(TransactionEditError);
  });

  it("still reports a missing transaction as 404", async () => {
    await expect(
      saveTransactionEdit(db(), 999, HUSBAND, {
        categoryChange: { mode: "unlock" },
      }),
    ).rejects.toMatchObject({ status: 404 });
  });
});

describe("manual category lock", () => {
  it("keeps fixed rows during bulk recategorization and reports the skip", async () => {
    const db = makeDb({
      transactions: [
        transaction({ id: 1, description: "Amazon 固定" }),
        transaction({ id: 2, description: "Amazon 自動" }),
      ],
      rules: [
        {
          id: 1,
          owner: HUSBAND,
          keyword: "Amazon",
          institution: null,
          category: "ルールカテゴリ",
          priority: 100,
        },
        {
          id: 2,
          owner: HUSBAND,
          keyword: "固定カテゴリ",
          institution: null,
          category: "固定カテゴリ",
          priority: 100,
        },
      ],
    });

    await saveTransactionEdit(db, 1, HUSBAND, {
      categoryChange: { mode: "fixed", category: "固定カテゴリ" },
    });
    const result = await recategorizeAll(db, HUSBAND);

    expect(result).toMatchObject({ total: 2, updated: 1, skippedLocked: 1 });
    expect(db.transactions[0]).toMatchObject({
      category: "固定カテゴリ",
      category_locked: 1,
    });
    expect(db.transactions[1].category).toBe("ルールカテゴリ");
  });

  it("unlocks and immediately applies the latest rule", async () => {
    const db = makeDb({
      transactions: [
        transaction({
          id: 1,
          description: "Amazon 注文",
          category: "固定カテゴリ",
          category_locked: 1,
        }),
      ],
      rules: [
        {
          id: 1,
          owner: HUSBAND,
          keyword: "Amazon",
          institution: null,
          category: "ルールカテゴリ",
          priority: 100,
        },
      ],
    });

    await saveTransactionEdit(db, 1, HUSBAND, {
      categoryChange: { mode: "unlock" },
    });

    expect(db.transactions[0]).toMatchObject({
      category: "ルールカテゴリ",
      category_locked: 0,
    });
  });
});

// Re-categorizing used to be an unreviewable, irreversible sweep over every
// row in the database. It is now scoped, previewable and undoable.
describe("bulk recategorization", () => {
  function mixedDb() {
    return makeDb({
      transactions: [
        transaction({ id: 1, owner: HUSBAND, description: "Amazon 夫" }),
        transaction({ id: 2, owner: WIFE, description: "Amazon 妻" }),
      ],
      rules: [
        {
          id: 1,
          owner: HUSBAND,
          keyword: "Amazon",
          institution: null,
          category: "夫カテゴリ",
          priority: 100,
        },
        {
          id: 2,
          owner: WIFE,
          keyword: "Amazon",
          institution: null,
          category: "妻カテゴリ",
          priority: 100,
        },
      ],
    });
  }

  it("touches only the acting user's transactions", async () => {
    const db = mixedDb();
    const result = await recategorizeAll(db, WIFE);

    expect(result).toMatchObject({ total: 1, updated: 1 });
    expect(db.transactions[0].category).toBe("旧カテゴリ"); // 夫の明細は不変
    expect(db.transactions[1].category).toBe("妻カテゴリ");
  });

  it("applies only the acting user's rules", async () => {
    const db = mixedDb();
    await recategorizeAll(db, HUSBAND);
    expect(db.transactions[0].category).toBe("夫カテゴリ");
  });

  describe("preview", () => {
    it("reports the pending changes without writing anything", async () => {
      const db = mixedDb();
      const preview = await previewRecategorize(db, HUSBAND);

      expect(preview).toMatchObject({
        owner: HUSBAND,
        total: 1,
        changeCount: 1,
        skippedLocked: 0,
      });
      expect(preview.summary).toEqual([
        { from: "旧カテゴリ", to: "夫カテゴリ", count: 1 },
      ]);
      expect(preview.samples[0]).toMatchObject({
        id: 1,
        from: "旧カテゴリ",
        to: "夫カテゴリ",
      });

      // Nothing persisted.
      expect(db.transactions[0].category).toBe("旧カテゴリ");
      expect(db.runs).toHaveLength(0);
    });

    it("agrees with what the real run then does", async () => {
      const db = mixedDb();
      const preview = await previewRecategorize(db, HUSBAND);
      const result = await recategorizeAll(db, HUSBAND);
      expect(result.updated).toBe(preview.changeCount);
    });

    it("groups identical from/to pairs and counts them", async () => {
      const db = makeDb({
        transactions: [
          transaction({ id: 1, description: "Amazon A" }),
          transaction({ id: 2, description: "Amazon B" }),
          transaction({ id: 3, description: "対象外", category: "そのまま" }),
        ],
        rules: [
          {
            id: 1,
            owner: HUSBAND,
            keyword: "Amazon",
            institution: null,
            category: "新カテゴリ",
            priority: 100,
          },
        ],
      });
      const preview = await previewRecategorize(db, HUSBAND);

      expect(preview.total).toBe(3);
      expect(preview.changeCount).toBe(3);
      expect(preview.summary).toEqual([
        { from: "旧カテゴリ", to: "新カテゴリ", count: 2 },
        { from: "そのまま", to: "未分類", count: 1 },
      ]);
    });
  });

  describe("undo", () => {
    it("restores the categories the last run changed", async () => {
      const db = mixedDb();
      await recategorizeAll(db, HUSBAND);
      expect(db.transactions[0].category).toBe("夫カテゴリ");

      const undo = await undoLastRecategorize(db, HUSBAND);
      expect(undo).toMatchObject({ reverted: 1, skippedModified: 0 });
      expect(db.transactions[0].category).toBe("旧カテゴリ");
    });

    it("marks the run as reverted so it cannot be undone twice", async () => {
      const db = mixedDb();
      await recategorizeAll(db, HUSBAND);
      await undoLastRecategorize(db, HUSBAND);

      const run = await getLastRecategorizeRun(db, HUSBAND);
      expect(run?.reverted_at).not.toBeNull();
      await expect(undoLastRecategorize(db, HUSBAND)).rejects.toMatchObject({
        status: 409,
      });
    });

    it("leaves rows the user has since edited by hand alone", async () => {
      const db = mixedDb();
      await recategorizeAll(db, HUSBAND);
      // 再分類後に手で直した明細は、取り消しで巻き戻してはいけない。
      db.transactions[0].category = "手で直したカテゴリ";

      const undo = await undoLastRecategorize(db, HUSBAND);
      expect(undo).toMatchObject({ reverted: 0, skippedModified: 1 });
      expect(db.transactions[0].category).toBe("手で直したカテゴリ");
    });

    it("never reaches the other user's run", async () => {
      const db = mixedDb();
      await recategorizeAll(db, HUSBAND);
      await expect(undoLastRecategorize(db, WIFE)).rejects.toMatchObject({
        status: 404,
      });
      expect(db.transactions[0].category).toBe("夫カテゴリ");
    });

    it("reports 404 when the user has never run a re-categorization", async () => {
      await expect(
        undoLastRecategorize(mixedDb(), HUSBAND),
      ).rejects.toMatchObject({ status: 404 });
    });
  });

  it("records no run when nothing would change", async () => {
    const db = makeDb({
      transactions: [transaction({ id: 1, description: "対象外", category: "未分類" })],
      rules: [],
    });
    const result = await recategorizeAll(db, HUSBAND);

    expect(result).toMatchObject({ updated: 0, runId: null });
    expect(db.runs).toHaveLength(0);
  });
});
