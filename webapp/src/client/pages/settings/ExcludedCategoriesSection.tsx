import { useState } from "react";
import { api, type ExclusionScope } from "../../lib/api";
import { useAsync } from "../../hooks/useAsync";
import { useToast } from "../../components/Toast";
import {
  Button,
  Card,
  EmptyState,
  ErrorMessage,
  Spinner,
} from "../../components/ui";

const SCOPE_LABEL: Record<ExclusionScope, string> = {
  balance: "収支計算から除外",
  annual: "年間レポートから除外",
};

/** 除外カテゴリ（scope: balance/annual）の一覧 + 追加 / 削除。 */
export function ExcludedCategoriesSection() {
  const toast = useToast();
  const items = useAsync(() => api.getExcludedCategories(), []);

  const [category, setCategory] = useState("");
  const [scope, setScope] = useState<ExclusionScope>("balance");
  const [busy, setBusy] = useState(false);

  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    if (category.trim() === "") {
      toast.error("カテゴリ名を入力してください");
      return;
    }
    setBusy(true);
    try {
      await api.addExcludedCategory({ category: category.trim(), scope });
      setCategory("");
      toast.success("追加しました");
      items.reload();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "追加に失敗しました");
    } finally {
      setBusy(false);
    }
  };

  const remove = async (id: number) => {
    try {
      await api.deleteExcludedCategory(id);
      toast.success("削除しました");
      items.reload();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "削除に失敗しました");
    }
  };

  return (
    <Card className="flex flex-col gap-3">
      <h2 className="text-sm font-semibold text-gray-700">除外カテゴリ</h2>
      <p className="-mt-1 text-xs text-gray-400">
        「振替」は設定に関わらず常に収支計算から除外されます。
      </p>

      <form onSubmit={add} className="grid grid-cols-2 gap-2 md:grid-cols-3">
        <input
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          placeholder="カテゴリ名"
          className="rounded-md border border-gray-300 px-2 py-2 text-sm"
        />
        <select
          value={scope}
          onChange={(e) => setScope(e.target.value as ExclusionScope)}
          className="rounded-md border border-gray-300 px-2 py-2 text-sm"
        >
          <option value="balance">{SCOPE_LABEL.balance}</option>
          <option value="annual">{SCOPE_LABEL.annual}</option>
        </select>
        <Button type="submit" disabled={busy}>
          {busy ? "追加中..." : "追加"}
        </Button>
      </form>

      {items.loading ? (
        <Spinner />
      ) : items.error ? (
        <ErrorMessage message={items.error} onRetry={items.reload} />
      ) : items.data && items.data.items.length === 0 ? (
        <EmptyState message="除外カテゴリはありません" />
      ) : (
        <ul className="flex flex-col divide-y divide-gray-100">
          {items.data?.items.map((it) => (
            <li key={it.id} className="flex items-center justify-between gap-2 py-2">
              <span className="text-sm text-gray-800">
                {it.category}
                <span className="ml-2 text-xs text-gray-400">
                  {SCOPE_LABEL[it.scope]}
                </span>
              </span>
              <button
                type="button"
                aria-label="削除"
                onClick={() => remove(it.id)}
                className="text-rose-500 hover:text-rose-700"
              >
                🗑
              </button>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
