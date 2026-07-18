import { useState } from "react";
import { api } from "../../lib/api";
import { useAsync } from "../../hooks/useAsync";
import {
  currentYearMonth,
  formatShortDate,
  formatYen,
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

/**
 * Split-payment view: total billed (matching GAS fractional display), per-rate
 * subtotals, and matched line items with their applied rate.
 */
export function SplitwiseSection({ initial }: { initial?: YearMonth }) {
  const [ym, setYm] = useState<YearMonth>(initial ?? currentYearMonth());
  const result = useAsync(() => api.getSplitwise(ym.year, ym.month), [
    ym.year,
    ym.month,
  ]);

  return (
    <div className="flex flex-col gap-4">
      <MonthSwitcher value={ym} onChange={setYm} />

      {result.loading ? (
        <Spinner />
      ) : result.error ? (
        <ErrorMessage message={result.error} onRetry={result.reload} />
      ) : result.data ? (
        <>
          <Card>
            <Stat
              label="請求額（相手負担分の合計）"
              value={formatBilled(result.data.totalBilled)}
            />
          </Card>

          {result.data.subtotals.length === 0 ? (
            <EmptyState message="この月に割り勘対象の取引はありません" />
          ) : (
            <>
              <Card>
                <h3 className="mb-2 text-sm font-semibold text-gray-700">
                  負担率別の小計
                </h3>
                <ul className="flex flex-col divide-y divide-gray-100">
                  {result.data.subtotals.map((s) => (
                    <li
                      key={s.rate}
                      className="flex items-center justify-between gap-2 py-2 text-sm"
                    >
                      <span className="flex items-center gap-2">
                        <span className="rounded bg-teal-50 px-2 py-0.5 text-teal-700">
                          {s.rate}%
                        </span>
                        <span className="text-gray-500">{s.count}件</span>
                        <span className="text-xs text-gray-400">
                          対象額 {formatYen(s.amount)}
                        </span>
                      </span>
                      <span className="font-medium tabular-nums text-gray-800">
                        {formatBilled(s.billed)}
                      </span>
                    </li>
                  ))}
                </ul>
              </Card>

              <Card>
                <h3 className="mb-2 text-sm font-semibold text-gray-700">
                  対象明細（{result.data.items.length}件）
                </h3>
                <ul className="flex flex-col divide-y divide-gray-100">
                  {result.data.items.map((it, i) => (
                    <li
                      key={it.id ?? i}
                      className="flex items-start justify-between gap-2 py-2"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm text-gray-800">
                          {it.description}
                        </p>
                        <p className="mt-0.5 flex flex-wrap gap-x-2 text-xs text-gray-500">
                          <span>{formatShortDate(it.date)}</span>
                          {it.institution && <span>{it.institution}</span>}
                          <span className="rounded bg-gray-100 px-1.5 text-gray-600">
                            {it.rate}%
                          </span>
                        </p>
                      </div>
                      <div className="shrink-0 text-right tabular-nums">
                        <p className="text-sm text-gray-800">{formatYen(it.amount)}</p>
                        <p className="text-xs text-teal-700">
                          → {formatYen(it.billed)}
                        </p>
                      </div>
                    </li>
                  ))}
                </ul>
              </Card>
            </>
          )}
        </>
      ) : null}
    </div>
  );
}

/**
 * Billed totals can carry fractions of a yen (GAS parity: amount*rate/100 is not
 * pre-rounded). Show up to 2 decimals only when a fraction exists, matching the
 * GAS display of e.g. "…円 (端数)".
 */
function formatBilled(value: number): string {
  const rounded = Math.round(value);
  if (Math.abs(value - rounded) < 1e-9) return formatYen(value);
  return `${value.toLocaleString("ja-JP", { maximumFractionDigits: 2 })}円`;
}
