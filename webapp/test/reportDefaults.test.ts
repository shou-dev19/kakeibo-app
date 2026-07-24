import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { NavProvider } from "../src/client/nav";
import { ReportPage } from "../src/client/pages/ReportPage";
import { SplitwiseSection } from "../src/client/pages/report/SplitwiseSection";

describe("report default month", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("opens the monthly tab two months before the current month", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 6, 24));

    const html = renderToStaticMarkup(
      createElement(
        NavProvider,
        null,
        createElement(ReportPage),
      ),
    );

    expect(html).toContain("2026年5月");
  });

  it("opens the splitwise section two months before the current month", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 6, 24));

    const html = renderToStaticMarkup(createElement(SplitwiseSection));

    expect(html).toContain("2026年5月");
  });
});
