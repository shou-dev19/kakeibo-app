import { describe, it, expect } from "vitest";
import app from "../src/server/index";
import type { Bindings } from "../src/server/types";

/**
 * A small fake D1 that answers the specific SELECTs these route tests exercise.
 * We match on SQL fragments and honor the year/month LIKE bind so month
 * filtering is realistic.
 */
function makeDb(transactions: Array<Record<string, unknown>>, splitRules: unknown[] = []): D1Database {
  return {
    prepare(sql: string) {
      const binds: unknown[] = [];
      const stmt = {
        bind(...args: unknown[]) {
          binds.push(...args);
          return stmt;
        },
        async first<T>() {
          if (sql.includes("COUNT(*)")) {
            return { count: filterTx(binds).length } as unknown as T;
          }
          return null;
        },
        async all<T>() {
          if (sql.includes("SELECT DISTINCT institution")) {
            const institutions = [
              ...new Set(
                filterTx(binds)
                  .map((transaction) => transaction.institution)
                  .filter(
                    (institution): institution is string =>
                      typeof institution === "string" && institution.trim() !== "",
                  ),
              ),
            ].sort();
            return {
              results: institutions.map((institution) => ({ institution })) as unknown as T[],
            };
          }
          if (sql.includes("SELECT category FROM category_rules")) {
            const categories = [
              ...new Set(
                transactions
                  .map((transaction) => transaction.category)
                  .filter(
                    (category): category is string =>
                      typeof category === "string" && category.trim() !== "",
                  ),
              ),
            ].sort();
            return {
              results: categories.map((category) => ({ category })) as unknown as T[],
            };
          }
          if (sql.includes("FROM transactions")) {
            return { results: filterTx(binds) as unknown as T[] };
          }
          if (sql.includes("FROM split_rules")) {
            return { results: splitRules as unknown as T[] };
          }
          if (sql.includes("FROM excluded_categories")) {
            return { results: [] as unknown as T[] };
          }
          if (sql.includes("FROM securities_balances")) {
            return { results: [] as unknown as T[] };
          }
          return { results: [] as unknown as T[] };
        },
        async run() {
          return { meta: { changes: 1, last_row_id: 1 } };
        },
      };

      function filterTx(binds: unknown[]): Array<Record<string, unknown>> {
        let out = transactions;
        // Handle the date LIKE 'YYYY-MM-%' bind used by month queries.
        const like = binds.find(
          (b) => typeof b === "string" && /^\d{4}-\d{2}-%$/.test(b),
        ) as string | undefined;
        if (like) {
          const prefix = like.slice(0, -1);
          out = out.filter((t) => String(t.date).startsWith(prefix));
        }
        // Owner scoping: 'all' binds nothing, so the presence of an owner bind
        // is exactly the single-user case.
        const owner = binds.find((b) => b === "husband" || b === "wife");
        if (owner) out = out.filter((t) => t.owner === owner);
        return out;
      }

      return stmt;
    },
  } as unknown as D1Database;
}

function env(db: D1Database): Bindings {
  return {
    DB: db,
    ASSETS: {} as Fetcher,
    DEV_BYPASS_ACCESS: "true",
    ACCESS_TEAM_DOMAIN: "t",
    ACCESS_AUD: "a",
    ALLOWED_EMAILS: "x@example.com",
    OWNER_EMAILS: "husband:x@example.com",
  };
}

const txs = [
  { id: 1, owner: "husband", date: "2025-07-01", description: "スーパー", amount: 1000, type: "支出", institution: "銀行", category: "食料品", memo: null, balance: null, import_hash: "h1", created_at: "" },
  { id: 2, owner: "husband", date: "2025-07-02", description: "給与", amount: 300000, type: "収入", institution: "銀行", category: "給与", memo: null, balance: null, import_hash: "h2", created_at: "" },
  { id: 3, owner: "husband", date: "2025-06-15", description: "先月", amount: 500, type: "支出", institution: "銀行", category: "食料品", memo: null, balance: null, import_hash: "h3", created_at: "" },
];

describe("GET /api/transactions", () => {
  it("returns split rates using priority while preserving the filtered page total", async () => {
    const listTxs = [
      txs[0],
      { ...txs[1], description: "スーパー給与" },
      txs[2],
      { id: 4, date: "2025-07-03", description: "対象外", amount: 800, type: "支出", institution: "銀行", category: "日用品", memo: null, balance: null, import_hash: "h4", created_at: "" },
      { id: 5, date: "2025-07-04", description: "スーパー振替", amount: 300, type: "支出", institution: "銀行", category: "振替", memo: null, balance: null, import_hash: "h5", created_at: "" },
    ];
    const rules = [
      { id: 1, match_type: "keyword", pattern: "スーパー", rate: 100, priority: 100 },
      { id: 2, match_type: "keyword", pattern: "スーパー", rate: 50, priority: 10 },
    ];
    const res = await app.request(
      "/api/transactions?year=2025&month=7",
      {},
      env(makeDb(listTxs, rules)),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      items: Array<{
        description: string;
        categoryLocked?: boolean;
        splitRate?: number | null;
      }>;
      total: number;
    };
    expect(body.total).toBe(4); // July only; the June transaction remains excluded.
    expect(Object.fromEntries(body.items.map((item) => [item.description, item.splitRate]))).toEqual({
      "スーパー": 50, // priority 10 wins over the matching priority 100 rule.
      "スーパー給与": null, // Matches the rules, but income is ineligible.
      "対象外": null,
      "スーパー振替": null,
    });
    expect(body.items.every((item) => item.categoryLocked === false)).toBe(true);
  });
});

