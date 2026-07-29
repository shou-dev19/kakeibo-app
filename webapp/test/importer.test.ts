import { describe, it, expect } from "vitest";
import { previewImports, runImports } from "../src/server/services/importer";
import type { CategoryRule, CsvFormat, Owner } from "../src/shared/types";

/**
 * Minimal in-memory D1 fake covering exactly the queries the importer uses:
 *   - SELECT ... FROM csv_formats
 *   - SELECT ... FROM category_rules WHERE owner = ?
 *   - SELECT import_hash FROM transactions WHERE owner = ?
 *   - INSERT OR IGNORE INTO transactions (...) with UNIQUE(owner, import_hash)
 *
 * Dedupe is keyed on (owner, import_hash) to mirror migration 0007: the two
 * users may legitimately hold rows with the same hash.
 */
function makeFakeDb(opts: {
  formats: CsvFormat[];
  rules: CategoryRule[];
}): D1Database & { rows: Array<Record<string, unknown>> } {
  const rows: Array<Record<string, unknown>> = [];
  const keys = new Set<string>();
  const dedupeKey = (owner: unknown, hash: unknown) => `${owner}|${hash}`;

  const db = {
    rows,
    prepare(sql: string) {
      const binds: unknown[] = [];
      const stmt = {
        bind(...args: unknown[]) {
          binds.push(...args);
          return stmt;
        },
        async all<T>() {
          if (sql.includes("FROM csv_formats")) {
            return { results: opts.formats as unknown as T[] };
          }
          if (sql.includes("FROM category_rules")) {
            const owner = binds[0];
            return {
              results: opts.rules.filter(
                (rule) => rule.owner === owner,
              ) as unknown as T[],
            };
          }
          if (sql.includes("import_hash FROM transactions")) {
            const owner = binds[0];
            return {
              results: rows
                .filter((row) => row.owner === owner)
                .map((row) => ({ import_hash: row.import_hash })) as unknown as T[],
            };
          }
          return { results: [] as T[] };
        },
        async run() {
          if (sql.startsWith("INSERT OR IGNORE INTO transactions")) {
            // owner is the first bound param, import_hash the last.
            const owner = binds[0];
            const importHash = binds[binds.length - 1] as string;
            const key = dedupeKey(owner, importHash);
            if (keys.has(key)) {
              return { meta: { changes: 0 } };
            }
            keys.add(key);
            rows.push({ owner, import_hash: importHash });
            return { meta: { changes: 1, last_row_id: rows.length } };
          }
          return { meta: { changes: 0 } };
        },
      };
      return stmt;
    },
  };
  return db as unknown as D1Database & { rows: Array<Record<string, unknown>> };
}

const HUSBAND: Owner = "husband";
const WIFE: Owner = "wife";

