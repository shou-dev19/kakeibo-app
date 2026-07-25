import { describe, expect, it } from "vitest";
import type { CategoryRule, Transaction } from "../src/shared/types";
import { recategorizeAll } from "../src/server/services/recategorize";
import {
  previewTransactionCategoryRule,
  saveTransactionEdit,
} from "../src/server/services/transactionCategoryEdit";

function transaction(
  overrides: Partial<Transaction> & Pick<Transaction, "id" | "description">,
): Transaction {
  const { id, description, ...rest } = overrides;
  return {
    id,
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

function makeDb(initial: {
  transactions: Transaction[];
  rules: CategoryRule[];
}) {
  const transactions = initial.transactions.map((tx) => ({ ...tx }));
  const rules = initial.rules.map((rule) => ({ ...rule }));
  let batchCalls = 0;

  const db = {
    transactions,
    rules,
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
            const [keyword, institution] = binds as [string, string?];
            return {
              count: transactions.filter(
                (tx) =>
                  tx.description.includes(keyword) &&
                  (institution === undefined ||
                    tx.institution === institution),
              ).length,
            } as T;
          }
          return null;
        },
        async all<T>() {
          if (sql.includes("FROM category_rules")) {
            return { results: rules as unknown as T[] };
          }
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
          if (sql.includes("FROM transactions")) {
            return { results: transactions as unknown as T[] };
          }
          return { results: [] as T[] };
        },
        async run() {
          if (sql.startsWith("INSERT INTO category_rules")) {
            rules.push({
              id: Math.max(0, ...rules.map((rule) => rule.id)) + 1,
              keyword: String(binds[0]),
              institution:
                binds[1] == null ? null : String(binds[1]),
              category: String(binds[2]),
              priority: Number(binds[3]),
            });
            return { meta: { changes: 1, last_row_id: rules.at(-1)?.id } };
          }
          if (sql.startsWith("UPDATE transactions SET")) {
            const id = Number(binds.at(-1));
            const tx = transactions.find((candidate) => candidate.id === id);
            if (!tx) return { meta: { changes: 0 } };
            const setClause = sql.match(/SET (.+) WHERE/)?.[1] ?? "";
            const columns = setClause
              .split(",")
              .map((part) => part.trim().split(" = ")[0]);
            columns.forEach((column, index) => {
              if (column === "category") tx.category = binds[index] as string;
              if (column === "category_locked") {
                tx.category_locked = Number(binds[index]);
              }
              if (column === "memo") {
                tx.memo = binds[index] == null ? null : String(binds[index]);
              }
            });
            return { meta: { changes: 1 } };
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

  return db as unknown as D1Database & {
    transactions: Transaction[];
    rules: CategoryRule[];
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
          keyword: "Amazon",
          institution: null,
          category: "旧カテゴリ",
          priority: 50,
        },
        {
          id: 2,
          keyword: "新カテゴリ",
          institution: null,
          category: "新カテゴリ",
          priority: 100,
        },
      ],
    });

    const preview = await previewTransactionCategoryRule(db, 1, {
      category: "新カテゴリ",
      keyword: "Amazon",
      institution: "カードA",
    });
    expect(preview.matchCount).toBe(2);
    expect(preview.priority).toBe(49);
    expect(preview.currentRule?.id).toBe(1);

    await saveTransactionEdit(db, 1, {
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
          keyword: "Amazon",
          institution: "カードA",
          category: "新カテゴリ",
          priority: 10,
        },
      ],
    });

    await saveTransactionEdit(db, 1, {
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
          keyword: "Amazon",
          institution: null,
          category: "ルールカテゴリ",
          priority: 100,
        },
        {
          id: 2,
          keyword: "固定カテゴリ",
          institution: null,
          category: "固定カテゴリ",
          priority: 100,
        },
      ],
    });

    await saveTransactionEdit(db, 1, {
      categoryChange: { mode: "fixed", category: "固定カテゴリ" },
    });
    const result = await recategorizeAll(db);

    expect(result).toEqual({ total: 2, updated: 1, skippedLocked: 1 });
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
          keyword: "Amazon",
          institution: null,
          category: "ルールカテゴリ",
          priority: 100,
        },
      ],
    });

    await saveTransactionEdit(db, 1, {
      categoryChange: { mode: "unlock" },
    });

    expect(db.transactions[0]).toMatchObject({
      category: "ルールカテゴリ",
      category_locked: 0,
    });
  });
});
