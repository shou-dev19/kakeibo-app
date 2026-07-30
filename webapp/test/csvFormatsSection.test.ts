import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { CsvFormat } from "../src/client/lib/api";
import {
  FormatModal,
  formatEncodingLabel,
  hasSelectedEncoding,
} from "../src/client/pages/settings/CsvFormatsSection";

const callbacks = {
  onClose: () => undefined,
  onDone: () => undefined,
  onToast: {
    success: () => undefined,
    error: () => undefined,
  },
};

const format: CsvFormat = {
  id: 1,
  name: "架空カード",
  date_col: 1,
  desc_col: 2,
  expense_col: 3,
  income_col: null,
  balance_col: null,
  header_rows: 1,
  encodings: ["Shift_JIS", "UTF-8"],
  header_signature: "date,description,amount",
  expected_columns: 3,
};

describe("CSV format encoding settings", () => {
  it("renders both encoding checkboxes and restores all saved selections", () => {
    const markup = renderToStaticMarkup(
      createElement(FormatModal, { ...callbacks, format }),
    );
    expect(markup).toContain('type="checkbox"');
    expect(markup).toMatch(/checked="" value="Shift_JIS"/);
    expect(markup).toMatch(/checked="" value="UTF-8"/);
  });

  it("requires at least one candidate and formats the list in priority order", () => {
    expect(hasSelectedEncoding([])).toBe(false);
    expect(hasSelectedEncoding(["UTF-8"])).toBe(true);
    expect(formatEncodingLabel(["Shift_JIS", "UTF-8"])).toBe(
      "Shift_JIS・UTF-8",
    );
  });
});
