import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  EditTransactionModal,
} from "../src/client/pages/TransactionsPage";
import type { TransactionListItem } from "../src/client/lib/api";

const tx: TransactionListItem = {
  id: 1,
  owner: "husband",
  date: "2026-07-01",
  description: "Amazon 注文",
  amount: 1000,
  type: "支出",
  institution: "カードA",
  category: "食料品",
  categoryLocked: false,
  memo: null,
  balance: null,
  import_hash: "hash",
  created_at: "",
  splitRate: null,
};

function render(overrides: Partial<TransactionListItem> = {}): string {
  return renderToStaticMarkup(
    createElement(EditTransactionModal, {
      tx: { ...tx, ...overrides },
      categories: ["食料品", "日用品", "未分類"],
      onClose: () => undefined,
      onSaved: () => undefined,
      onDeleted: () => undefined,
      onError: () => undefined,
    }),
  );
}

describe("EditTransactionModal", () => {
  it("uses an explicit category select instead of a datalist", () => {
    const markup = render();
    expect(markup).toContain('<select aria-label="カテゴリ"');
    expect(markup).toContain('<option value="日用品">日用品</option>');
    expect(markup).not.toContain("<datalist");
  });

  it("shows the manual lock and its release action", () => {
    const markup = render({ categoryLocked: true });
    expect(markup).toContain("手動固定");
    expect(markup).toContain("固定を解除して分類ルールに戻す");
  });

  it("keeps category controls disabled while categories are unavailable", () => {
    const loading = renderToStaticMarkup(
      createElement(EditTransactionModal, {
        tx,
        categories: ["食料品"],
        categoriesLoading: true,
        onClose: () => undefined,
        onSaved: () => undefined,
        onDeleted: () => undefined,
        onError: () => undefined,
      }),
    );
    expect(loading).toContain('<select aria-label="カテゴリ" disabled=""');
    expect(loading).toContain("カテゴリを読み込み中...");
  });
});
