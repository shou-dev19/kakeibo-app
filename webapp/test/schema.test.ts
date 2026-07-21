import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { TABLE_NAMES } from "../src/shared/types";

const initialSql = readFileSync(
  fileURLToPath(new URL("../migrations/0001_initial.sql", import.meta.url)),
  "utf8",
);
const seedSql = readFileSync(
  fileURLToPath(new URL("../migrations/0002_seed.sql", import.meta.url)),
  "utf8",
);
const detectionSql = readFileSync(
  fileURLToPath(new URL("../migrations/0003_csv_format_detection.sql", import.meta.url)),
  "utf8",
);

describe("initial migration schema", () => {
  it("creates every table declared in TABLE_NAMES", () => {
    for (const table of TABLE_NAMES) {
      expect(initialSql).toMatch(
        new RegExp(`CREATE TABLE ${table}\\b`),
      );
    }
  });

  it("enforces a UNIQUE import_hash and indexes date on transactions", () => {
    expect(initialSql).toMatch(/import_hash\s+TEXT\s+NOT NULL UNIQUE/);
    expect(initialSql).toMatch(
      /CREATE INDEX idx_transactions_date ON transactions \(date\)/,
    );
  });

  it("stores money columns as INTEGER", () => {
    expect(initialSql).toMatch(/amount\s+INTEGER NOT NULL/);
    expect(initialSql).toMatch(/balance\s+INTEGER/);
    expect(initialSql).toMatch(/value\s+INTEGER NOT NULL/);
  });
});

describe("seed migration", () => {
  it("seeds the イオンカード×十日市場 rule at highest priority", () => {
    expect(seedSql).toMatch(/'十日市場',\s*'イオンカード',\s*'食料品',\s*0/);
  });

  it("seeds the 保育料 31% split rule", () => {
    expect(seedSql).toMatch(/'keyword',\s*'ﾖｺﾊﾏｼﾎｲｸﾘﾖｳ',\s*31/);
  });

  it("seeds excluded categories for balance and annual scopes", () => {
    expect(seedSql).toMatch(/'投資',\s*'balance'/);
    expect(seedSql).toMatch(/'振替',\s*'annual'/);
  });

  it("seeds the 三井住友カード CSV format with Shift_JIS", () => {
    expect(seedSql).toMatch(
      /'三井住友カード',\s*1,\s*2,\s*3,\s*NULL,\s*NULL,\s*1,\s*'Shift_JIS'/,
    );
  });
});

describe("CSV format detection migration", () => {
  it("adds configurable header signatures and expected column counts", () => {
    expect(detectionSql).toMatch(/ADD COLUMN header_signature TEXT/);
    expect(detectionSql).toMatch(/ADD COLUMN expected_columns INTEGER/);
  });

  it("backfills all nine known formats and fixes the headerless format", () => {
    for (const name of [
      "SBI新生銀行", "イオン銀行", "住信SBIネット銀行",
      "三井住友カード", "JCBW", "イオンカード",
      "VIEWカード", "楽天カード", "東急カード",
    ]) {
      expect(detectionSql).toContain("WHERE name = '" + name + "'");
    }
    expect(detectionSql).toMatch(/expected_columns = 13,\s*header_rows = 0/);
  });
});
