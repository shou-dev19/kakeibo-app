import { useMemo, useState } from "react";
import { useNav } from "../nav";
import { useLatestDataMonth } from "../hooks/useLatestDataMonth";
import { Page, Spinner } from "../components/ui";
import { MonthlySection } from "./report/MonthlySection";
import { AnnualSection } from "./report/AnnualSection";
import { AssetsSection } from "./report/AssetsSection";
import { SplitwiseSection } from "./report/SplitwiseSection";

type Section = "monthly" | "annual" | "assets" | "splitwise";

const SEGMENTS: { key: Section; label: string }[] = [
  { key: "monthly", label: "月次" },
  { key: "annual", label: "年間" },
  { key: "assets", label: "資産" },
  { key: "splitwise", label: "割り勘" },
];

/** Report screen with a segmented control across the 4 report sub-views. */
export function ReportPage() {
  const { consumeParams } = useNav();
  const initial = useMemo(() => consumeParams(), []); // eslint-disable-line react-hooks/exhaustive-deps
  const hasDrilldownMonth = initial.year != null && initial.month != null;

  const { ym: latestYm, loading } = useLatestDataMonth();

  const [section, setSection] = useState<Section>(
    initial.reportSection ?? "monthly",
  );

  // Drilldown year/month wins; otherwise seed sections from the latest data
  // month. Passed as `initial` — sections keep their own state so user month
  // switches are never overwritten.
  const initialYm = hasDrilldownMonth
    ? { year: initial.year!, month: initial.month! }
    : latestYm;

  // Only the month-scoped sections need the latest-month lookup; block on it
  // just for those (assets is month-agnostic and can render immediately).
  const monthScoped = section === "monthly" || section === "splitwise";
  const waiting = !hasDrilldownMonth && monthScoped && loading;

  return (
    <Page title="レポート">
      {/* Segmented control */}
      <div className="flex rounded-lg bg-gray-100 p-1">
        {SEGMENTS.map((s) => (
          <button
            key={s.key}
            type="button"
            onClick={() => setSection(s.key)}
            className={`flex-1 rounded-md py-1.5 text-sm font-medium transition ${
              section === s.key
                ? "bg-white text-teal-700 shadow-sm"
                : "text-gray-500"
            }`}
          >
            {s.label}
          </button>
        ))}
      </div>

      {waiting ? (
        <Spinner />
      ) : (
        <>
          {section === "monthly" && <MonthlySection initial={initialYm} />}
          {section === "annual" && <AnnualSection initial={initialYm} />}
          {section === "assets" && <AssetsSection />}
          {section === "splitwise" && <SplitwiseSection initial={initialYm} />}
        </>
      )}
    </Page>
  );
}
