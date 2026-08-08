import { describe, it, expect } from "vitest";
import {
  evaluateFormatEncodings,
  previewImports,
  runImports,
} from "../src/server/services/importer";
import { base64ToBytes } from "../src/server/services/decode";
import { parseCsv } from "../src/shared/csv";
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
            return {
              results: opts.formats.map((format) => ({
                ...format,
                encoding: format.encodings[0],
                encodings: JSON.stringify(format.encodings),
              })) as unknown as T[],
            };
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
  desc_col2: null,
  expense_col: 3,
  income_col: null,
  balance_col: null,
  header_rows: 1,
  encodings: ["UTF-8"],
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
const b64Bytes = (bytes: Uint8Array) => {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
};
const utf8Bytes = (text: string) => new TextEncoder().encode(text);
const shiftJisCsvBase64 =
  "k/qVdCyT4JdlLIvginoKMjAyNi8wNy8wMSyJy4vzk1iV3EEsNTAwCjIwMjYvMDcvMDIsicuL85NYldxCLDEyMDA=";

// 三菱UFJ (migration 0012): Shift_JIS・9列・摘要が2列。ヘッダー + 引落 / 振込入金 /
// 摘要内容が空のATM出金の3行。振込人名はサンプルの実名ではなくダミー。
const mufgFormat: CsvFormat = {
  id: 2,
  name: "三菱UFJ",
  date_col: 1,
  desc_col: 2,
  desc_col2: 3,
  expense_col: 4,
  income_col: 5,
  balance_col: 6,
  header_rows: 1,
  encodings: ["Shift_JIS", "UTF-8"],
  header_signature:
    '"日付","摘要","摘要内容","支払い金額","預かり金額","差引残高","メモ","未資金化区分","入払区分"',
  expected_columns: 9,
};
const mufgShiftJisCsvBase64 =
  "IpP6lXQiLCKTRZd2Iiwik0WXdpPgl2UiLCKOeJWlgqKL4Ip6Iiwil2GCqYLoi+CKeiIsIo23iPiOY42CIiwig4GDgiIsIpaijpGL4Im7i+aVqiIsIpP8laWL5pWqIg0KIjIwMjUvNy8xMCIsIoJpgmKCYSIsIoJpgmKCYYNKgXyDaCIsIjEyOSwzNjUiLCIiLCI0NjEsMDM2IiwiIiwiIiwikFWR1o54laWCoiINCiIyMDI1LzcvMjUiLCKQVY2eglAiLCKDhIN9g1+BQINeg42DRSIsIiIsIjUwMCwwMDAiLCI5NjEsMDM2IiwiIiwiIiwikFWR1pP8i+AiDQoiMjAyNS85LzI1Iiwig0qBfINoIiwiIiwiMTAsMDAwIiwiIiwiMzQ0LDA1OSIsIiIsIiIsIo54laWCoiINCg==";

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

  it.each([
    ["auto", undefined],
    ["manual", format.name],
  ])("imports UTF-8 with multiple candidates in %s mode", async (_mode, formatName) => {
    const dual = { ...format, encodings: ["Shift_JIS", "UTF-8"] };
    const db = makeFakeDb({ formats: [dual], rules });
    const [result] = await previewImports(db, HUSBAND, [{
      filename: "utf8.csv",
      contentBase64: b64(csv),
      formatName,
    }]);
    expect(result.error).toBeNull();
    expect(result.detectedFormat).toBe(format.name);
    expect(result.count).toBe(2);
  });

  it.each([
    ["auto", undefined],
    ["manual", format.name],
  ])("imports Shift_JIS with multiple candidates in %s mode", async (_mode, formatName) => {
    const dual = { ...format, encodings: ["Shift_JIS", "UTF-8"] };
    const db = makeFakeDb({ formats: [dual], rules });
    const [result] = await previewImports(db, HUSBAND, [{
      filename: "shift-jis.csv",
      contentBase64: shiftJisCsvBase64,
      formatName,
    }]);
    expect(result.error).toBeNull();
    expect(result.detectedFormat).toBe(format.name);
    expect(result.count).toBe(2);
  });
});

