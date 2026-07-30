import { describe, expect, it } from "vitest";
import {
  getCsvFormats,
  insertCsvFormat,
  parseCsvFormatEncodings,
  updateCsvFormat,
} from "../src/server/services/repository";
import type { CsvFormat } from "../src/shared/types";

const rawFormat = {
  id: 1,
  name: "架空カード",
  date_col: 1,
  desc_col: 2,
  expense_col: 3,
  income_col: null,
  balance_col: null,
  header_rows: 1,
  encoding: "Shift_JIS",
  header_signature: "date,description,amount",
  expected_columns: 3,
};

describe("CSV format encoding repository mapping", () => {
  it.each([
    ["NULL", null],
    ["invalid JSON", "{"],
    ["non-array JSON", "{}"],
    ["empty array", "[]"],
    ["unknown encoding", '["UTF-16"]'],
    ["duplicate encoding", '["UTF-8","UTF-8"]'],
    ["non-string encoding", '["UTF-8",123]'],
  ])("falls back to legacy encoding for %s", async (_label, encodings) => {
    const db = {
      prepare() {
        return {
          async all<T>() {
            return {
              results: [{ ...rawFormat, encodings }] as unknown as T[],
            };
          },
        };
      },
    } as unknown as D1Database;

    const result = await getCsvFormats(db);
    expect(result[0].encodings).toEqual(["Shift_JIS"]);
    expect(result[0]).not.toHaveProperty("encoding");
  });

  it("parses a valid non-empty array in saved order", () => {
    expect(
      parseCsvFormatEncodings('["Shift_JIS","UTF-8"]', "UTF-8"),
    ).toEqual(["Shift_JIS", "UTF-8"]);
  });

  it("writes the first candidate to encoding and all candidates to encodings", async () => {
    const calls: Array<{ sql: string; binds: unknown[] }> = [];
    const db = {
      prepare(sql: string) {
        const call = { sql, binds: [] as unknown[] };
        calls.push(call);
        return {
          bind(...binds: unknown[]) {
            call.binds = binds;
            return {
              async run() {
                return { meta: { last_row_id: 7, changes: 1 } };
              },
            };
          },
        };
      },
    } as unknown as D1Database;
    const format: Omit<CsvFormat, "id"> = {
      name: "架空カード",
      date_col: 1,
      desc_col: 2,
      expense_col: 3,
      income_col: null,
      balance_col: null,
      header_rows: 1,
      encodings: ["Shift_JIS", "UTF-8"],
      header_signature: "date,description,amount",
      expected_columns: 3,
    };

    await insertCsvFormat(db, format);
    await updateCsvFormat(db, 7, format);

    for (const call of calls) {
      expect(call.sql).toContain("encoding");
      expect(call.sql).toContain("encodings");
      expect(call.binds).toContain("Shift_JIS");
      expect(call.binds).toContain('["Shift_JIS","UTF-8"]');
    }
  });
});
