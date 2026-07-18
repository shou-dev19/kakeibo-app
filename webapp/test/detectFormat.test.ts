import { describe, it, expect } from "vitest";
import { detectFormat } from "../src/shared/detectFormat";
import type { CsvFormat } from "../src/shared/types";

const sumitomo: CsvFormat = {
  id: 1,
  name: "三井住友カード",
  date_col: 1,
  desc_col: 2,
  expense_col: 3,
  income_col: null,
  balance_col: null,
  header_rows: 1,
  encoding: "Shift_JIS",
};

// A format that reads columns in a different order (date in col 2), so it
// should fail to parse a 三井住友 file.
const other: CsvFormat = {
  id: 2,
  name: "別フォーマット",
  date_col: 2,
  desc_col: 3,
  expense_col: 4,
  income_col: null,
  balance_col: null,
  header_rows: 1,
  encoding: "UTF-8",
};

const sumitomoCsv = [
  "日付,内容,金額",
  "2025/07/01,コンビニ,500",
  "2025/07/02,スーパー,1200",
  "2025/07/03,カフェ,800",
].join("\n");

describe("detectFormat", () => {
  it("confidently selects the format that parses the file", () => {
    const r = detectFormat(sumitomoCsv, [sumitomo, other]);
    expect(r.confident).toBe(true);
    expect(r.best?.name).toBe("三井住友カード");
  });

  it("reports no confident match when no format parses well", () => {
    // A file whose date column never yields a valid date under any format.
    const garbage = ["h1,h2,h3", "x,y,z", "p,q,r"].join("\n");
    const r = detectFormat(garbage, [sumitomo, other]);
    expect(r.confident).toBe(false);
    expect(r.best).toBeNull();
  });

  it("returns no candidates when no formats are registered", () => {
    const r = detectFormat(sumitomoCsv, []);
    expect(r.confident).toBe(false);
    expect(r.candidates).toEqual([]);
  });

  it("ranks the better-parsing format first in candidates", () => {
    const r = detectFormat(sumitomoCsv, [other, sumitomo]);
    expect(r.candidates[0].format.name).toBe("三井住友カード");
  });
});