// Read screens take an owner scope from the query. Writes never do — those are
// covered by the service-level tests, which assert the owner comes from login.
describe("owner read scope", () => {
  const mixed = [
    { ...txs[0], id: 1, owner: "husband", amount: 1000 },
    { ...txs[0], id: 2, owner: "wife", amount: 4000, institution: "妻の銀行" },
  ];

  it.each([
    ["husband", 1, 1000],
    ["wife", 1, 4000],
    ["all", 2, 5000],
  ])("scopes the transaction list to owner=%s", async (owner, count) => {
    const res = await app.request(
      `/api/transactions?year=2025&month=7&owner=${owner}`,
      {},
      env(makeDb(mixed)),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { items: unknown[]; total: number };
    expect(body.total).toBe(count);
    expect(body.items).toHaveLength(count);
  });

  it("defaults to the combined view when owner is omitted", async () => {
    const res = await app.request(
      "/api/transactions?year=2025&month=7",
      {},
      env(makeDb(mixed)),
    );
    const body = (await res.json()) as { total: number };
    expect(body.total).toBe(2);
  });

  it("includes the owner on each returned transaction", async () => {
    const res = await app.request(
      "/api/transactions?year=2025&month=7",
      {},
      env(makeDb(mixed)),
    );
    const body = (await res.json()) as { items: Array<{ owner: string }> };
    expect(body.items.map((item) => item.owner).sort()).toEqual([
      "husband",
      "wife",
    ]);
  });

  it("scopes the monthly report", async () => {
    const res = await app.request(
      "/api/reports/monthly?year=2025&month=7&owner=wife",
      {},
      env(makeDb(mixed)),
    );
    const body = (await res.json()) as { totalExpense: number };
    expect(body.totalExpense).toBe(4000);
  });

  it("scopes the institution options", async () => {
    const res = await app.request(
      "/api/transactions/institutions?year=2025&month=7&owner=wife",
      {},
      env(makeDb(mixed)),
    );
    await expect(res.json()).resolves.toEqual({ items: ["妻の銀行"] });
  });

  it.each([
    "/api/transactions?owner=nobody",
    "/api/transactions/institutions?year=2025&month=7&owner=nobody",
    "/api/reports/monthly?year=2025&month=7&owner=nobody",
    "/api/reports/annual?year=2025&month=7&owner=nobody",
    "/api/reports/assets?owner=nobody",
    "/api/securities?owner=nobody",
  ])("rejects an unknown owner value on %s", async (path) => {
    const res = await app.request(path, {}, env(makeDb(mixed)));
    expect(res.status).toBe(400);
  });
});

describe("GET /api/me", () => {
  it("reports the logged-in user", async () => {
    const res = await app.request("/api/me", {}, env(makeDb([])));
    expect(res.status).toBe(200);
    // The test env runs with the Access bypass, which defaults to the husband.
    await expect(res.json()).resolves.toEqual({
      owner: "husband",
      label: "夫",
    });
  });
});

describe("GET /api/transactions/institutions", () => {
  it("returns every distinct institution in the selected month, ordered by name", async () => {
    const res = await app.request(
      "/api/transactions/institutions?year=2025&month=7",
      {},
      env(makeDb([
        ...txs,
        { ...txs[0], id: 4, institution: "カード" },
        { ...txs[0], id: 5, institution: "カード" },
        { ...txs[0], id: 6, institution: "" },
      ])),
    );

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ items: ["カード", "銀行"] });
  });

  it("rejects a missing or invalid year/month", async () => {
    for (const path of [
      "/api/transactions/institutions",
      "/api/transactions/institutions?year=2025&month=13",
      "/api/transactions/institutions?year=0&month=7",
      "/api/transactions/institutions?year=2025.5&month=7",
    ]) {
      const res = await app.request(path, {}, env(makeDb(txs)));
      expect(res.status).toBe(400);
    }
  });
});

describe("PATCH /api/transactions/:id", () => {
  it("rejects a malformed category change before writing", async () => {
    const res = await app.request(
      "/api/transactions/1",
      {
        method: "PATCH",
        body: JSON.stringify({
          categoryChange: { mode: "rule", category: "食料品" },
        }),
      },
      env(makeDb(txs)),
    );
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({
      error: "カテゴリ変更の指定が不正です",
    });
  });
});

