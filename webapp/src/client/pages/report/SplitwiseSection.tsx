import { useState } from "react";
import { api } from "../../lib/api";
import { useAsync } from "../../hooks/useAsync";
import {
  formatShortDate,
  formatYen,
  type YearMonth,
} from "../../lib/format";
import { defaultReportMonth } from "../../lib/reportPeriod";
import { MonthSwitcher } from "../../components/MonthSwitcher";
import { OwnerBadge } from "../../components/OwnerTabs";
import { OWNER_LABELS } from "../../../shared/types";
import {
  Card,
  EmptyState,
  ErrorMessage,
  Spinner,
  Stat,
} from "../../components/ui";

/**
 * 割り勘: 夫負担額 / 妻負担額 と、その差から出る精算額。
 *
 * 世帯単位の数字なので、利用者スコープの切替は持たない (常に夫婦合算)。
 * ルールに一致しなかった支出は各自の個人支出として集計に含めない。
 */
export function SplitwiseSection({ initial }: { initial?: YearMonth }) {
  const [ym, setYm] = useState<YearMonth>(initial ?? defaultReportMonth());
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
            <div className="grid grid-cols-2 gap-2">
              <Stat
                label={`${OWNER_LABELS.husband}負担額`}
                value={formatShare(result.data.husbandShare)}
              />
              <Stat
                label={`${OWNER_LABELS.wife}負担額`}
                value={formatShare(result.data.wifeShare)}
              />
            </div>
            <div className="mt-3 flex flex-col gap-1 border-t border-gray-100 pt-2 text-xs text-gray-500">
              <div className="flex items-center justify-between gap-2">
                <span>共同支出総額</span>
                <span className="tabular-nums">
                  {formatShare(result.data.totalAmount)}
                </span>
              </div>
              <div className="flex items-center justify-between gap-2">
                <span>立替額</span>
                <span className="tabular-nums">
                  {OWNER_LABELS.husband} {formatShare(result.data.husbandPaid)} ／{" "}
                  {OWNER_LABELS.wife} {formatShare(result.data.wifePaid)}
                </span>
              </div>
              <div className="flex items-center justify-between gap-2 font-medium text-teal-700">
                <span>精算</span>
                <span className="tabular-nums">
                  {formatSettlement(result.data.settlement)}
                </span>
              </div>
            </div>
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
                    <li key={s.rate} className="flex flex-col gap-1 py-2 text-sm">
                      <span className="flex items-center gap-2">
                        <span className="rounded bg-teal-50 px-2 py-0.5 text-teal-700">
                          {OWNER_LABELS.wife} {s.rate}%
                        </span>
                        <span className="text-gray-500">{s.count}件</span>
                        <span className="text-xs text-gray-400">
                          対象額 {formatYen(s.amount)}
                        </span>
                      </span>
                      <span className="flex items-center justify-between gap-2 text-xs tabular-nums text-gray-600">
                        <span>
                          {OWNER_LABELS.husband} {formatShare(s.husbandShare)}
                        </span>
                        <span>
                          {OWNER_LABELS.wife} {formatShare(s.wifeShare)}
                        </span>
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
                        <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-gray-500">
                          <span>{formatShortDate(it.date)}</span>
                          <OwnerBadge owner={it.owner} />
                          {it.institution && <span>{it.institution}</span>}
                          <span className="rounded bg-gray-100 px-1.5 text-gray-600">
                            {OWNER_LABELS.wife} {it.rate}%
                          </span>
                        </p>
                      </div>
                      <div className="shrink-0 text-right tabular-nums">
                        <p className="text-sm text-gray-800">{formatYen(it.amount)}</p>
                        <p className="text-xs text-teal-700">
                          {OWNER_LABELS.wife} {formatYen(it.wifeShare)}
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
 * Shares can carry fractions of a yen (GAS parity: amount*rate/100 is not
 * pre-rounded). Show up to 2 decimals only when a fraction exists, matching the
 * GAS display of e.g. "…円 (端数)".
 */
function formatShare(value: number): string {
  const rounded = Math.round(value);
  if (Math.abs(value - rounded) < 1e-9) return formatYen(value);
  return `${value.toLocaleString("ja-JP", { maximumFractionDigits: 2 })}円`;
}

/** 精算額は向きが読み取れないと意味がないので、誰から誰へかを添える。 */
function formatSettlement(value: number): string {
  if (Math.abs(value) < 0.5) return "精算不要";
  const [from, to] =
    value > 0
      ? [OWNER_LABELS.wife, OWNER_LABELS.husband]
      : [OWNER_LABELS.husband, OWNER_LABELS.wife];
  return `${from} → ${to} ${formatShare(Math.abs(value))}`;
}
