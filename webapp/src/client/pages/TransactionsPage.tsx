import { useEffect, useMemo, useState } from "react";
import { api, type Transaction } from "../lib/api";
import { useAsync } from "../hooks/useAsync";
import { useLatestDataMonth } from "../hooks/useLatestDataMonth";
import { useNav } from "../nav";
import { useToast } from "../components/Toast";
import {
  formatShortDate,
  formatYen,
  type YearMonth,
} from "../lib/format";
import { MonthSwitcher } from "../components/MonthSwitcher";
import { Modal } from "../components/Modal";
import {
  Button,
  Card,
  EmptyState,
  ErrorMessage,
  Page,
  Spinner,
} from "../components/ui";

const PAGE_SIZE = 50;

/**
 * Wrapper: consume one-shot drilldown params, then wait for the latest data
 * month (unless a drilldown already specified a month) before mounting the
 * list, so the default view isn't an empty future month.
 */
export function TransactionsPage() {
  const { consumeParams } = useNav();
  // One-shot navigation params (drilldown from home/report).
  const initial = useMemo(() => consumeParams(), []); // eslint-disable-line react-hooks/exhaustive-deps
  const hasDrilldownMonth = initial.year != null && initial.month != null;

  const { ym: latestYm, loading } = useLatestDataMonth();

  // A drilldown month wins; otherwise seed from the latest data month.
  const initialYm: YearMonth =
    hasDrilldownMonth
      ? { year: initial.year!, month: initial.month! }
      : latestYm;

  // Only block on the latest-month lookup when we actually need it.
  if (!hasDrilldownMonth && loading) {
    return (
      <Page title="明細">
        <Spinner />
      </Page>
    );
  }

  return (
    <TransactionsContent
      initialYm={initialYm}
      initialCategory={initial.category ?? ""}
      initialInstitution={initial.institution ?? ""}
    />
  );
}

/** Transaction list with month switch, filters, paging, inline edit + delete. */
function TransactionsContent({
  initialYm,
  initialCategory,
  initialInstitution,
}: {
  initialYm: YearMonth;
  initialCategory: string;
  initialInstitution: string;
}) {
  const toast = useToast();

  const [ym, setYm] = useState<YearMonth>(initialYm);
  const [category, setCategory] = useState(initialCategory);
  const [institution, setInstitution] = useState(initialInstitution);
  const [keyword, setKeyword] = useState("");
  const [keywordInput, setKeywordInput] = useState("");
  const [page, setPage] = useState(0);

  // Reset to first page whenever filters change.
  useEffect(() => {
    setPage(0);
  }, [ym.year, ym.month, category, institution, keyword]);

  const query = useAsync(
    () =>
      api.getTransactions({
        year: ym.year,
        month: ym.month,
        category: category || undefined,
        institution: institution || undefined,
        keyword: keyword || undefined,
        limit: PAGE_SIZE,
        offset: page * PAGE_SIZE,
      }),
    [ym.year, ym.month, category, institution, keyword, page],
  );

  // Distinct categories/institutions for the filter dropdowns come from the
  // category rules + current page's rows (lightweight, no extra endpoint).
  const rulesQuery = useAsync(() => api.getCategoryRules(), []);
  const knownCategories = useMemo(() => {
    const set = new Set<string>();
    for (const r of rulesQuery.data?.items ?? []) set.add(r.category);
    for (const t of query.data?.items ?? []) if (t.category) set.add(t.category);
    return [...set].sort();
  }, [rulesQuery.data, query.data]);
  const knownInstitutions = useMemo(() => {
    const set = new Set<string>();
    for (const t of query.data?.items ?? []) if (t.institution) set.add(t.institution);
    return [...set].sort();
  }, [query.data]);

  const [editing, setEditing] = useState<Transaction | null>(null);

  const total = query.data?.total ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const clearFilters = () => {
    setCategory("");
    setInstitution("");
    setKeyword("");
    setKeywordInput("");
  };
  const hasFilters = category || institution || keyword;

  return (
    <Page title="明細">
      <MonthSwitcher value={ym} onChange={setYm} />

      {/* Filters */}
      <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          className="rounded-md border border-gray-300 bg-white px-2 py-2 text-sm"
          aria-label="カテゴリで絞り込み"
        >
          <option value="">全カテゴリ</option>
          {knownCategories.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <select
          value={institution}
          onChange={(e) => setInstitution(e.target.value)}
          className="rounded-md border border-gray-300 bg-white px-2 py-2 text-sm"
          aria-label="金融機関で絞り込み"
        >
          <option value="">全金融機関</option>
          {knownInstitutions.map((i) => (
            <option key={i} value={i}>
              {i}
            </option>
          ))}
        </select>
        <form
          className="col-span-2 flex gap-2 md:col-span-2"
          onSubmit={(e) => {
            e.preventDefault();
            setKeyword(keywordInput.trim());
          }}
        >
          <input
            value={keywordInput}
            onChange={(e) => setKeywordInput(e.target.value)}
            placeholder="キーワード検索"
            className="min-w-0 flex-1 rounded-md border border-gray-300 px-2 py-2 text-sm"
          />
          <Button type="submit" variant="secondary">
            検索
          </Button>
        </form>
      </div>

      {hasFilters && (
        <button
          type="button"
          onClick={clearFilters}
          className="self-start text-xs text-teal-700 underline"
        >
          フィルタをクリア
        </button>
      )}

      {/* List */}
      {query.loading && !query.data ? (
        <Spinner />
      ) : query.error ? (
        <ErrorMessage message={query.error} onRetry={query.reload} />
      ) : query.data && query.data.items.length === 0 ? (
        <EmptyState message="該当する取引がありません" />
      ) : (
        <>
          <p className="text-xs text-gray-500">
            全{total.toLocaleString("ja-JP")}件（{page * PAGE_SIZE + 1}–
            {Math.min((page + 1) * PAGE_SIZE, total)}件を表示）
          </p>
          <ul className="flex flex-col gap-2">
            {query.data?.items.map((tx) => (
              <li key={tx.id}>
                <Card
                  className="!p-3"
                  onClick={() => setEditing(tx)}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-gray-800">
                        {tx.description}
                      </p>
                      <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-gray-500">
                        <span>{formatShortDate(tx.date)}</span>
                        {tx.institution && <span>{tx.institution}</span>}
                        <span className="rounded bg-teal-50 px-1.5 py-0.5 text-teal-700">
                          {tx.category ?? "未分類"}
                        </span>
                        {tx.memo && <span className="text-gray-400">📝{tx.memo}</span>}
                      </p>
                    </div>
                    <span
                      className={`shrink-0 text-sm font-bold tabular-nums ${
                        tx.type === "収入" ? "text-emerald-600" : "text-rose-600"
                      }`}
                    >
                      {tx.type === "収入" ? "+" : "-"}
                      {formatYen(tx.amount)}
                    </span>
                  </div>
                </Card>
              </li>
            ))}
          </ul>

          {/* Paging */}
          {pageCount > 1 && (
            <div className="flex items-center justify-center gap-3 pt-2">
              <Button
                variant="secondary"
                disabled={page === 0}
                onClick={() => setPage((p) => Math.max(0, p - 1))}
              >
                前へ
              </Button>
              <span className="text-sm text-gray-600 tabular-nums">
                {page + 1} / {pageCount}
              </span>
              <Button
                variant="secondary"
                disabled={page >= pageCount - 1}
                onClick={() => setPage((p) => p + 1)}
              >
                次へ
              </Button>
            </div>
          )}
        </>
      )}

      {editing && (
        <EditTransactionModal
          tx={editing}
          categories={knownCategories}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            toast.success("保存しました");
            query.reload();
          }}
          onDeleted={() => {
            setEditing(null);
            toast.success("削除しました");
            query.reload();
          }}
          onError={(m) => toast.error(m)}
        />
      )}
    </Page>
  );
}

