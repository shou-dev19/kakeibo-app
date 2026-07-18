import { describe, it, expect } from "vitest";
import {
  assignImportHashes,
  computeImportHash,
  dedupeKey,
  type HashableTransaction,
} from "../src/shared/hash";

function tx(o: Partial<HashableTransaction> = {}): HashableTransaction {
  return {
    date: "2025-07-10",
    description: "セブンイレブン",
    amount: 500,
    type: "支出",
    institution: "三井住友カード",
    ...o,
  };
}

// Duplicate-prevention spec:
//   import_hash = SHA-256(date|desc|amount|type|institution|n)
describe("import hash", () => {
  it("produces a stable 64-char hex SHA-256", async () => {
    const h = await computeImportHash(tx(), 0);
    expect(h).toMatch(/^[0-9a-f]{64}$/);
    expect(await computeImportHash(tx(), 0)).toBe(h); // deterministic
  });

  it("builds the dedupe key from the 5 identity fields", () => {
    expect(dedupeKey(tx())).toBe("2025-07-10|セブンイレブン|500|支出|三井住友カード");
  });

  it("is idempotent: re-uploading the same rows yields identical hashes", async () => {
    const rows = [tx(), tx({ amount: 800 })];
    const first = await assignImportHashes(rows);
    const second = await assignImportHashes(rows);
    expect(first.map((r) => r.import_hash)).toEqual(second.map((r) => r.import_hash));
  });

  it("allows two legitimately-identical transactions via occurrence index n", async () => {
    // Same day, same store, same amount, twice -> n=0 and n=1 -> different hashes.
    const rows = [tx(), tx()];
    const hashed = await assignImportHashes(rows);
    expect(hashed[0].import_hash).not.toBe(hashed[1].import_hash);
  });

  it("computes n per request from 0, keeping re-uploads idempotent", async () => {
    // The importer always starts occurrence counting at 0 per file, so a
    // re-upload of the same rows reproduces the stored hashes exactly.
    const first = await assignImportHashes([tx(), tx()]);
    const reupload = await assignImportHashes([tx(), tx()]);
    expect(reupload.map((r) => r.import_hash)).toEqual(
      first.map((r) => r.import_hash),
    );
  });

  it("supports an explicit occurrence-count seed (optional API)", async () => {
    const base = await computeImportHash(tx(), 0);
    const seeded = await assignImportHashes(
      [tx()],
      new Map<string, number>([[dedupeKey(tx()), 1]]),
    );
    // Seeding to n=1 yields a different hash than n=0.
    expect(seeded[0].import_hash).not.toBe(base);
  });
});