describe("POST /api/securities", () => {
  it("accepts the ISO date emitted by a native date input", async () => {
    const res = await app.request(
      "/api/securities",
      {
        method: "POST",
        body: JSON.stringify({
          date: "2025-07-12",
          brokerage: "SBI証券",
          value: 1_000_000,
        }),
      },
      env(makeDb([])),
    );

    expect(res.status).toBe(201);
    await expect(res.json()).resolves.toEqual({ id: 1 });
  });

  it("rejects a nonexistent ISO date", async () => {
    const res = await app.request(
      "/api/securities",
      {
        method: "POST",
        body: JSON.stringify({
          date: "2025-02-30",
          brokerage: "SBI証券",
          value: 1_000_000,
        }),
      },
      env(makeDb([])),
    );

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({ error: "invalid date" });
  });
});

describe("GET /api/reports/monthly", () => {
  it("aggregates income vs expense for the month", async () => {
    const res = await app.request("/api/reports/monthly?year=2025&month=7", {}, env(makeDb(txs)));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { totalIncome: number; totalExpense: number };
    expect(body.totalIncome).toBe(300000);
    expect(body.totalExpense).toBe(1000);
  });

  it("400s without year/month", async () => {
    const res = await app.request("/api/reports/monthly", {}, env(makeDb(txs)));
    expect(res.status).toBe(400);
  });
});

describe("GET /api/splitwise", () => {
  const rules = [
    { id: 1, match_type: "keyword", pattern: "スーパー", rate: 50, priority: 100 },
  ];

  it("splits the month's eligible expenses into the two shares", async () => {
    const res = await app.request("/api/splitwise?year=2025&month=7", {}, env(makeDb(txs, rules)));
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      totalAmount: number;
      husbandShare: number;
      wifeShare: number;
    };
    expect(body.totalAmount).toBe(1000);
    expect(body.wifeShare).toBe(500); // 1000 * 50%
    expect(body.husbandShare).toBe(500);
  });

  it("ignores an owner query: the split is always household-wide", async () => {
    const both = [
      txs[0],
      { ...txs[0], id: 9, owner: "wife", description: "スーパー妻" },
    ];
    const res = await app.request(
      "/api/splitwise?year=2025&month=7&owner=husband",
      {},
      env(makeDb(both, rules)),
    );
    const body = (await res.json()) as { totalAmount: number };
    expect(body.totalAmount).toBe(2000);
  });
});

describe("GET /api/reports/assets", () => {
  it("returns series and portfolio", async () => {
    const res = await app.request("/api/reports/assets", {}, env(makeDb(txs)));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { series: unknown[]; portfolio: unknown };
    expect(Array.isArray(body.series)).toBe(true);
    expect(body.portfolio).toBeTruthy();
  });
});

describe("GET /api/settings/categories", () => {
  it("returns saved category names as items", async () => {
    const res = await app.request("/api/settings/categories", {}, env(makeDb(txs)));
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ items: ["給与", "食料品"] });
  });
});

describe("POST /api/settings/csv-formats", () => {
  const valid = {
    name: "テスト形式",
    date_col: 1,
    desc_col: 2,
    expense_col: 3,
    income_col: null,
    balance_col: null,
    header_rows: 1,
    encodings: ["Shift_JIS", "UTF-8"],
    header_signature: "日付,内容,金額",
    expected_columns: 3,
  };

  it("accepts valid detection metadata", async () => {
    const res = await app.request(
      "/api/settings/csv-formats",
      { method: "POST", body: JSON.stringify(valid) },
      env(makeDb([])),
    );
    expect(res.status).toBe(201);
  });

  it.each([
    [{ ...valid, encodings: [] }],
    [{ ...valid, encodings: ["UTF-8", "UTF-8"] }],
    [{ ...valid, encodings: ["UTF-16"] }],
    [{ ...valid, encodings: "UTF-8" }],
    [Object.fromEntries(Object.entries(valid).filter(([key]) => key !== "encodings"))],
  ])("rejects invalid encoding candidates", async (body) => {
    const res = await app.request(
      "/api/settings/csv-formats",
      { method: "POST", body: JSON.stringify(body) },
      env(makeDb([])),
    );
    expect(res.status).toBe(400);
  });

  it("rejects missing, fractional, or headerless-invalid detection metadata", async () => {
    for (const body of [
      { ...valid, expected_columns: null },
      { ...valid, expected_columns: 3.5 },
      { ...valid, header_rows: 0 },
    ]) {
      const res = await app.request(
        "/api/settings/csv-formats",
        { method: "POST", body: JSON.stringify(body) },
        env(makeDb([])),
      );
      expect(res.status).toBe(400);
    }
  });
});