function EditTransactionModal({
  tx,
  categories,
  onClose,
  onSaved,
  onDeleted,
  onError,
}: {
  tx: Transaction;
  categories: string[];
  onClose: () => void;
  onSaved: () => void;
  onDeleted: () => void;
  onError: (message: string) => void;
}) {
  const [category, setCategory] = useState(tx.category ?? "");
  const [memo, setMemo] = useState(tx.memo ?? "");
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const save = async () => {
    setBusy(true);
    try {
      await api.updateTransaction(tx.id, {
        category: category.trim() === "" ? null : category.trim(),
        memo: memo.trim() === "" ? null : memo.trim(),
      });
      onSaved();
    } catch (e) {
      onError(e instanceof Error ? e.message : "保存に失敗しました");
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    setBusy(true);
    try {
      await api.deleteTransaction(tx.id);
      onDeleted();
    } catch (e) {
      onError(e instanceof Error ? e.message : "削除に失敗しました");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title="取引を編集" onClose={onClose}>
      <div className="mb-4 rounded-lg bg-gray-50 p-3 text-sm">
        <p className="font-medium text-gray-800">{tx.description}</p>
        <p className="mt-1 text-xs text-gray-500">
          {tx.date} ・ {tx.type} ・ {formatYen(tx.amount)}
          {tx.institution ? ` ・ ${tx.institution}` : ""}
        </p>
      </div>

      <label className="mb-1 block text-xs font-medium text-gray-600">
        カテゴリ
      </label>
      <input
        list="tx-categories"
        value={category}
        onChange={(e) => setCategory(e.target.value)}
        placeholder="未分類"
        className="mb-3 w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
      />
      <datalist id="tx-categories">
        {categories.map((c) => (
          <option key={c} value={c} />
        ))}
      </datalist>

      <label className="mb-1 block text-xs font-medium text-gray-600">メモ</label>
      <input
        value={memo}
        onChange={(e) => setMemo(e.target.value)}
        className="mb-4 w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
      />

      <div className="flex items-center justify-between">
        <Button variant="danger" onClick={() => setConfirmDelete(true)} disabled={busy}>
          削除
        </Button>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            キャンセル
          </Button>
          <Button onClick={save} disabled={busy}>
            {busy ? "保存中..." : "保存"}
          </Button>
        </div>
      </div>

      {confirmDelete && (
        <div className="mt-4 rounded-lg border border-rose-200 bg-rose-50 p-3">
          <p className="mb-2 text-sm text-rose-700">この取引を削除しますか？</p>
          <div className="flex justify-end gap-2">
            <Button
              variant="secondary"
              onClick={() => setConfirmDelete(false)}
              disabled={busy}
            >
              やめる
            </Button>
            <Button variant="danger" onClick={remove} disabled={busy}>
              削除する
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}