describe("三菱UFJ format", () => {
  it("auto-detects the Shift_JIS 9-column file alongside other formats", async () => {
    const db = makeFakeDb({ formats: [format, mufgFormat], rules });
    const [result] = await previewImports(db, WIFE, [{
      filename: "0599387.csv",
      contentBase64: mufgShiftJisCsvBase64,
    }]);
    expect(result.error).toBeNull();
    expect(result.detectedFormat).toBe("三菱UFJ");
    expect(result.detectionConfident).toBe(true);
    expect(result.count).toBe(3);
    expect(result.dateFrom).toBe("2025-07-10");
    expect(result.dateTo).toBe("2025-09-25");
  });

  it("decodes to 摘要＋摘要内容 descriptions with 預かり金額 as 収入", () => {
    const evaluated = evaluateFormatEncodings(
      base64ToBytes(mufgShiftJisCsvBase64),
      mufgFormat,
    );
    expect(evaluated.kind).toBe("eligible");
    if (evaluated.kind !== "eligible") return;
    expect(evaluated.encoding).toBe("Shift_JIS");
    expect(
      parseCsv(evaluated.text, mufgFormat).map((tx) => [
        tx.date, tx.description, tx.type, tx.amount, tx.balance,
      ]),
    ).toEqual([
      ["2025-07-10", "ＪＣＢ ＪＣＢカ－ド", "支出", 129365, 461036],
      ["2025-07-25", "振込１ ヤマダ　タロウ", "収入", 500000, 961036],
      ["2025-09-25", "カ－ド", "支出", 10000, 344059],
    ]);
  });

  it("imports the rows under the uploading user", async () => {
    const db = makeFakeDb({ formats: [format, mufgFormat], rules });
    const [result] = await runImports(db, WIFE, [{
      filename: "0599387.csv",
      contentBase64: mufgShiftJisCsvBase64,
    }]);
    expect(result.error).toBeNull();
    expect(result.format).toBe("三菱UFJ");
    expect(result.imported).toBe(3);
    expect(db.rows.every((row) => row.owner === WIFE)).toBe(true);
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

  it("distinguishes all decoding failures", async () => {
    const dual = { ...format, encodings: ["UTF-8", "Shift_JIS"] };
    const db = makeFakeDb({ formats: [dual], rules });
    const [result] = await previewImports(db, HUSBAND, [{
      filename: "invalid.csv",
      contentBase64: b64Bytes(new Uint8Array([0x81])),
      formatName: dual.name,
    }]);
    expect(result.error).toContain("設定された文字コード");
    expect(result.error).toContain("UTF-8・Shift_JIS");
  });

  it("distinguishes decoded files that all fail structural validation", async () => {
    const dual = { ...format, encodings: ["UTF-8", "Shift_JIS"] };
    const db = makeFakeDb({ formats: [dual], rules });
    const [result] = await previewImports(db, HUSBAND, [{
      filename: "wrong.csv",
      contentBase64: b64("wrong,header\nnot-a-date,x"),
      formatName: dual.name,
    }]);
    expect(result.error).toContain("有効な取引を読み取れませんでした");
    expect(result.error).not.toContain("設定された文字コード");
  });

  it("stops when multiple encodings produce different eligible text", async () => {
    const text = "date,desc,amount\n2026/07/01,café,500";
    const dual = {
      ...format,
      encodings: ["Shift_JIS", "UTF-8"],
      header_signature: "date,desc,amount",
    };
    const db = makeFakeDb({ formats: [dual], rules });
    const [result] = await previewImports(db, HUSBAND, [{
      filename: "ambiguous.csv",
      contentBase64: b64(text),
      formatName: dual.name,
    }]);
    expect(result.error).toContain("文字コードを一意に判定できませんでした");
    expect(result.count).toBe(0);
  });
});

describe("format encoding resolution", () => {
  it("continues after an earlier successful decode fails structural validation", () => {
    const text = "é,desc,amount\n2026/07/01,fictional,500";
    const dual = {
      ...format,
      encodings: ["Shift_JIS", "UTF-8"],
      header_signature: "é,desc,amount",
    };
    const result = evaluateFormatEncodings(utf8Bytes(text), dual);
    expect(result.kind).toBe("eligible");
    if (result.kind === "eligible") {
      expect(result.encoding).toBe("UTF-8");
      expect(result.text).toBe(text);
    }
  });

  it("uses the first configured encoding when eligible decoded text is identical", () => {
    const text = "date,desc,amount\n2026/07/01,fictional,500";
    const dual = {
      ...format,
      encodings: ["Shift_JIS", "UTF-8"],
      header_signature: "date,desc,amount",
    };
    const result = evaluateFormatEncodings(utf8Bytes(text), dual);
    expect(result.kind).toBe("eligible");
    if (result.kind === "eligible") expect(result.encoding).toBe("Shift_JIS");
  });

  it("excludes an encoding-ambiguous format and adopts another unique format", async () => {
    const text = "date,desc,amount\n2026/07/01,café,500";
    const ambiguous = {
      ...format,
      encodings: ["Shift_JIS", "UTF-8"],
      header_signature: "date,desc,amount",
    };
    const unique = {
      ...ambiguous,
      id: 2,
      name: "一意形式",
      encodings: ["UTF-8"],
    };
    const db = makeFakeDb({ formats: [ambiguous, unique], rules });
    const [result] = await previewImports(db, HUSBAND, [{
      filename: "auto.csv",
      contentBase64: b64(text),
    }]);
    expect(result.error).toBeNull();
    expect(result.detectedFormat).toBe("一意形式");
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
