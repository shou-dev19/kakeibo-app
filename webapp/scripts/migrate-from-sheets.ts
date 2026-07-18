// Google Sheets -> Cloudflare D1 migration script (移行ステップ2).
//
// Reads the 5 CSVs exported from the current spreadsheet (in ../input/),
// transforms them into D1 rows, generates a single idempotent SQL file
// (full reload: DELETE every table, then re-insert), applies it to the LOCAL
// D1 via `wrangler d1 execute`, and finally verifies the load by querying D1
// and comparing counts against the source rows.
//
// Run with:  npm run db:import:sheets
// (executed via vite-node — no extra devDependency needed).
//
// The generated SQL is written to a gitignored temp dir (.migrate-tmp/). To
// apply the SAME migration to production D1, re-run wrangler with --remote
// (see webapp/README.md). This script only touches --local.

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

import { parseCsvRows } from "../src/shared/csv";
import { assignImportHashes } from "../src/shared/hash";
import {
  transformTransactions,
  transformSecurities,
  transformSettings,
  transformSplitRules,
  transformCsvFormats,
  withSpecialCategoryRule,
  withSpecialSplitRule,
  sqlValue,
  type TransactionRow,
} from "./transform-sheets";

const __dirname = dirname(fileURLToPath(import.meta.url));
const WEBAPP_DIR = resolve(__dirname, "..");
const REPO_ROOT = resolve(WEBAPP_DIR, "..");
const INPUT_DIR = resolve(REPO_ROOT, "input");
const TMP_DIR = resolve(WEBAPP_DIR, ".migrate-tmp");
const SQL_FILE = resolve(TMP_DIR, "migrate-from-sheets.sql");

const FILES = {
  transactions: "kakeibo-app - 取引履歴DB.csv",
  securities: "kakeibo-app - 証券残高DB.csv",
  settings: "kakeibo-app - 分類・除外設定.csv",
  split: "kakeibo-app - 割り勘キーワード設定.csv",
  formats: "kakeibo-app - CSVフォーマット設定.csv",
};

const DB_NAME = "kakeibo";

function readCsv(name: string): string[][] {
  const path = resolve(INPUT_DIR, name);
  const text = readFileSync(path, "utf-8").replace(/^﻿/, "");
  return parseCsvRows(text);
}

/** Run `wrangler d1 execute` against the local DB. */
function wranglerExecute(args: string[]): string {
  const bin = resolve(WEBAPP_DIR, "node_modules/.bin/wrangler");
  return execFileSync(bin, ["d1", "execute", DB_NAME, "--local", ...args], {
    cwd: WEBAPP_DIR,
    encoding: "utf-8",
    stdio: ["ignore", "pipe", "pipe"],
    maxBuffer: 64 * 1024 * 1024,
  });
}

/** Query the local D1 and return the first result row's scalar value. */
function queryScalar(sql: string): string {
  const out = wranglerExecute(["--json", "--command", sql]);
  const parsed = JSON.parse(out);
  const results = parsed?.[0]?.results ?? [];
  if (results.length === 0) return "";
  const first = results[0];
  const keys = Object.keys(first);
  return String(first[keys[0]] ?? "");
}

function queryRow(sql: string): Record<string, unknown> {
  const out = wranglerExecute(["--json", "--command", sql]);
  const parsed = JSON.parse(out);
  return parsed?.[0]?.results?.[0] ?? {};
}

