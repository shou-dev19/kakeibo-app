// CSV byte decoding.
//
// Shift_JIS handling: the Cloudflare Workers runtime (workerd) DOES support
// `new TextDecoder('shift_jis')` — verified with `wrangler dev` (labels
// 'shift_jis', 'shift-jis', 'sjis', 'windows-31j' all decode Japanese text
// correctly; note 'cp932' is NOT a valid label, use 'windows-31j'). Therefore
// the API accepts raw file bytes (base64) and decodes server-side; the client
// does not need to decode.

/** Map GAS/legacy encoding names to WHATWG TextDecoder labels. */
function normalizeEncodingLabel(encoding: string | null | undefined): string {
  const e = (encoding ?? "").trim().toLowerCase();
  if (e === "" || e === "utf-8" || e === "utf8") return "utf-8";
  if (
    e === "shift_jis" ||
    e === "shift-jis" ||
    e === "sjis" ||
    e === "cp932" ||
    e === "windows-31j" ||
    e === "ms932"
  ) {
    // 'shift_jis' is a canonical WHATWG label supported by workerd.
    return "shift_jis";
  }
  return e;
}

/**
 * Decode a byte array to text using the given encoding name. Falls back to
 * UTF-8 if the label is unknown. `fatal: false` so malformed bytes become the
 * replacement character rather than throwing (matches GAS lenient behavior).
 */
export function decodeCsvBytes(
  bytes: Uint8Array,
  encoding: string | null | undefined,
): string {
  const label = normalizeEncodingLabel(encoding);
  let decoder: TextDecoder;
  try {
    decoder = new TextDecoder(label, { fatal: false, ignoreBOM: false });
  } catch {
    decoder = new TextDecoder("utf-8", { fatal: false, ignoreBOM: false });
  }
  const text = decoder.decode(bytes);
  // Strip a leading UTF-8 BOM if present.
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

/** Decode strictly for format detection; malformed bytes and unknown labels fail. */
export function decodeCsvBytesStrict(
  bytes: Uint8Array,
  encoding: string | null | undefined,
): string {
  const label = normalizeEncodingLabel(encoding);
  try {
    const text = new TextDecoder(label, { fatal: true, ignoreBOM: false }).decode(bytes);
    return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  } catch {
    throw new Error("設定された文字コードでCSVを読み取れませんでした。");
  }
}

/** Decode a base64 string to a Uint8Array (Workers/Node both provide atob). */
export function base64ToBytes(b64: string): Uint8Array {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}
