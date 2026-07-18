import { describe, it, expect } from "vitest";
import { normalizeDate } from "../src/shared/dates";

// Rule 1: normalizeDate supports YYYY/MM/DD and YYMMDD (6 digits); invalid
// dates return null so the row is skipped.
describe("normalizeDate", () => {
  it("parses YYYY/MM/DD to ISO", () => {
    expect(normalizeDate("2025/07/12")).toBe("2025-07-12");
  });

  it("parses YYYY/M/D (unpadded) to ISO", () => {
    expect(normalizeDate("2025/7/2")).toBe("2025-07-02");
  });

  it("parses YYMMDD (6 digits) to ISO with 20xx century", () => {
    expect(normalizeDate("250712")).toBe("2025-07-12");
    expect(normalizeDate("991231")).toBe("2099-12-31");
  });

  it("returns null for empty / nullish input", () => {
    expect(normalizeDate("")).toBeNull();
    expect(normalizeDate("   ")).toBeNull();
    expect(normalizeDate(null)).toBeNull();
    expect(normalizeDate(undefined)).toBeNull();
  });

  it("returns null for a non-existent calendar date (rollover rejected)", () => {
    expect(normalizeDate("2025/02/30")).toBeNull();
    expect(normalizeDate("250230")).toBeNull(); // Feb 30 via YYMMDD
    expect(normalizeDate("2025/13/01")).toBeNull();
  });

  it("returns null for malformed strings", () => {
    expect(normalizeDate("2025-07-12")).toBeNull(); // dashes not supported
    expect(normalizeDate("20250712")).toBeNull(); // 8 digits not 6
    expect(normalizeDate("abc")).toBeNull();
    expect(normalizeDate("12345")).toBeNull(); // 5 digits
  });
});
