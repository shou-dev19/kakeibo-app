// Import orchestration service. Ties the pure shared logic (decode -> detect ->
// parse -> categorize -> hash) to the D1 repository. Each input file is handled
// independently so one file's failure never affects the others.

import type { CategoryRule, CsvFormat } from "../../shared/types";
import { parseCsv, type ParsedTransaction } from "../../shared/csv";
import { categorizeMany } from "../../shared/categorize";
import { assignImportHashes } from "../../shared/hash";
import { evaluateFormat, selectFormat } from "../../shared/detectFormat";
import { base64ToBytes, decodeCsvBytesStrict } from "./decode";
import {
  getCategoryRules,
  getCsvFormats,
  getExistingImportHashes,
  insertTransactionIgnoreDup,
} from "./repository";

/** One file in an import/preview request. `contentBase64` holds raw bytes. */
export interface ImportFileInput {
  filename: string;
  contentBase64: string;
  /** Optional explicit format name; when omitted, auto-detection is used. */
  formatName?: string;
}

export interface ImportPreviewFile {
  filename: string;
  detectedFormat: string | null;
  detectionConfident: boolean;
  count: number;
  /** Earliest / latest transaction date in the file, or null when empty. */
  dateFrom: string | null;
  dateTo: string | null;
  /** Rows within this file that would be skipped as duplicates. */
  duplicateCount: number;
  error: string | null;
}

export interface ImportResultFile {
  filename: string;
  format: string | null;
  imported: number;
  duplicateSkipped: number;
  error: string | null;
}

interface ResolvedFile {
  format: CsvFormat | null;
  text: string | null;
  confident: boolean;
  error: string | null;
}

