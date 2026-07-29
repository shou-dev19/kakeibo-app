import { api } from "../lib/api";
import { useAsync } from "../hooks/useAsync";
import { useLatestDataMonth } from "../hooks/useLatestDataMonth";
import { useNav } from "../nav";
import {
  formatYen,
  formatYenSigned,
  formatYearMonth,
  type YearMonth,
} from "../lib/format";
import { Card, EmptyState, ErrorMessage, Page, Spinner, Stat } from "../components/ui";
import { CategoryPie, type PieDatum } from "../components/charts";
import { getCategoryColor } from "../lib/categoryColors";
import { useMe } from "../hooks/useMe";
import { OWNER_LABELS } from "../../shared/types";

/**
 * Dashboard wrapper: resolves the latest data month before mounting the actual
 * dashboard so we don't render an empty (future) month on first load.
 */
export function HomePage() {
  const { ym, loading } = useLatestDataMonth();
  if (loading) {
    return (
      <Page title="ホーム">
        <Spinner />
      </Page>
    );
  }
  return <HomeContent ym={ym} />;
}

/**
 * Dashboard: the target month's income/expense/balance, category expense pie,
 * total assets, and the split-payment shares. Cards deep-link to the relevant
 * screens. `ym` is the latest month with data (fixed at mount).
 *
 * Everything here is the household total (夫婦合算) — no owner switch. The home
 * screen answers "how are we doing?"; per-person figures live on 明細 and
 * レポート, which both carry the owner tabs.
 */
function HomeContent({ ym }: { ym: YearMonth }) {
  const { go } = useNav();
  const me = useMe();

  const monthly = useAsync(
    () => api.getMonthlyReport(ym.year, ym.month, "all"),
    [ym.year, ym.month],
  );
  const assets = useAsync(() => api.getAssets("all"), []);
  const split = useAsync(() => api.getSplitwise(ym.year, ym.month), [
    ym.year,
    ym.month,
  ]);

  return (
    <Page title={`ホーム（${formatYearMonth(ym)}）`}>
      <p className="-mt-2 flex flex-wrap items-center gap-x-2 text-sm text-gray-500">
        <span>{formatYearMonth(ym)}の状況（夫婦合算）</span>
        {me && (
          <span className="text-xs text-gray-400">
            {me.label}としてログイン中
          </span>
        )}
      </p>

      {/* Income / expense / balance summary */}
      {monthly.loading ? (
        <Spinner />
      ) : monthly.error ? (
        <ErrorMessage message={monthly.error} onRetry={monthly.reload} />
      ) : monthly.data ? (
        <Card
          onClick={() =>
            go("report", {
              reportSection: "monthly",
              year: ym.year,
              month: ym.month,
            })
          }
        >
          <div className="grid grid-cols-3 gap-2">
            <Stat label="収入" value={formatYen(monthly.data.totalIncome)} tone="income" />
            <Stat label="支出" value={formatYen(monthly.data.totalExpense)} tone="expense" />
            <Stat
              label="収支"
              value={formatYenSigned(monthly.data.balance)}
              tone={monthly.data.balance >= 0 ? "positive" : "negative"}
            />
          </div>
        </Card>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2">
        {/* Category pie */}
        <Card className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-gray-700">カテゴリ別支出</h2>
          </div>
          {monthly.loading ? (
            <Spinner />
          ) : monthly.data && monthly.data.categoryBreakdown.length > 0 ? (
            <CategoryPie
              data={monthly.data.categoryBreakdown.map<PieDatum>((c) => ({
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
          ) : (
            <EmptyState message={`${formatYearMonth(ym)}の支出データがありません`} />
          )}
        </Card>

        <div className="flex flex-col gap-4">
          {/* Total assets (夫婦合算) */}
          <Card onClick={() => go("report", { reportSection: "assets" })}>
            <div className="flex items-center justify-between">
              <Stat
                label="総資産（夫婦合算）"
                value={
                  assets.loading
                    ? "…"
                    : assets.data
                      ? formatYen(assets.data.portfolio.total)
                      : "-"
                }
              />
              <span className="text-gray-300">›</span>
            </div>
            {assets.data && (
              <div className="mt-2 flex flex-col gap-1 text-xs text-gray-500">
                <div className="flex gap-4">
                  <span>預金 {formatYen(assets.data.portfolio.bankTotal)}</span>
                  <span>証券 {formatYen(assets.data.portfolio.securitiesTotal)}</span>
                </div>
                {assets.data.portfolio.byOwner.length > 1 && (
                  <div className="flex gap-4">
                    {assets.data.portfolio.byOwner.map((row) => (
                      <span key={row.owner}>
                        {OWNER_LABELS[row.owner]} {formatYen(row.total)}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            )}
            {assets.error && (
              <p className="mt-1 text-xs text-rose-600">{assets.error}</p>
            )}
          </Card>

          {/* Split-payment shares */}
          <Card
            onClick={() =>
              go("report", {
                reportSection: "splitwise",
                year: ym.year,
                month: ym.month,
              })
            }
          >
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-gray-700">
                {formatYearMonth(ym)}の割り勘
              </h2>
              <span className="text-gray-300">›</span>
            </div>
            <div className="mt-2 grid grid-cols-2 gap-2">
              <Stat
                label={`${OWNER_LABELS.husband}負担額`}
                value={
                  split.loading
                    ? "…"
                    : split.data
                      ? formatYen(split.data.husbandShare)
                      : "-"
                }
              />
              <Stat
                label={`${OWNER_LABELS.wife}負担額`}
                value={
                  split.loading
                    ? "…"
                    : split.data
                      ? formatYen(split.data.wifeShare)
                      : "-"
                }
              />
            </div>
            {split.error && (
              <p className="mt-1 text-xs text-rose-600">{split.error}</p>
            )}
          </Card>
        </div>
      </div>
    </Page>
  );
}
