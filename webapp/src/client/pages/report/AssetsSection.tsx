import { useMemo, useState } from "react";
import { api } from "../../lib/api";
import { useAsync } from "../../hooks/useAsync";
import { useToast } from "../../components/Toast";
import { formatShortDate, formatYen } from "../../lib/format";
import {
  Button,
  Card,
  EmptyState,
  ErrorMessage,
  Spinner,
  Stat,
} from "../../components/ui";
import {
  CategoryPie,
  TrendLine,
  type LineDatum,
  type PieDatum,
} from "../../components/charts";

/** Assets: total-asset trend line + portfolio pie + securities CRUD. */
export function AssetsSection() {
  const toast = useToast();
  const assets = useAsync(() => api.getAssets(), []);
  const securities = useAsync(() => api.getSecurities(), []);

  const trend = useMemo<LineDatum[]>(() => {
    const series = assets.data?.series ?? [];
    // Downsample long series so the x-axis stays legible on mobile.
    const step = Math.max(1, Math.ceil(series.length / 120));
    return series
      .filter((_, i) => i % step === 0 || i === series.length - 1)
      .map((p) => ({ label: p.date.slice(0, 7), value: p.total }));
  }, [assets.data]);

  const portfolioPie = useMemo<PieDatum[]>(() => {
    const slices = assets.data?.portfolio.slices ?? [];
    return slices.filter((s) => s.value > 0).map((s) => ({ name: s.label, value: s.value }));
  }, [assets.data]);

  const reloadAll = () => {
    assets.reload();
    securities.reload();
  };

  return (
    <div className="flex flex-col gap-4">
      {/* Portfolio summary */}
      {assets.loading ? (
        <Spinner />
      ) : assets.error ? (
        <ErrorMessage message={assets.error} onRetry={assets.reload} />
      ) : assets.data ? (
        <Card>
          <div className="grid grid-cols-3 gap-2">
            <Stat label="総資産" value={formatYen(assets.data.portfolio.total)} />
            <Stat label="預金・現金" value={formatYen(assets.data.portfolio.bankTotal)} />
            <Stat label="証券" value={formatYen(assets.data.portfolio.securitiesTotal)} />
          </div>
        </Card>
      ) : null}

      {/* Trend line */}
      <Card>
        <h3 className="mb-2 text-sm font-semibold text-gray-700">総資産推移</h3>
        {assets.loading ? (
          <Spinner />
        ) : trend.length === 0 ? (
          <EmptyState message="資産データがありません" />
        ) : (
          <TrendLine data={trend} />
        )}
      </Card>

      {/* Portfolio pie */}
      <Card>
        <h3 className="mb-2 text-sm font-semibold text-gray-700">ポートフォリオ</h3>
        {portfolioPie.length === 0 ? (
          <EmptyState message="データがありません" />
        ) : (
          <CategoryPie data={portfolioPie} height={220} />
        )}
      </Card>

      {/* Securities list + form */}
      <Card>
        <h3 className="mb-3 text-sm font-semibold text-gray-700">証券残高</h3>
        <SecurityForm
          onAdded={() => {
            toast.success("証券残高を追加しました");
            reloadAll();
          }}
          onError={(m) => toast.error(m)}
        />

        <div className="mt-4">
          {securities.loading ? (
            <Spinner />
          ) : securities.error ? (
            <ErrorMessage message={securities.error} onRetry={securities.reload} />
          ) : securities.data && securities.data.items.length === 0 ? (
            <EmptyState message="証券残高が登録されていません" />
          ) : (
            <ul className="flex flex-col divide-y divide-gray-100">
              {[...(securities.data?.items ?? [])]
                .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))
                .map((s) => (
                  <li
                    key={s.id}
                    className="flex items-center justify-between gap-2 py-2"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-gray-800">
                        {s.brokerage}
                      </p>
                      <p className="text-xs text-gray-500">
                        {formatShortDate(s.date)}（{s.date.slice(0, 4)}）
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-sm font-medium tabular-nums text-gray-800">
                        {formatYen(s.value)}
                      </span>
                      <button
                        type="button"
                        aria-label="削除"
                        onClick={async () => {
                          try {
                            await api.deleteSecurity(s.id);
                            toast.success("削除しました");
                            reloadAll();
                          } catch (e) {
                            toast.error(
                              e instanceof Error ? e.message : "削除に失敗しました",
                            );
                          }
                        }}
                        className="text-rose-500 hover:text-rose-700"
                      >
                        🗑
                      </button>
                    </div>
                  </li>
                ))}
            </ul>
          )}
        </div>
      </Card>
    </div>
  );
}

function SecurityForm({
  onAdded,
  onError,
}: {
  onAdded: () => void;
  onError: (message: string) => void;
}) {
  const today = new Date().toISOString().slice(0, 10);
  const [date, setDate] = useState(today);
  const [brokerage, setBrokerage] = useState("");
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const num = Number(value);
    if (brokerage.trim() === "") {
      onError("証券会社名を入力してください");
      return;
    }
    if (!Number.isFinite(num)) {
      onError("金額は数値で入力してください");
      return;
    }
    setBusy(true);
    try {
      await api.addSecurity({ date, brokerage: brokerage.trim(), value: num });
      setBrokerage("");
      setValue("");
      onAdded();
    } catch (err) {
      onError(err instanceof Error ? err.message : "追加に失敗しました");
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="grid grid-cols-2 gap-2 md:grid-cols-4">
      <input
        type="date"
        value={date}
        onChange={(e) => setDate(e.target.value)}
        className="rounded-md border border-gray-300 px-2 py-2 text-sm"
      />
      <input
        value={brokerage}
        onChange={(e) => setBrokerage(e.target.value)}
        placeholder="証券会社"
        className="rounded-md border border-gray-300 px-2 py-2 text-sm"
      />
      <input
        type="number"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="残高(円)"
        inputMode="numeric"
        className="rounded-md border border-gray-300 px-2 py-2 text-sm"
      />
      <Button type="submit" disabled={busy}>
        {busy ? "追加中..." : "追加"}
      </Button>
    </form>
  );
}