/** Resolve a manual selection or evaluate each format with its own encoding. */
function resolveFile(
  bytes: Uint8Array,
  formats: CsvFormat[],
  formatName: string | undefined,
): ResolvedFile {
  if (formatName) {
    const format = formats.find((candidate) => candidate.name === formatName) ?? null;
    if (!format) {
      return {
        format: null,
        text: null,
        confident: false,
        error: `定義されていないCSVフォーマットです: ${formatName}`,
      };
    }
    try {
      return {
        format,
        text: decodeCsvBytesStrict(bytes, format.encoding),
        confident: true,
        error: null,
      };
    } catch (error) {
      return {
        format: null,
        text: null,
        confident: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  const decoded = new Map<string, string | null>();
  const evaluated: Array<{
    format: CsvFormat;
    text: string;
    candidate: ReturnType<typeof evaluateFormat>;
  }> = [];

  for (const format of formats) {
    const encodingKey = format.encoding.trim().toLowerCase();
    if (!decoded.has(encodingKey)) {
      try {
        decoded.set(encodingKey, decodeCsvBytesStrict(bytes, format.encoding));
      } catch {
        decoded.set(encodingKey, null);
      }
    }
    const text = decoded.get(encodingKey);
    if (text == null) continue;
    evaluated.push({ format, text, candidate: evaluateFormat(text, format) });
  }

  const detection = selectFormat(evaluated.map((entry) => entry.candidate));
  if (!detection.best) {
    return {
      format: null,
      text: null,
      confident: false,
      error: detection.failureReason === "ambiguous"
        ? "複数のCSVフォーマット候補が一致しました。手動で選択してください。"
        : "フォーマットを自動判定できませんでした。手動で選択してください。",
    };
  }

  const selected = evaluated.find((entry) => entry.format.id === detection.best?.id);
  return {
    format: detection.best,
    text: selected?.text ?? null,
    confident: detection.confident,
    error: selected ? null : "CSVフォーマットの判定結果を取得できませんでした。",
  };
}

/** A parsed, categorized, hash-assigned row ready for insertion. */
type HashedRow = ParsedTransaction & { category: string; import_hash: string };

/** Parse + categorize + hash a single file's bytes. Never throws. */
async function processFile(
  file: ImportFileInput,
  formats: CsvFormat[],
  rules: CategoryRule[],
): Promise<{
  format: CsvFormat | null;
  confident: boolean;
  hashed: HashedRow[];
  error: string | null;
}> {
  try {
    const bytes = base64ToBytes(file.contentBase64);
    const resolved = resolveFile(bytes, formats, file.formatName);
    if (resolved.error || !resolved.format || resolved.text == null) {
      return {
        format: resolved.format,
        confident: resolved.confident,
        hashed: [],
        error: resolved.error,
      };
    }

    const parsed = parseCsv(resolved.text, resolved.format);
    if (parsed.length === 0) {
      return {
        format: resolved.format,
        confident: resolved.confident,
        hashed: [],
        error: "選択したCSVフォーマットでは有効な取引を読み取れませんでした。",
      };
    }

    const categorized = categorizeMany(parsed, rules);
    const hashed = await assignImportHashes(categorized);
    return {
      format: resolved.format,
      confident: resolved.confident,
      hashed,
      error: null,
    };
  } catch (error) {
    return {
      format: null,
      confident: false,
      hashed: [],
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/** Preview multiple files without writing anything. */
export async function previewImports(
  db: D1Database,
  files: ImportFileInput[],
): Promise<ImportPreviewFile[]> {
  const formats = await getCsvFormats(db);
  const rules = await getCategoryRules(db);

  // Duplicate detection mirrors the real import: a row is a duplicate if its
  // import_hash already exists in the DB, or was already seen in an earlier
  // file within this same preview request. Because per-file occurrence indices
  // start at 0, a re-uploaded identical file produces the exact hashes already
  // stored and is reported as fully duplicate.
  const existingHashes = await getExistingImportHashes(db);
  const seen = new Set<string>(existingHashes);

  const out: ImportPreviewFile[] = [];
  for (const file of files) {
    const { format, confident, hashed, error } = await processFile(
      file,
      formats,
      rules,
    );

    if (error || !format) {
      out.push({
        filename: file.filename,
        detectedFormat: format?.name ?? null,
        detectionConfident: confident,
        count: 0,
        dateFrom: null,
        dateTo: null,
        duplicateCount: 0,
        error,
      });
      continue;
    }

    const dates = hashed.map((h) => h.date).sort();
    let duplicateCount = 0;
    for (const h of hashed) {
      if (seen.has(h.import_hash)) duplicateCount += 1;
      else seen.add(h.import_hash);
    }

    out.push({
      filename: file.filename,
      detectedFormat: format.name,
      detectionConfident: confident,
      count: hashed.length,
      dateFrom: dates[0] ?? null,
      dateTo: dates[dates.length - 1] ?? null,
      duplicateCount,
      error: null,
    });
  }
  return out;
}

/** Import multiple files, each in isolation. Returns per-file results. */
export async function runImports(
  db: D1Database,
  files: ImportFileInput[],
): Promise<ImportResultFile[]> {
  const formats = await getCsvFormats(db);
  const rules = await getCategoryRules(db);

  const out: ImportResultFile[] = [];
  for (const file of files) {
    const { format, hashed, error } = await processFile(file, formats, rules);

    if (error || !format) {
      out.push({
        filename: file.filename,
        format: format?.name ?? null,
        imported: 0,
        duplicateSkipped: 0,
        error: error ?? "フォーマットを判定できませんでした。",
      });
      continue;
    }

    let imported = 0;
    let duplicateSkipped = 0;
    try {
      for (const tx of hashed) {
        const ok = await insertTransactionIgnoreDup(db, {
          date: tx.date,
          description: tx.description,
          amount: tx.amount,
          type: tx.type,
          institution: tx.institution,
          category: tx.category,
          memo: null,
          balance: tx.balance,
          import_hash: tx.import_hash,
        });
        if (ok) imported += 1;
        else duplicateSkipped += 1;
      }
      out.push({
        filename: file.filename,
        format: format.name,
        imported,
        duplicateSkipped,
        error: null,
      });
    } catch (e) {
      out.push({
        filename: file.filename,
        format: format.name,
        imported,
        duplicateSkipped,
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }
  return out;
}
