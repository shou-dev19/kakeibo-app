import { describe, it, expect } from "vitest";
import { previewImports, runImports } from "../src/server/services/importer";
import type { CategoryRule, CsvFormat } from "../src/shared/types";

/**
 * Minimal in-memory D1 fake covering exactly the queries the importer uses:
 *   - SELECT ... FROM csv_formats
 *   - SELECT ... FROM category_rules
 *   - SELECT import_hash FROM transactions
 *   - INSERT OR IGNORE INTO transactions (...) with UNIQUE(import_hash)
 */
function makeFakeDb(opts: {
  formats: CsvFormat[];
  rules: CategoryRule[];
}): D1Database & { rows: Array<Record<string, unknown>> } {
  const rows: Array<Record<string, unknown>> = [];
  const hashes = new Set<string>();

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
            return { results: opts.rules as unknown as T[] };
          }
          if (sql.includes("import_hash FROM transactions")) {
            return {
              results: [...hashes].map((h) => ({ import_hash: h })) as unknown as T[],
            };
          }
          return { results: [] as T[] };
        },
        async run() {
          if (sql.startsWith("INSERT OR IGNORE INTO transactions")) {
            // import_hash is the last bound param.
            const importHash = binds[binds.length - 1] as string;
            if (hashes.has(importHash)) {
              return { meta: { changes: 0 } };
            }
            hashes.add(importHash);
            rows.push({ import_hash: importHash });
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
  { id: 1, keyword: "スーパー", institution: null, category: "食料品", priority: 100 },
];

const csv = ["日付,内容,金額", "2025/07/01,スーパーA,500", "2025/07/02,カフェ,800"].join(
  "\n",
);
const b64 = (s: string) => btoa(unescape(encodeURIComponent(s)));

describe("runImports", () => {
  it("imports rows from a file and reports per-file counts", async () => {
    const db = makeFakeDb({ formats: [format], rules });
    const [res] = await runImports(db, [
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
    await runImports(db, [file]);
    const [second] = await runImports(db, [file]);
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
    const [res] = await runImports(db, [
      { filename: "d.csv", contentBase64: b64(dupCsv), formatName: "テストカード" },
    ]);
    expect(res.imported).toBe(2); // n=0 and n=1 -> distinct hashes
  });

  it("isolates failures: one bad file does not stop the others", async () => {
    const db = makeFakeDb({ formats: [format], rules });
    const results = await runImports(db, [
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
    const [p] = await previewImports(db, [
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
    await runImports(db, [file]);
    const [p] = await previewImports(db, [file]);
    expect(p.count).toBe(2);
    expect(p.duplicateCount).toBe(2);
  });
});

describe("manual format validation", () => {
  it("returns an error instead of reporting a zero-row success", async () => {
    const db = makeFakeDb({ formats: [format], rules });
    const [result] = await previewImports(db, [
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