async function main() {
  console.log("=== 家計簿 Google Sheets -> D1 移行 (ステップ2) ===\n");

  // --- 1. Read + parse the 5 source CSVs -----------------------------------
  const txMatrix = readCsv(FILES.transactions);
  const secMatrix = readCsv(FILES.securities);
  const settingsMatrix = readCsv(FILES.settings);
  const splitMatrix = readCsv(FILES.split);
  const formatsMatrix = readCsv(FILES.formats);

  // --- 2. Transform --------------------------------------------------------
  const transactions = transformTransactions(txMatrix);
  const securities = transformSecurities(secMatrix);
  const { categoryRules, excludedCategories } = transformSettings(settingsMatrix);
  const splitRules = transformSplitRules(splitMatrix);
  const csvFormats = transformCsvFormats(formatsMatrix);

  // Re-inject the two GAS-hardcoded special cases (survive the full reload).
  const categoryRulesFinal = withSpecialCategoryRule(categoryRules);
  const splitRulesFinal = withSpecialSplitRule(splitRules);

  // import_hash: treat the whole export as one file, occurrence-count in order.
  const hashed = await assignImportHashes(
    transactions.map((t) => ({
      date: t.date,
      description: t.description,
      amount: t.amount,
      type: t.type,
      institution: t.institution,
      _row: t,
    })),
  );
  const txWithHash: (TransactionRow & { import_hash: string })[] = hashed.map((h) => ({
    ...h._row,
    import_hash: h.import_hash,
  }));

  // Detect any hash collisions (should be 0; the whole-export ordering keeps
  // legitimate duplicates distinct via the occurrence index n).
  const seen = new Set<string>();
  let duplicateHashes = 0;
  for (const t of txWithHash) {
    if (seen.has(t.import_hash)) duplicateHashes++;
    else seen.add(t.import_hash);
  }
  const uniqueHashCount = seen.size;

  // --- 3. Generate SQL (full reload) --------------------------------------
  const sql = buildSql({
    transactions: txWithHash,
    securities,
    categoryRules: categoryRulesFinal,
    csvFormats,
    splitRules: splitRulesFinal,
    excludedCategories,
  });

  if (!existsSync(TMP_DIR)) mkdirSync(TMP_DIR, { recursive: true });
  writeFileSync(SQL_FILE, sql, "utf-8");
  console.log(`生成SQL: ${SQL_FILE} (${(sql.length / 1024).toFixed(0)} KB)\n`);

  // --- 4. Apply to local D1 ------------------------------------------------
  console.log("ローカル D1 に適用中 (wrangler d1 execute --local)...");
  wranglerExecute(["--file", SQL_FILE]);
  console.log("適用完了\n");

  // --- 5. Verify -----------------------------------------------------------
  console.log("=== 検証サマリー ===");
  const expected: Record<string, number> = {
    transactions: txWithHash.length,
    securities_balances: securities.length,
    category_rules: categoryRulesFinal.length,
    csv_formats: csvFormats.length,
    split_rules: splitRulesFinal.length,
    excluded_categories: excludedCategories.length,
  };

  let allMatch = true;
  for (const [table, exp] of Object.entries(expected)) {
    const got = Number(queryScalar(`SELECT COUNT(*) AS c FROM ${table};`));
    const ok = got === exp;
    if (!ok) allMatch = false;
    console.log(
      `  ${ok ? "OK " : "NG "} ${table.padEnd(20)} 投入 ${String(got).padStart(5)} / ソース ${String(exp).padStart(5)}`,
    );
  }

  // Transaction aggregates.
  const agg = queryRow(
    "SELECT COUNT(*) AS n, SUM(amount) AS total, MIN(date) AS mind, MAX(date) AS maxd FROM transactions;",
  );
  console.log("");
  console.log(`  取引 合計金額: ${Number(agg.total).toLocaleString("ja-JP")} 円`);
  console.log(`  取引 期間     : ${agg.mind} 〜 ${agg.maxd}`);

  console.log("");
  if (duplicateHashes === 0) {
    console.log(`  重複ハッシュでスキップされた件数: 0 (期待通り / ${uniqueHashCount} 件がユニーク)`);
  } else {
    console.log(
      `  [警告] 重複ハッシュが ${duplicateHashes} 件検出されました。完全リロードでは 0 のはずです。`,
    );
    allMatch = false;
  }

  console.log("");
  if (allMatch) {
    console.log("=> すべてのテーブルで件数一致。移行成功。");
  } else {
    console.log("=> [警告] 一部のテーブルで不一致 or 重複あり。上記を確認してください。");
    process.exitCode = 1;
  }
}