const format: CsvFormat = {
  id: 1,
  name: "テストカード",
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

const rules: CategoryRule[] = [
  { id: 1, owner: "husband", keyword: "スーパー", institution: null, category: "食料品", priority: 100 },
];

const csv = ["日付,内容,金額", "2025/07/01,スーパーA,500", "2025/07/02,カフェ,800"].join(
  "\n",
);
const b64 = (s: string) => btoa(unescape(encodeURIComponent(s)));

describe("runImports", () => {
  it("imports rows from a file and reports per-file counts", async () => {
    const db = makeFakeDb({ formats: [format], rules });
    const [res] = await runImports(db, HUSBAND, [
      { filename: "a.csv", contentBase64: b64(csv), formatName: "テストカード" },
    ]);
    expect(res.error).toBeNull();
    expect(res.imported).toBe(2);
    expect(res.duplicateSkipped).toBe(0);
    expect(db.rows).toHaveLength(2);
  });

  it("is idempotent: re-importing the same file skips all as duplicates", async () => {
    const db = makeFakeDb({ formats: [format], rules });
    const file = {
      filename: "a.csv",
      contentBase64: b64(csv),
      formatName: "テストカード",
    };
    await runImports(db, HUSBAND, [file]);
    const [second] = await runImports(db, HUSBAND, [file]);
    expect(second.imported).toBe(0);
    expect(second.duplicateSkipped).toBe(2);
    expect(db.rows).toHaveLength(2); // no new rows
  });

  it("retains two legitimately-identical rows in the same file", async () => {
    const db = makeFakeDb({ formats: [format], rules });
    const dupCsv = [
      "日付,内容,金額",
      "2025/07/01,スーパーA,500",
      "2025/07/01,スーパーA,500",
    ].join("\n");
    const [res] = await runImports(db, HUSBAND, [
      { filename: "d.csv", contentBase64: b64(dupCsv), formatName: "テストカード" },
    ]);
    expect(res.imported).toBe(2); // n=0 and n=1 -> distinct hashes
  });

  it("isolates failures: one bad file does not stop the others", async () => {
    const db = makeFakeDb({ formats: [format], rules });
    const results = await runImports(db, HUSBAND, [
      // Unknown format name -> error for this file only.
      { filename: "bad.csv", contentBase64: b64(csv), formatName: "存在しない" },
      { filename: "ok.csv", contentBase64: b64(csv), formatName: "テストカード" },
    ]);
    expect(results[0].error).not.toBeNull();
    expect(results[0].imported).toBe(0);
    expect(results[1].error).toBeNull();
    expect(results[1].imported).toBe(2);
  });
});

describe("previewImports", () => {
  it("reports count, date range, detected format and zero duplicates for a fresh file", async () => {
    const db = makeFakeDb({ formats: [format], rules });
    const [p] = await previewImports(db, HUSBAND, [
      { filename: "a.csv", contentBase64: b64(csv) }, // auto-detect
    ]);
    expect(p.error).toBeNull();
    expect(p.detectedFormat).toBe("テストカード");
    expect(p.detectionConfident).toBe(true);
    expect(p.count).toBe(2);
    expect(p.dateFrom).toBe("2025-07-01");
    expect(p.dateTo).toBe("2025-07-02");
    expect(p.duplicateCount).toBe(0);
  });

  it("reports duplicates for an already-imported file", async () => {
    const db = makeFakeDb({ formats: [format], rules });
    const file = { filename: "a.csv", contentBase64: b64(csv), formatName: "テストカード" };
    await runImports(db, HUSBAND, [file]);
    const [p] = await previewImports(db, HUSBAND, [file]);
    expect(p.count).toBe(2);
    expect(p.duplicateCount).toBe(2);
  });
});

describe("manual format validation", () => {
  it("returns an error instead of reporting a zero-row success", async () => {
    const db = makeFakeDb({ formats: [format], rules });
    const [result] = await previewImports(db, HUSBAND, [
      {
        filename: "empty.csv",
        contentBase64: b64("日付,内容,金額\ninvalid,架空店舗,500"),
        formatName: format.name,
      },
    ]);
    expect(result.error).toContain("有効な取引を読み取れませんでした");
    expect(result.count).toBe(0);
  });
});

// The person uploading owns the rows. Dedupe and classification must both be
// scoped to them, or one spouse's history would suppress the other's import.
describe("imports are scoped to the uploading user", () => {
  const file = {
    filename: "a.csv",
    contentBase64: b64(csv),
    formatName: "テストカード",
  };

  it("records the rows under the uploading user", async () => {
    const db = makeFakeDb({ formats: [format], rules });
    await runImports(db, WIFE, [file]);
    expect(db.rows.every((row) => row.owner === WIFE)).toBe(true);
  });

  it("keeps both users' rows when they upload the same statement", async () => {
    const db = makeFakeDb({ formats: [format], rules });
    await runImports(db, HUSBAND, [file]);
    const [wifeResult] = await runImports(db, WIFE, [file]);

    // Identical content, so the hashes collide — but the owners differ.
    expect(wifeResult.imported).toBe(2);
    expect(wifeResult.duplicateSkipped).toBe(0);
    expect(db.rows).toHaveLength(4);
  });

  it("does not report the other user's rows as duplicates in a preview", async () => {
    const db = makeFakeDb({ formats: [format], rules });
    await runImports(db, HUSBAND, [file]);
    const [preview] = await previewImports(db, WIFE, [file]);
    expect(preview.duplicateCount).toBe(0);
  });

  it("classifies with the uploading user's own rules", async () => {
    const perUserRules: CategoryRule[] = [
      { id: 1, owner: "husband", keyword: "スーパー", institution: null, category: "食料品", priority: 100 },
      { id: 2, owner: "wife", keyword: "スーパー", institution: null, category: "日用品", priority: 100 },
    ];
    const categoriesFor = async (owner: Owner) => {
      const captured: unknown[][] = [];
      const base = makeFakeDb({ formats: [format], rules: perUserRules });
      const db = {
        ...base,
        prepare(sql: string) {
          const stmt = base.prepare(sql);
          if (!sql.startsWith("INSERT OR IGNORE INTO transactions")) return stmt;
          return {
            ...stmt,
            bind(...args: unknown[]) {
              captured.push(args);
              return stmt.bind(...args);
            },
          } as typeof stmt;
        },
      } as unknown as D1Database;
      await runImports(db, owner, [file]);
      // INSERT column order: owner, date, description, amount, type,
      // institution, category, ...
      return captured.map((args) => args[6]);
    };

    expect(await categoriesFor(HUSBAND)).toEqual(["食料品", "未分類"]);
    expect(await categoriesFor(WIFE)).toEqual(["日用品", "未分類"]);
  });
});
