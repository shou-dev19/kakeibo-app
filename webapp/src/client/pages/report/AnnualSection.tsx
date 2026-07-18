import { useMemo, useState } from "react";
import { api } from "../../lib/api";
import { useAsync } from "../../hooks/useAsync";
import {
  currentYearMonth,
  formatNumber,
  formatYen,
  formatYearMonth,
  nextMonth,
  prevMonth,
  type YearMonth,
} from "../../lib/format";
import { Card, EmptyState, ErrorMessage, Spinner } from "../../components/ui";
import { CategoryPie, type PieDatum } from "../../components/charts";

/**
 * Annual report: trailing-12-month summary table + per-category monthly table
 * (horizontal scroll) + average-monthly-expense pie.
 */
export function AnnualSection({ initial }: { initial?: YearMonth }) {
  const [ref, setRef] = useState<YearMonth>(initial ?? currentYearMonth());

  const report = useAsync(() => api.getAnnualReport(ref.year, ref.month), [
    ref.year,
    ref.month,
  ]);

  const avgPie = useMemo<PieDatum[]>(() => {
    if (!report.data) return [];
    return report.data.categoryTable
      .map((r) => ({ name: r.category, value: Math.round(r.average) }))
      .filter((d) => d.value > 0)
      .sort((a, b) => b.value - a.value);
  }, [report.data]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-center gap-2">
        <button
          type="button"
          onClick={() => setRef(prevMonth(ref))}
          className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50"
        >
          ← 前月
        </button>
        <span className="min-w-40 text-center text-sm font-semibold text-gray-800">
          {formatYearMonth(ref)}まで（直近12ヶ月）
        </span>
        <button
          type="button"
          onClick={() => setRef(nextMonth(ref))}
          className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50"
        >
          翌月 →
        </button>
      </div>

      {report.loading ? (
        <Spinner />
      ) : report.error ? (
        <ErrorMessage message={report.error} onRetry={report.reload} />
      ) : report.data ? (
        <>
          {/* Monthly summary table */}
          <Card className="!p-0 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[560px] text-right text-xs tabular-nums">
                <thead className="bg-gray-50 text-gray-500">
                  <tr>
                    <th className="sticky left-0 z-10 bg-gray-50 px-3 py-2 text-left">
                      月
                    </th>
                    <th className="px-3 py-2">収入</th>
                    <th className="px-3 py-2">支出</th>
                    <th className="px-3 py-2">余剰資金</th>
                    <th className="px-3 py-2">投資額</th>
                    <th className="px-3 py-2">投資後残高</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {report.data.monthlySummaries.map((r) => (
                    <tr key={r.month}>
                      <td className="sticky left-0 z-10 bg-white px-3 py-1.5 text-left font-medium text-gray-700">
                        {r.month}
                      </td>
                      <td className="px-3 py-1.5 text-emerald-600">
                        {formatNumber(r.income)}
                      </td>
                      <td className="px-3 py-1.5 text-rose-600">
                        {formatNumber(r.expense)}
                      </td>
                      <td className="px-3 py-1.5">{formatNumber(r.surplus)}</td>
                      <td className="px-3 py-1.5">{formatNumber(r.investment)}</td>
                      <td className="px-3 py-1.5">
                        {formatNumber(r.afterInvestment)}
                      </td>
                    </tr>
                  ))}
                  <tr className="bg-teal-50 font-semibold text-gray-800">
                    <td className="sticky left-0 z-10 bg-teal-50 px-3 py-2 text-left">
                      {report.data.totals.month}
                    </td>
                    <td className="px-3 py-2">
                      {formatNumber(report.data.totals.income)}
                    </td>
                    <td className="px-3 py-2">
                      {formatNumber(report.data.totals.expense)}
                    </td>
                    <td className="px-3 py-2">
                      {formatNumber(report.data.totals.surplus)}
                    </td>
                    <td className="px-3 py-2">
                      {formatNumber(report.data.totals.investment)}
                    </td>
                    <td className="px-3 py-2">
                      {formatNumber(report.data.totals.afterInvestment)}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </Card>

          {/* Category monthly table */}
          <Card className="!p-0 overflow-hidden">
            <h3 className="px-3 pt-3 text-sm font-semibold text-gray-700">
              カテゴリ別月次支出
            </h3>
            {report.data.categoryTable.length === 0 ? (
              <div className="p-3">
                <EmptyState message="支出データがありません" />
              </div>
            ) : (
              <div className="overflow-x-auto p-3">
                <table className="w-full min-w-[720px] text-right text-xs tabular-nums">
                  <thead className="bg-gray-50 text-gray-500">
                    <tr>
                      <th className="sticky left-0 z-10 bg-gray-50 px-3 py-2 text-left">
                        カテゴリ
                      </th>
                      {report.data.months.map((m) => (
                        <th key={m} className="px-2 py-2 whitespace-nowrap">
                          {m}
                        </th>
                      ))}
                      <th className="px-3 py-2">合計</th>
                      <th className="px-3 py-2">平均</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {report.data.categoryTable.map((row) => (
                      <tr key={row.category}>
                        <td className="sticky left-0 z-10 bg-white px-3 py-1.5 text-left font-medium text-gray-700 whitespace-nowrap">
                          {row.category}
                        </td>
                        {row.monthly.map((v, i) => (
                          <td key={i} className="px-2 py-1.5 text-gray-600">
                            {v === 0 ? "-" : formatNumber(v)}
                          </td>
                        ))}
                        <td className="px-3 py-1.5 font-medium text-gray-800">
                          {formatNumber(row.total)}
                        </td>
                        <td className="px-3 py-1.5 text-gray-500">
                          {formatNumber(row.average)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>

          {/* Average monthly expense pie */}
          <Card>
            <h3 className="mb-2 text-sm font-semibold text-gray-700">
              月平均支出（カテゴリ別）
            </h3>
            {avgPie.length === 0 ? (
              <EmptyState message="支出データがありません" />
            ) : (
              <CategoryPie data={avgPie} />
            )}
          </Card>

          <p className="text-center text-xs text-gray-400">
            合計支出 {formatYen(report.data.totals.expense)} / 12ヶ月
          </p>
        </>
      ) : null}
    </div>
  );
}
