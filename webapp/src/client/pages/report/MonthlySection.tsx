import { useState } from "react";
import { api } from "../../lib/api";
import { useAsync } from "../../hooks/useAsync";
import { useNav } from "../../nav";
import {
  currentYearMonth,
  formatYen,
  formatYenSigned,
  percentOf,
  type YearMonth,
} from "../../lib/format";
import { MonthSwitcher } from "../../components/MonthSwitcher";
import {
  Card,
  EmptyState,
  ErrorMessage,
  Spinner,
  Stat,
} from "../../components/ui";
import { CategoryPie, type PieDatum } from "../../components/charts";
import { getCategoryColor } from "../../lib/categoryColors";

/** Monthly report: summary + category pie/list with drilldown to 明細. */
export function MonthlySection({ initial }: { initial?: YearMonth }) {
  const { go } = useNav();
  const [ym, setYm] = useState<YearMonth>(initial ?? currentYearMonth());

  const report = useAsync(() => api.getMonthlyReport(ym.year, ym.month), [
    ym.year,
    ym.month,
  ]);

  return (
    <div className="flex flex-col gap-4">
      <MonthSwitcher value={ym} onChange={setYm} />

      {report.loading ? (
        <Spinner />
      ) : report.error ? (
        <ErrorMessage message={report.error} onRetry={report.reload} />
      ) : report.data ? (
        <>
          <Card>
            <div className="grid grid-cols-3 gap-2">
              <Stat label="収入" value={formatYen(report.data.totalIncome)} tone="income" />
              <Stat label="支出" value={formatYen(report.data.totalExpense)} tone="expense" />
              <Stat
                label="収支"
                value={formatYenSigned(report.data.balance)}
                tone={report.data.balance >= 0 ? "positive" : "negative"}
              />
            </div>
          </Card>

          {report.data.categoryBreakdown.length === 0 ? (
            <EmptyState message="この月の支出データがありません" />
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              <Card>
                <h3 className="mb-2 text-sm font-semibold text-gray-700">
                  カテゴリ別支出
                </h3>
                <CategoryPie
                  data={report.data.categoryBreakdown.map<PieDatum>((c) => ({
                    name: c.category,
                    value: c.amount,
                  }))}
                  colorForName={getCategoryColor}
                  onSliceClick={(name) =>
                    go("transactions", {
                      category: name,
                      year: ym.year,
                      month: ym.month,
                    })
                  }
                />
              </Card>

              <Card>
                <h3 className="mb-2 text-sm font-semibold text-gray-700">内訳</h3>
                <ul className="flex flex-col divide-y divide-gray-100">
                  {report.data.categoryBreakdown.map((c) => (
                    <li key={c.category}>
                      <button
                        type="button"
                        onClick={() =>
                          go("transactions", {
                            category: c.category,
                            year: ym.year,
                            month: ym.month,
                          })
                        }
                        className="flex w-full items-center justify-between gap-2 py-2 text-left hover:bg-gray-50"
                      >
                        <span className="flex items-center gap-2 text-sm text-gray-700">
                          <span
                            className="h-3 w-3 shrink-0 rounded-sm"
                            style={{
                              backgroundColor: getCategoryColor(c.category),
                            }}
                          />
                          {c.category}
                        </span>
                        <span className="flex items-baseline gap-2 tabular-nums">
                          <span className="text-xs text-gray-400">
                            {percentOf(c.amount, report.data!.totalExpense)}%
                          </span>
                          <span className="text-sm font-medium text-gray-800">
                            {formatYen(c.amount)}
                          </span>
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              </Card>
            </div>
          )}
        </>
      ) : null}
    </div>
  );
}
