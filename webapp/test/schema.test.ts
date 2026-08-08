import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { INITIAL_TABLE_NAMES, TABLE_NAMES } from "../src/shared/types";

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
const splitRulePrioritySql = readFileSync(
  fileURLToPath(new URL("../migrations/0004_split_rule_priority.sql", import.meta.url)),
  "utf8",
);
const categoryLockSql = readFileSync(
  fileURLToPath(new URL("../migrations/0005_transaction_category_lock.sql", import.meta.url)),
  "utf8",
);
const transactionsOwnerSql = readFileSync(
  fileURLToPath(new URL("../migrations/0007_transactions_owner.sql", import.meta.url)),
  "utf8",
);
const securitiesOwnerSql = readFileSync(
  fileURLToPath(new URL("../migrations/0008_securities_owner.sql", import.meta.url)),
  "utf8",
);
const categoryRulesOwnerSql = readFileSync(
  fileURLToPath(new URL("../migrations/0009_category_rules_owner.sql", import.meta.url)),
  "utf8",
);
const recategorizeHistorySql = readFileSync(
  fileURLToPath(new URL("../migrations/0010_recategorize_history.sql", import.meta.url)),
  "utf8",
);
const csvFormatEncodingsSql = readFileSync(
  fileURLToPath(new URL("../migrations/0011_csv_format_encodings.sql", import.meta.url)),
  "utf8",
);
const mufgFormatSql = readFileSync(
  fileURLToPath(new URL("../migrations/0012_mufg_csv_format.sql", import.meta.url)),
  "utf8",
);

/** Every table in TABLE_NAMES must be created by *some* migration. */
const allMigrationSql = [
  initialSql,
  detectionSql,
  splitRulePrioritySql,
  categoryLockSql,
  transactionsOwnerSql,
  securitiesOwnerSql,
  categoryRulesOwnerSql,
  recategorizeHistorySql,
  csvFormatEncodingsSql,
  mufgFormatSql,
].join("\n");

