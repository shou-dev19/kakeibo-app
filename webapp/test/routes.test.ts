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
  };
}

const txs = [
  { id: 1, date: "2025-07-01", description: "スーパー", amount: 1000, type: "支出", institution: "銀行", category: "食料品", memo: null, balance: null, import_hash: "h1", created_at: "" },
  { id: 2, date: "2025-07-02", description: "給与", amount: 300000, type: "収入", institution: "銀行", category: "給与", memo: null, balance: null, import_hash: "h2", created_at: "" },
  { id: 3, date: "2025-06-15", description: "先月", amount: 500, type: "支出", institution: "銀行", category: "食料品", memo: null, balance: null, import_hash: "h3", created_at: "" },
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
      items: Array<{ description: string; splitRate?: number | null }>;
      total: number;
    };
    expect(body.total).toBe(4); // July only; the June transaction remains excluded.
    expect(Object.fromEntries(body.items.map((item) => [item.description, item.splitRate]))).toEqual({
      "スーパー": 50, // priority 10 wins over the matching priority 100 rule.
      "スーパー給与": null, // Matches the rules, but income is ineligible.
      "対象外": null,
      "スーパー振替": null,
    });
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
  it("computes billed totals for the month", async () => {
    const rules = [
      { id: 1, match_type: "keyword", pattern: "スーパー", rate: 50, priority: 100 },
    ];
    const res = await app.request("/api/splitwise?year=2025&month=7", {}, env(makeDb(txs, rules)));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { totalBilled: number };
    expect(body.totalBilled).toBe(500); // 1000 * 50%
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

describe("POST /api/settings/csv-formats", () => {
  const valid = {
    name: "テスト形式",
    date_col: 1,
    desc_col: 2,
    expense_col: 3,
    income_col: null,
    balance_col: null,
    header_rows: 1,
    encoding: "UTF-8",
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
