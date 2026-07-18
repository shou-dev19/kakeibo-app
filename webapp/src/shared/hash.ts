// Import-hash computation for duplicate-import prevention.
//
// import_hash = SHA-256(date|description|amount|type|institution|n)
// where `n` is the 0-based occurrence index of an otherwise-identical row
// within the same import key.
//
// Including `n` means:
//   - Re-uploading the same CSV is fully idempotent (same rows -> same hashes,
//     which collide with the UNIQUE(import_hash) constraint and get skipped).
//   - Two legitimately-identical transactions on the same day at the same
//     store for the same amount (n=0 and n=1) produce different hashes and are
//     both retained.
//
// Uses WebCrypto's `crypto.subtle`, available in both the Workers runtime and
// Node 20+.

const KEY_SEP = "|";

/** The fields that identify a transaction for de-duplication. */
export interface HashableTransaction {
  date: string;
  description: string;
  amount: number;
  type: string;
  institution: string | null;
}

/** Build the natural key (without occurrence index) for grouping duplicates. */
export function dedupeKey(tx: HashableTransaction): string {
  return [tx.date, tx.description, tx.amount, tx.type, tx.institution ?? ""].join(
    KEY_SEP,
  );
}

/** Compute the SHA-256 hex digest of a string. */
export async function sha256Hex(input: string): Promise<string> {
  const bytes = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  const view = new Uint8Array(digest);
  let hex = "";
  for (let i = 0; i < view.length; i++) {
    hex += view[i].toString(16).padStart(2, "0");
  }
  return hex;
}

/**
 * Compute the import hash for a transaction given its occurrence index `n`
 * within its dedupe key.
 */
export function computeImportHash(
  tx: HashableTransaction,
  n: number,
): Promise<string> {
  return sha256Hex(dedupeKey(tx) + KEY_SEP + n);
}

/**
 * Assign occurrence indices and compute import hashes for a list of
 * transactions in order. Occurrence index resets per natural key, so the first
 * time a given key appears gets n=0, the next n=1, etc.
 *
 * `existingCounts` optionally seeds the per-key counter so that hashes computed
 * across multiple import batches (or against already-stored rows) continue the
 * sequence rather than restarting at 0. Callers that import a single self-
 * contained file can omit it.
 */
export async function assignImportHashes<T extends HashableTransaction>(
  txs: T[],
  existingCounts: Map<string, number> = new Map(),
): Promise<(T & { import_hash: string })[]> {
  const counts = new Map(existingCounts);
  const out: (T & { import_hash: string })[] = [];
  for (const tx of txs) {
    const key = dedupeKey(tx);
    const n = counts.get(key) ?? 0;
    counts.set(key, n + 1);
    const import_hash = await computeImportHash(tx, n);
    out.push({ ...tx, import_hash });
  }
  return out;
}