describe("initial migration schema", () => {
  it("creates every table declared in INITIAL_TABLE_NAMES", () => {
    for (const table of INITIAL_TABLE_NAMES) {
      expect(initialSql).toMatch(
        new RegExp(`CREATE TABLE ${table}\\b`),
      );
    }
  });

  it("creates every table declared in TABLE_NAMES across all migrations", () => {
    for (const table of TABLE_NAMES) {
      expect(allMigrationSql).toMatch(new RegExp(`CREATE TABLE ${table}\\b`));
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

describe("CSV format encodings migration", () => {
  it("adds the JSON text column and initializes every row from legacy encoding", () => {
    expect(csvFormatEncodingsSql).toMatch(/ADD COLUMN encodings TEXT/);
    expect(csvFormatEncodingsSql).toMatch(
      /UPDATE csv_formats\s+SET encodings = json_array\(encoding\)/,
    );
  });

  it("enables exactly the five approved formats in Shift_JIS-first order", () => {
    expect(csvFormatEncodingsSql).toContain(
      `encodings = '["Shift_JIS","UTF-8"]'`,
    );
    const names = [
      "JCBW",
      "VIEWカード",
      "イオンカード",
      "イオン銀行",
      "住信SBIネット銀行",
    ];
    for (const name of names) expect(csvFormatEncodingsSql).toContain(`'${name}'`);
    expect(csvFormatEncodingsSql).not.toContain("'三井住友カード'");
    expect(csvFormatEncodingsSql).not.toContain("'楽天カード'");
    expect(csvFormatEncodingsSql).not.toContain("'東急カード'");
    expect(csvFormatEncodingsSql).not.toContain("'SBI新生銀行'");
  });
});

describe("三菱UFJ CSV format migration", () => {
  it("adds the optional second description column", () => {
    expect(mufgFormatSql).toMatch(/ALTER TABLE csv_formats ADD COLUMN desc_col2 INTEGER/);
  });

  it("registers 三菱UFJ with Shift_JIS-first candidates and its 9-column header", () => {
    expect(mufgFormatSql).toMatch(
      /'三菱UFJ', 1, 2, 3, 4, 5, 6,\s*1, 'Shift_JIS', '\["Shift_JIS","UTF-8"\]'/,
    );
    expect(mufgFormatSql).toContain(
      '"日付","摘要","摘要内容","支払い金額","預かり金額","差引残高","メモ","未資金化区分","入払区分"',
    );
    expect(mufgFormatSql).toMatch(/,\s*9\s*\)/);
  });
});

describe("split rule priority migration", () => {
  it("adds priority with the backward-compatible default and an index", () => {
    expect(splitRulePrioritySql).toMatch(
      /ALTER TABLE split_rules ADD COLUMN priority INTEGER NOT NULL DEFAULT 100/,
    );
    expect(splitRulePrioritySql).toMatch(
      /CREATE INDEX idx_split_rules_priority ON split_rules \(priority\)/,
    );
  });
});

describe("transaction category lock migration", () => {
  it("adds a non-null boolean-like lock with a backward-compatible default", () => {
    expect(categoryLockSql).toMatch(
      /ALTER TABLE transactions ADD COLUMN category_locked INTEGER NOT NULL DEFAULT 0/,
    );
    expect(categoryLockSql).toMatch(/CHECK \(category_locked IN \(0, 1\)\)/);
  });
});

describe("transactions owner migration", () => {
  it("scopes the dedupe constraint to the owner instead of the hash alone", () => {
    expect(transactionsOwnerSql).toMatch(/UNIQUE \(owner, import_hash\)/);
    // The bare UNIQUE on import_hash must be gone, or two users could never
    // hold the same transaction.
    expect(transactionsOwnerSql).not.toMatch(/import_hash\s+TEXT\s+NOT NULL UNIQUE/);
  });

  it("constrains owner to the two known users", () => {
    expect(transactionsOwnerSql).toMatch(
      /owner\s+TEXT\s+NOT NULL CHECK \(owner IN \('husband', 'wife'\)\)/,
    );
  });

  it("backfills every existing row as the husband's and preserves ids", () => {
    expect(transactionsOwnerSql).toMatch(
      /SELECT\s+id, 'husband', date, description, amount, type/,
    );
  });

  it("carries every column of the old table into the new one", () => {
    for (const column of [
      "id", "date", "description", "amount", "type", "institution",
      "category", "category_locked", "memo", "balance", "import_hash",
      "created_at",
    ]) {
      expect(transactionsOwnerSql).toContain(column);
    }
  });

  it("recreates the indexes dropped along with the old table", () => {
    expect(transactionsOwnerSql).toMatch(
      /CREATE INDEX idx_transactions_date ON transactions \(date\)/,
    );
    expect(transactionsOwnerSql).toMatch(
      /CREATE INDEX idx_transactions_category ON transactions \(category\)/,
    );
    expect(transactionsOwnerSql).toMatch(
      /CREATE INDEX idx_transactions_owner_date ON transactions \(owner, date\)/,
    );
  });
});

describe("securities owner migration", () => {
  it("adds owner with a backward-compatible default", () => {
    expect(securitiesOwnerSql).toMatch(
      /ALTER TABLE securities_balances ADD COLUMN owner TEXT NOT NULL DEFAULT 'husband'/,
    );
  });
});

describe("category rules owner migration", () => {
  it("adds owner with a backward-compatible default", () => {
    expect(categoryRulesOwnerSql).toMatch(
      /ALTER TABLE category_rules ADD COLUMN owner TEXT NOT NULL DEFAULT 'husband'/,
    );
  });

  it("seeds the wife's rules as a copy of the husband's", () => {
    expect(categoryRulesOwnerSql).toMatch(
      /INSERT INTO category_rules \(owner, keyword, institution, category, priority\)\s*SELECT 'wife', keyword, institution, category, priority\s*FROM category_rules\s*WHERE owner = 'husband'/,
    );
  });
});

describe("recategorize history migration", () => {
  it("records each run with its owner and revert state", () => {
    expect(recategorizeHistorySql).toMatch(
      /owner\s+TEXT\s+NOT NULL CHECK \(owner IN \('husband', 'wife'\)\)/,
    );
    expect(recategorizeHistorySql).toMatch(/reverted_at\s+TEXT/);
  });

  it("stores the previous category per changed transaction so a run can be undone", () => {
    expect(recategorizeHistorySql).toMatch(/previous_category TEXT/);
    expect(recategorizeHistorySql).toMatch(/new_category\s+TEXT\s+NOT NULL/);
    expect(recategorizeHistorySql).toMatch(
      /run_id\s+INTEGER NOT NULL REFERENCES recategorize_runs \(id\) ON DELETE CASCADE/,
    );
  });
});