// ---------------------------------------------------------------------------
// SQL builder. Full reload: DELETE each table (in FK-safe order), reset
// AUTOINCREMENT sequences, then batch-insert. Wrapped so a partial run cannot
// leave the DB half-loaded.
// ---------------------------------------------------------------------------

interface SqlInput {
  transactions: (TransactionRow & { import_hash: string })[];
  securities: { date: string; brokerage: string; value: number }[];
  categoryRules: { keyword: string; institution: string | null; category: string; priority: number }[];
  csvFormats: {
    name: string;
    date_col: number;
    desc_col: number;
    expense_col: number | null;
    income_col: number | null;
    balance_col: number | null;
    header_rows: number;
    encoding: string;
  }[];
  splitRules: { match_type: string; pattern: string; rate: number }[];
  excludedCategories: { category: string; scope: string }[];
}

const TABLES = [
  "transactions",
  "securities_balances",
  "category_rules",
  "csv_formats",
  "split_rules",
  "excluded_categories",
];

/** Emit multi-row INSERT statements chunked to keep each statement small. */
function insertChunks(
  table: string,
  columns: string[],
  rows: (string | number | null)[][],
  chunkSize = 200,
): string {
  if (rows.length === 0) return "";
  const lines: string[] = [];
  for (let i = 0; i < rows.length; i += chunkSize) {
    const chunk = rows.slice(i, i + chunkSize);
    const values = chunk
      .map((r) => "  (" + r.map(sqlValue).join(", ") + ")")
      .join(",\n");
    lines.push(
      `INSERT INTO ${table} (${columns.join(", ")}) VALUES\n${values};`,
    );
  }
  return lines.join("\n");
}

export function buildSql(input: SqlInput): string {
  const parts: string[] = [];
  parts.push("-- Generated by scripts/migrate-from-sheets.ts. DO NOT commit (input/ is gitignored).");
  parts.push("-- Full reload: wipe all 6 tables then re-insert from the spreadsheet export.\n");

  // Full reload: delete everything and reset AUTOINCREMENT counters.
  for (const t of TABLES) parts.push(`DELETE FROM ${t};`);
  parts.push(
    `DELETE FROM sqlite_sequence WHERE name IN (${TABLES.map((t) => `'${t}'`).join(", ")});`,
  );
  parts.push("");

  parts.push(
    insertChunks(
      "transactions",
      ["date", "description", "amount", "type", "institution", "category", "memo", "balance", "import_hash"],
      input.transactions.map((t) => [
        t.date, t.description, t.amount, t.type, t.institution, t.category, t.memo, t.balance, t.import_hash,
      ]),
    ),
  );

  parts.push(
    insertChunks(
      "securities_balances",
      ["date", "brokerage", "value"],
      input.securities.map((s) => [s.date, s.brokerage, s.value]),
    ),
  );

  parts.push(
    insertChunks(
      "category_rules",
      ["keyword", "institution", "category", "priority"],
      input.categoryRules.map((r) => [r.keyword, r.institution, r.category, r.priority]),
    ),
  );

  parts.push(
    insertChunks(
      "csv_formats",
      ["name", "date_col", "desc_col", "expense_col", "income_col", "balance_col", "header_rows", "encoding"],
      input.csvFormats.map((f) => [
        f.name, f.date_col, f.desc_col, f.expense_col, f.income_col, f.balance_col, f.header_rows, f.encoding,
      ]),
    ),
  );

  parts.push(
    insertChunks(
      "split_rules",
      ["match_type", "pattern", "rate"],
      input.splitRules.map((r) => [r.match_type, r.pattern, r.rate]),
    ),
  );

  parts.push(
    insertChunks(
      "excluded_categories",
      ["category", "scope"],
      input.excludedCategories.map((e) => [e.category, e.scope]),
    ),
  );

  return parts.filter((p) => p !== "").join("\n") + "\n";
}

main().catch((err) => {
  console.error("移行スクリプトが失敗しました:", err);
  process.exitCode = 1;
});
