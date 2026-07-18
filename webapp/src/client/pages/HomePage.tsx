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
 * total assets, and split-payment bill. Cards deep-link to the relevant
 * screens. `ym` is the latest month with data (fixed at mount).
 */
function HomeContent({ ym }: { ym: YearMonth }) {
  const { go } = useNav();

  const monthly = useAsync(() => api.getMonthlyReport(ym.year, ym.month), [
    ym.year,
    ym.month,
  ]);
  const assets = useAsync(() => api.getAssets(), []);
  const split = useAsync(() => api.getSplitwise(ym.year, ym.month), [
    ym.year,
    ym.month,
  ]);

  return (
    <Page title={`ホーム（${formatYearMonth(ym)}）`}>
      <p className="-mt-2 text-sm text-gray-500">{formatYearMonth(ym)}の状況</p>

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
          {/* Total assets */}
          <Card onClick={() => go("report", { reportSection: "assets" })}>
            <div className="flex items-center justify-between">
              <Stat
                label="総資産"
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
              <div className="mt-2 flex gap-4 text-xs text-gray-500">
                <span>預金 {formatYen(assets.data.portfolio.bankTotal)}</span>
                <span>証券 {formatYen(assets.data.portfolio.securitiesTotal)}</span>
              </div>
            )}
            {assets.error && (
              <p className="mt-1 text-xs text-rose-600">{assets.error}</p>
            )}
          </Card>

          {/* Splitwise bill */}
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
              <Stat
                label={`${formatYearMonth(ym)}の割り勘請求額`}
                value={
                  split.loading
                    ? "…"
                    : split.data
                      ? formatYen(split.data.totalBilled)
                      : "-"
                }
              />
              <span className="text-gray-300">›</span>
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
