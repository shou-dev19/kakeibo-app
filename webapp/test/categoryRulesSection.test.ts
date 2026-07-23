import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { CategoryRule } from "../src/client/lib/api";
import { RuleModal } from "../src/client/pages/settings/CategoryRulesSection";

const categories = ["固定費", "食料品", "給与"];
const callbacks = {
  onClose: () => undefined,
  onDone: () => undefined,
  onToast: {
    success: () => undefined,
    error: () => undefined,
  },
};

function renderRuleModal(rule: CategoryRule | null): string {
  return renderToStaticMarkup(
    createElement(RuleModal, {
      ...callbacks,
      categories,
      rule,
    }),
  );
}

describe("RuleModal category select", () => {
  it("renders existing categories in a select with a new-rule placeholder", () => {
    const markup = renderRuleModal(null);

    expect(markup).toContain('<select aria-label="カテゴリ"');
    expect(markup).toContain('<option value="" selected="">カテゴリを選択</option>');
    for (const category of categories) {
      expect(markup).toContain(`<option value="${category}">${category}</option>`);
    }
  });

  it("selects the saved category when editing a rule", () => {
    const markup = renderRuleModal({
      id: 1,
      keyword: "スーパー",
      institution: null,
      category: "食料品",
      priority: 100,
    });

    expect(markup).toContain(
      '<option value="食料品" selected="">食料品</option>',
    );
  });
});
