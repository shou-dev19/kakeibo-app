import { useMemo, useState } from "react";
import { useNav } from "../nav";
import { defaultReportMonth } from "../lib/reportPeriod";
import { Page } from "../components/ui";
import { OwnerTabs, useOwnerScope } from "../components/OwnerTabs";
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

  const [section, setSection] = useState<Section>(
    initial.reportSection ?? "monthly",
  );
  const [ownerScope, setOwnerScope] = useOwnerScope();

  // Drilldown year/month wins; otherwise seed sections from two months ago.
  // Passed as `initial` — sections keep their own state so user month
  // switches are never overwritten.
  const fallbackYm = useMemo(() => defaultReportMonth(), []);
  const initialYm = hasDrilldownMonth
    ? { year: initial.year!, month: initial.month! }
    : fallbackYm;

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

      {/* 割り勘は世帯単位の数字なので、利用者の切替は出さない。 */}
      {section !== "splitwise" && (
        <OwnerTabs value={ownerScope} onChange={setOwnerScope} />
      )}

      {section === "monthly" && (
        <MonthlySection initial={initialYm} ownerScope={ownerScope} />
      )}
      {section === "annual" && (
        <AnnualSection initial={initialYm} ownerScope={ownerScope} />
      )}
      {section === "assets" && <AssetsSection ownerScope={ownerScope} />}
      {section === "splitwise" && <SplitwiseSection initial={initialYm} />}
    </Page>
  );
}
