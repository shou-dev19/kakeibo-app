import { describe, it, expect } from "vitest";
import { base64ToBytes, decodeCsvBytes, decodeCsvBytesStrict } from "../src/server/services/decode";

// Shift_JIS handling. Node's TextDecoder (used by the vitest node env) supports
// 'shift_jis', and — verified separately via `wrangler dev` — so does the
// Workers runtime (workerd). Hence the API decodes bytes server-side.
describe("decodeCsvBytes", () => {
  // "日本語" encoded in Shift_JIS: 日=93FA 本=967B 語=8CEA
  const sjisBytes = new Uint8Array([0x93, 0xfa, 0x96, 0x7b, 0x8c, 0xea]);

  it("decodes Shift_JIS bytes to Japanese text", () => {
    expect(decodeCsvBytes(sjisBytes, "Shift_JIS")).toBe("日本語");
  });

  it("accepts common Shift_JIS aliases", () => {
    for (const label of ["shift-jis", "sjis", "cp932", "windows-31j", "MS932"]) {
      expect(decodeCsvBytes(sjisBytes, label)).toBe("日本語");
    }
  });

  it("decodes UTF-8 by default and strips a BOM", () => {
    const bom = new Uint8Array([0xef, 0xbb, 0xbf, 0x41]); // BOM + 'A'
    expect(decodeCsvBytes(bom, "UTF-8")).toBe("A");
    expect(decodeCsvBytes(new TextEncoder().encode("あ"), undefined)).toBe("あ");
  });

  it("strict decoding rejects bytes invalid for the configured encoding", () => {
    expect(() => decodeCsvBytesStrict(sjisBytes, "UTF-8")).toThrow(
      "設定された文字コードでCSVを読み取れませんでした。",
    );
    expect(decodeCsvBytesStrict(sjisBytes, "Shift_JIS")).toBe("日本語");
  });
});

describe("base64ToBytes", () => {
  it("round-trips through btoa", () => {
    const bytes = base64ToBytes(btoa("hello"));
    expect(new TextDecoder().decode(bytes)).toBe("hello");
  });
});
