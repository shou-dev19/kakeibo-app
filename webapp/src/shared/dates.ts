// Date normalization utilities. Pure functions, no runtime dependencies.
//
// Ported from Service_CsvImporter.gs `normalizeDate`. Supports two input
// formats used by Japanese bank / card CSV exports:
//   - `YYYY/MM/DD` (e.g. "2025/07/12")
//   - `YYMMDD`     (6 digits, e.g. "250712" => 2025-07-12)
// Invalid dates return null so callers can skip the row.

/**
 * Normalize a raw date string to an ISO `YYYY-MM-DD` string, or null if it
 * cannot be parsed to a real calendar date.
 *
 * The GAS version returned a `Date`; here we return an ISO date string because
 * the D1 schema stores `date` as TEXT (`YYYY-MM-DD`) and the app never needs a
 * time component. This avoids all timezone ambiguity that a JS `Date` would
 * introduce.
 */
export function normalizeDate(dateStr: string | null | undefined): string | null {
  if (dateStr == null) return null;
  const s = String(dateStr).trim();
  if (s === "") return null;

  // YYYY/MM/DD (and YYYY/M/D) form.
  if (s.includes("/")) {
    const parts = s.split("/");
    if (parts.length !== 3) return null;
    const year = Number(parts[0]);
    const month = Number(parts[1]);
    const day = Number(parts[2]);
    return buildIsoDate(year, month, day);
  }

  // YYMMDD form (exactly 6 digits).
  if (/^\d{6}$/.test(s)) {
    const year = 2000 + Number(s.substring(0, 2));
    const month = Number(s.substring(2, 4));
    const day = Number(s.substring(4, 6));
    return buildIsoDate(year, month, day);
  }

  return null;
}

/**
 * Validate a (year, month, day) triple and format it as `YYYY-MM-DD`.
 * Rejects out-of-range months/days and non-existent dates (e.g. 2025-02-30).
 */
function buildIsoDate(year: number, month: number, day: number): string | null {
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) {
    return null;
  }
  if (year < 1 || month < 1 || month > 12 || day < 1 || day > 31) return null;

  // Reject dates that roll over (e.g. Feb 30 -> Mar 2).
  const d = new Date(Date.UTC(year, month - 1, day));
  if (
    d.getUTCFullYear() !== year ||
    d.getUTCMonth() !== month - 1 ||
    d.getUTCDate() !== day
  ) {
    return null;
  }

  const mm = String(month).padStart(2, "0");
  const dd = String(day).padStart(2, "0");
  return `${year}-${mm}-${dd}`;
}
