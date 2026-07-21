// CSV format auto-detection. Pure functions, no runtime/D1 dependencies.

import type { CsvFormat } from "./types";
import { parseCsv, parseCsvRows } from "./csv";
import { normalizeDate } from "./dates";

export const COLUMN_MATCH_THRESHOLD = 0.8;
export const DATE_VALID_THRESHOLD = 0.6;
export const TRANSACTION_VALID_THRESHOLD = 0.6;

export type DetectionFailureReason =
  | "settings_missing"
  | "invalid_header_signature"
  | "header_mismatch"
  | "no_data_rows"
  | "column_rate_low"
  | "date_rate_low"
  | "transaction_rate_low"
  | "no_transactions";

export interface FormatCandidateScore {
  format: CsvFormat;
  headerMatched: boolean | null;
  columnMatchRate: number;
  dateValidRate: number;
  validRowRate: number;
  parsedCount: number;
  eligible: boolean;
  reasons: DetectionFailureReason[];
}

export interface DetectionResult {
  best: CsvFormat | null;
  confident: boolean;
  candidates: FormatCandidateScore[];
  failureReason: "no_match" | "ambiguous" | null;
}

function isEmptyRow(row: string[]): boolean {
  return row.every((cell) => cell.trim() === "");
}

/** Normalize header labels without weakening their column-order semantics. */
export function normalizeHeaderCell(cell: string): string {
  return cell
    .replace(/^\uFEFF/, "")
    .normalize("NFKC")
    .trim()
    .replace(/\s+/gu, " ");
}

function headerRowsEqual(actual: string[], expected: string[]): boolean {
  if (actual.length !== expected.length) return false;
  return expected.every((cell, index) => {
    const normalizedExpected = normalizeHeaderCell(cell);
    return normalizedExpected === "*" || normalizeHeaderCell(actual[index] ?? "") === normalizedExpected;
  });
}

/** Evaluate one format against text already decoded with that format's encoding. */
export function evaluateFormat(text: string, format: CsvFormat): FormatCandidateScore {
  const reasons: DetectionFailureReason[] = [];
  const rows = parseCsvRows(text);
  const headerRows = Math.max(0, format.header_rows);
  const prefixRows = rows.slice(0, headerRows);
  const dataRows = rows.slice(headerRows).filter((row) => !isEmptyRow(row));
  const total = dataRows.length;

  let headerMatched: boolean | null = null;
  const signature = format.header_signature?.trim() ?? "";
  if (signature !== "") {
    const parsedSignature = parseCsvRows(signature);
    if (headerRows < 1 || parsedSignature.length !== 1) {
      headerMatched = false;
      reasons.push("invalid_header_signature");
    } else {
      headerMatched = prefixRows.some((row) => headerRowsEqual(row, parsedSignature[0]));
      if (!headerMatched) reasons.push("header_mismatch");
    }
  }

  if (format.expected_columns == null || format.expected_columns < 1) {
    reasons.push("settings_missing");
  }
  if (total === 0) reasons.push("no_data_rows");

  const columnMatches = format.expected_columns == null
    ? 0
    : dataRows.filter((row) => row.length === format.expected_columns).length;
  const dateValid = dataRows.filter((row) =>
    normalizeDate(row[format.date_col - 1]),
  ).length;
  const parsed = parseCsv(text, format);

  const columnMatchRate = total === 0 ? 0 : columnMatches / total;
  const dateValidRate = total === 0 ? 0 : dateValid / total;
  const validRowRate = total === 0 ? 0 : parsed.length / total;

  if (columnMatchRate < COLUMN_MATCH_THRESHOLD) reasons.push("column_rate_low");
  if (dateValidRate < DATE_VALID_THRESHOLD) reasons.push("date_rate_low");
  if (validRowRate < TRANSACTION_VALID_THRESHOLD) reasons.push("transaction_rate_low");
  if (parsed.length === 0) reasons.push("no_transactions");

  return {
    format,
    headerMatched,
    columnMatchRate,
    dateValidRate,
    validRowRate,
    parsedCount: parsed.length,
    eligible: reasons.length === 0,
    reasons,
  };
}

/** Select only an unambiguous eligible candidate; never force-rank close matches. */
export function selectFormat(candidates: FormatCandidateScore[]): DetectionResult {
  const eligible = candidates.filter((candidate) => candidate.eligible);
  const headerMatches = eligible.filter((candidate) => candidate.headerMatched === true);

  if (headerMatches.length === 1) {
    return {
      best: headerMatches[0].format,
      confident: true,
      candidates,
      failureReason: null,
    };
  }
  if (headerMatches.length > 1) {
    return { best: null, confident: false, candidates, failureReason: "ambiguous" };
  }

  const headerless = eligible.filter((candidate) => candidate.headerMatched === null);
  if (headerless.length === 1) {
    return {
      best: headerless[0].format,
      confident: true,
      candidates,
      failureReason: null,
    };
  }

  return {
    best: null,
    confident: false,
    candidates,
    failureReason: headerless.length > 1 ? "ambiguous" : "no_match",
  };
}

/** Convenience entry point when every candidate shares the same decoded text. */
export function detectFormat(text: string, formats: CsvFormat[]): DetectionResult {
  return selectFormat(formats.map((format) => evaluateFormat(text, format)));
}
