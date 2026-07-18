// CSV format auto-detection. Pure functions, no runtime/D1 dependencies.
//
// For each registered csv_format we attempt a parse and score it by:
//   - valid-row rate (fraction of non-header rows that yield a transaction)
//   - date validity  (fraction of non-header rows with a parseable date)
// The best-scoring candidate is selected; if confidence is too low we report a
// detection failure so the UI can prompt the user to pick a format manually.

import type { CsvFormat } from "./types";
import { parseCsv, parseCsvRows } from "./csv";
import { normalizeDate } from "./dates";

export interface FormatCandidateScore {
  format: CsvFormat;
  /** Fraction (0..1) of data rows that parsed into a transaction. */
  validRowRate: number;
  /** Fraction (0..1) of data rows whose date column normalized successfully. */
  dateValidRate: number;
  /** Number of transactions produced. */
  parsedCount: number;
  /** Combined score used for ranking. */
  score: number;
}

export interface DetectionResult {
  /** Best format, or null if no candidate cleared the confidence threshold. */
  best: CsvFormat | null;
  /** True when a confident match was found. */
  confident: boolean;
  /** All candidate scores, best first. */
  candidates: FormatCandidateScore[];
}

/**
 * Minimum combined score (and minimum date-validity) for a confident match.
 * Below this the UI should fall back to manual format selection.
 */
export const CONFIDENCE_THRESHOLD = 0.6;

function scoreFormat(text: string, format: CsvFormat): FormatCandidateScore {
  const rows = parseCsvRows(text);
  const dataRows = rows.slice(Math.max(0, format.header_rows));
  const total = dataRows.length;

  if (total === 0) {
    return { format, validRowRate: 0, dateValidRate: 0, parsedCount: 0, score: 0 };
  }

  let dateValid = 0;
  for (const record of dataRows) {
    if (normalizeDate(record[format.date_col - 1])) dateValid += 1;
  }

  const parsed = parseCsv(text, format);
  const validRowRate = parsed.length / total;
  const dateValidRate = dateValid / total;

  // Weight date validity a bit higher: a wrong format usually fails to produce
  // valid dates, which is the strongest signal.
  const score = 0.4 * validRowRate + 0.6 * dateValidRate;

  return {
    format,
    validRowRate,
    dateValidRate,
    parsedCount: parsed.length,
    score,
  };
}

/**
 * Detect the best-fitting format for the given CSV text among `formats`.
 * A match is "confident" when the top score and its date-validity both clear
 * CONFIDENCE_THRESHOLD, and it is strictly better than the runner-up (or is the
 * only candidate).
 */
export function detectFormat(text: string, formats: CsvFormat[]): DetectionResult {
  if (formats.length === 0) {
    return { best: null, confident: false, candidates: [] };
  }

  const candidates = formats
    .map((f) => scoreFormat(text, f))
    .sort((a, b) => b.score - a.score || b.parsedCount - a.parsedCount);

  const top = candidates[0];
  const runnerUp = candidates[1];

  const clearsThreshold =
    top.score >= CONFIDENCE_THRESHOLD &&
    top.dateValidRate >= CONFIDENCE_THRESHOLD &&
    top.parsedCount > 0;

  // Require the top to beat the runner-up, otherwise two formats parse equally
  // well and we can't be confident which is correct.
  const beatsRunnerUp = !runnerUp || top.score > runnerUp.score;

  const confident = clearsThreshold && beatsRunnerUp;

  return {
    best: confident ? top.format : null,
    confident,
    candidates,
  };
}
