import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AnnualSection } from "../src/client/pages/report/AnnualSection";

describe("AnnualSection month navigation", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("clamps a future initial month and disables the next button", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 6, 24));

    const html = renderToStaticMarkup(
      createElement(AnnualSection, {
        initial: { year: 2026, month: 7 },
      }),
    );

    expect(html).toContain("2026年6月まで（直近12ヶ月）");
    expect(html).toContain('disabled=""');
  });

  it("defaults to two months ago with the next button enabled", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 6, 24));

    const html = renderToStaticMarkup(createElement(AnnualSection));

    expect(html).toContain("2026年5月まで（直近12ヶ月）");
    expect(html).not.toContain('disabled=""');
  });
});
