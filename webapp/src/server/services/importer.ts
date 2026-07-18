// Import orchestration service. Ties the pure shared logic (decode -> detect ->
// parse -> categorize -> hash) to the D1 repository. Each input file is handled
// independently so one file's failure never affects the others.

import type { CategoryRule, CsvFormat } from "../../shared/types";
import { parseCsv, type ParsedTransaction } from "../../shared/csv";
import { categorizeMany } from "../../shared/categorize";
import { assignImportHashes } from "../../shared/hash";
import { detectFormat } from "../../shared/detectFormat";
import { base64ToBytes, decodeCsvBytes } from "./decode";
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

/** Resolve which format to use for a file: explicit name, else auto-detect. */
function resolveFormat(
  text: string,
  formats: CsvFormat[],
  formatName: string | undefined,
): { format: CsvFormat | null; confident: boolean } {
  if (formatName) {
    const f = formats.find((x) => x.name === formatName) ?? null;
    return { format: f, confident: f != null };
  }
  const det = detectFormat(text, formats);
  return { format: det.best, confident: det.confident };
}

/**
 * Decode a file to text. We try the resolved format's declared encoding first;
 * if no explicit format, we try each distinct declared encoding and pick the
 * one that produces the most parseable result during detection. To keep it
 * simple and deterministic, detection runs on the UTF-8 decode AND the
 * Shift_JIS decode and uses whichever yields a confident match.
 */
function decodeWithFormats(
  bytes: Uint8Array,
  formats: CsvFormat[],
  formatName: string | undefined,
): { text: string; encoding: string } {
  if (formatName) {
    const f = formats.find((x) => x.name === formatName);
    const enc = f?.encoding ?? "utf-8";
    return { text: decodeCsvBytes(bytes, enc), encoding: enc };
  }
  // No explicit format: try each distinct encoding declared across formats and
  // choose the decode under which some format detects confidently; fall back to
  // UTF-8.
  const encodings = [...new Set(formats.map((f) => f.encoding || "utf-8"))];
  if (encodings.length === 0) encodings.push("utf-8");

  let fallback = { text: decodeCsvBytes(bytes, encodings[0]), encoding: encodings[0] };
  for (const enc of encodings) {
    const text = decodeCsvBytes(bytes, enc);
    const det = detectFormat(text, formats);
    if (det.confident) return { text, encoding: enc };
    // Keep UTF-8 as the preferred fallback if present.
    if (enc === "utf-8") fallback = { text, encoding: enc };
  }
  return fallback;
}

/** A parsed, categorized, hash-assigned row ready for insertion. */
type HashedRow = ParsedTransaction & { category: string; import_hash: string };

/**
 * Parse + categorize + hash a single file's bytes. Never throws.
 *
 * Occurrence indices (n) are computed per file from scratch (starting at 0).
 * This is what makes re-uploading the exact same file fully idempotent: the
 * identical rows produce identical hashes, which collide with the stored ones
 * and are skipped. We intentionally do NOT seed n from the DB's existing
 * duplicate counts — doing so would shift a re-upload's hashes and defeat
 * idempotency.
 */
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
    const { text } = decodeWithFormats(bytes, formats, file.formatName);
    const { format, confident } = resolveFormat(text, formats, file.formatName);

    if (!format) {
      return {
        format: null,
        confident: false,
        hashed: [],
        error: "フォーマットを自動判定できませんでした。手動で選択してください。",
      };
    }

    const parsed = parseCsv(text, format);
    const categorized = categorizeMany(parsed, rules);
    const hashed = await assignImportHashes(categorized);
    return { format, confident, hashed, error: null };
  } catch (e) {
    return {
      format: null,
      confident: false,
      hashed: [],
      error: e instanceof Error ? e.message : String(e),
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
