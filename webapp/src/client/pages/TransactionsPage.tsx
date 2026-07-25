import { useEffect, useMemo, useState } from "react";
import {
  api,
  type CategoryRulePreview,
  type TransactionListItem,
} from "../lib/api";
import { useAsync } from "../hooks/useAsync";
import { useLatestDataMonth } from "../hooks/useLatestDataMonth";
import { useNav } from "../nav";
import { useToast } from "../components/Toast";
import {
  formatShortDate,
  formatYen,
  type YearMonth,
} from "../lib/format";
import { getCategoryColor } from "../lib/categoryColors";
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

  const categoriesQuery = useAsync(() => api.getCategories(), []);
  const knownCategories = useMemo(() => {
    const set = new Set<string>();
    for (const categoryName of categoriesQuery.data?.items ?? []) {
      set.add(categoryName);
    }
    for (const t of query.data?.items ?? []) if (t.category) set.add(t.category);
    set.add("未分類");
    return [...set].sort();
  }, [categoriesQuery.data, query.data]);
  const knownInstitutions = useMemo(() => {
    const set = new Set<string>();
    for (const t of query.data?.items ?? []) if (t.institution) set.add(t.institution);
    return [...set].sort();
  }, [query.data]);

  const [editing, setEditing] = useState<TransactionListItem | null>(null);

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
            {query.data?.items.map((tx) => {
              const categoryName = tx.category?.trim() || "未分類";
              const categoryColor = getCategoryColor(categoryName);

              return (
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
                        <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-gray-500">
                          <span>{formatShortDate(tx.date)}</span>
                          {tx.institution && <span>{tx.institution}</span>}
                          <span
                            className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-gray-700"
                            style={{ backgroundColor: `${categoryColor}1A` }}
                          >
                            <span
                              aria-hidden="true"
                              className="size-1.5 rounded-full"
                              style={{ backgroundColor: categoryColor }}
                            />
                            {categoryName}
                          </span>
                          {tx.splitRate !== null && (
                            <span className="rounded bg-indigo-50 px-1.5 py-0.5 text-indigo-700">
                              相手負担 {tx.splitRate}%
                            </span>
                          )}
                          {tx.categoryLocked && (
                            <span className="rounded bg-amber-50 px-1.5 py-0.5 text-amber-700">
                              手動固定
                            </span>
                          )}
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
              );
            })}
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
          categoriesLoading={categoriesQuery.loading}
          categoriesError={categoriesQuery.error}
          onRetryCategories={categoriesQuery.reload}
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

export function EditTransactionModal({
  tx,
  categories,
  categoriesLoading = false,
  categoriesError = null,
  onRetryCategories = () => undefined,
  onClose,
  onSaved,
  onDeleted,
  onError,
}: {
  tx: TransactionListItem;
  categories: string[];
  categoriesLoading?: boolean;
  categoriesError?: string | null;
  onRetryCategories?: () => void;
  onClose: () => void;
  onSaved: () => void;
  onDeleted: () => void;
  onError: (message: string) => void;
}) {
  const originalCategory = tx.category?.trim() || "未分類";
  const [category, setCategory] = useState(originalCategory);
  const [memo, setMemo] = useState(tx.memo ?? "");
  const [addRule, setAddRule] = useState(true);
  const [ruleKeyword, setRuleKeyword] = useState(tx.description);
  const [limitInstitution, setLimitInstitution] = useState(
    tx.institution != null && tx.institution !== "",
  );
  const [preview, setPreview] = useState<CategoryRulePreview | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [previewRetry, setPreviewRetry] = useState(0);
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const categoryChanged = category !== originalCategory;
  const previewInstitution =
    limitInstitution && tx.institution ? tx.institution : null;
  const ruleInputValid =
    ruleKeyword.trim() !== "" &&
    tx.description.includes(ruleKeyword.trim());
  const needsPreview = categoryChanged && addRule && ruleInputValid;

  useEffect(() => {
    if (!needsPreview || categoriesLoading || categoriesError) {
      setPreview(null);
      setPreviewLoading(false);
      setPreviewError(null);
      return;
    }

    let active = true;
    setPreview(null);
    setPreviewLoading(true);
    setPreviewError(null);
    const timer = window.setTimeout(() => {
      void api
        .previewTransactionCategoryRule(tx.id, {
          category,
          keyword: ruleKeyword.trim(),
          institution: previewInstitution,
        })
        .then((result) => {
          if (active) setPreview(result);
        })
        .catch((error) => {
          if (active) {
            setPreviewError(
              error instanceof Error ? error.message : "影響確認に失敗しました",
            );
          }
        })
        .finally(() => {
          if (active) setPreviewLoading(false);
        });
    }, 350);

    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [
    addRule,
    categoriesError,
    categoriesLoading,
    category,
    needsPreview,
    previewInstitution,
    previewRetry,
    ruleKeyword,
    tx.id,
  ]);

  const save = async () => {
    setBusy(true);
    try {
      await api.updateTransaction(tx.id, {
        memo: memo.trim() === "" ? null : memo.trim(),
        ...(categoryChanged
          ? {
              categoryChange: addRule
                ? {
                    mode: "rule" as const,
                    category,
                    keyword: ruleKeyword.trim(),
                    institution: previewInstitution,
                  }
                : {
                    mode: "fixed" as const,
                    category,
                  },
            }
          : {}),
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

  const unlock = async () => {
    setBusy(true);
    try {
      await api.updateTransaction(tx.id, {
        memo: memo.trim() === "" ? null : memo.trim(),
        categoryChange: { mode: "unlock" },
      });
      onSaved();
    } catch (e) {
      onError(e instanceof Error ? e.message : "固定解除に失敗しました");
    } finally {
      setBusy(false);
    }
  };

  const saveDisabled =
    busy ||
    (categoryChanged &&
      (categoriesLoading ||
        categoriesError !== null ||
        (addRule && (!ruleInputValid || previewLoading || preview == null))));

  return (
    <Modal title="取引を編集" onClose={onClose}>
      <div className="mb-4 rounded-lg bg-gray-50 p-3 text-sm">
        <p className="font-medium text-gray-800">{tx.description}</p>
        <p className="mt-1 text-xs text-gray-500">
          {tx.date} ・ {tx.type} ・ {formatYen(tx.amount)}
          {tx.institution ? ` ・ ${tx.institution}` : ""}
        </p>
        {tx.categoryLocked && (
          <span className="mt-2 inline-block rounded bg-amber-100 px-2 py-0.5 text-xs text-amber-800">
            手動固定
          </span>
        )}
      </div>

      <label className="mb-1 block text-xs font-medium text-gray-600">
        カテゴリ
      </label>
      <select
        aria-label="カテゴリ"
        value={category}
        onChange={(e) => setCategory(e.target.value)}
        disabled={categoriesLoading || categoriesError !== null}
        className="mb-3 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm"
      >
        {categories.map((c) => (
          <option key={c} value={c}>
            {c}
          </option>
        ))}
      </select>

      {categoriesLoading && (
        <p className="mb-3 text-xs text-gray-500">カテゴリを読み込み中...</p>
      )}
      {categoriesError && (
        <div className="mb-3">
          <ErrorMessage
            message={categoriesError}
            onRetry={onRetryCategories}
          />
        </div>
      )}

      {categoryChanged && (
        <div className="mb-4 rounded-lg border border-teal-100 bg-teal-50/50 p-3">
          <label className="flex items-start gap-2 text-sm text-gray-700">
            <input
              type="checkbox"
              checked={addRule}
              onChange={(e) => setAddRule(e.target.checked)}
              className="mt-0.5"
            />
            <span>分類ルールを追加して今後の類似明細にも適用</span>
          </label>

          {addRule ? (
            <div className="mt-3 flex flex-col gap-3">
              <label className="text-xs font-medium text-gray-600">
                適用キーワード
                <input
                  value={ruleKeyword}
                  onChange={(e) => setRuleKeyword(e.target.value)}
                  className="mt-1 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm"
                />
              </label>
              {!ruleInputValid && (
                <p className="text-xs text-rose-600">
                  この取引の説明に含まれるキーワードを入力してください。
                </p>
              )}
              {tx.institution && (
                <label className="flex items-center gap-2 text-xs text-gray-700">
                  <input
                    type="checkbox"
                    checked={limitInstitution}
                    onChange={(e) => setLimitInstitution(e.target.checked)}
                  />
                  この金融機関（{tx.institution}）に限定
                </label>
              )}

              {previewLoading && (
                <p role="status" className="text-xs text-gray-500">
                  影響を確認中...
                </p>
              )}
              {previewError && (
                <div className="rounded border border-rose-200 bg-white p-2">
                  <p className="text-xs text-rose-700">{previewError}</p>
                  <button
                    type="button"
                    onClick={() => setPreviewRetry((value) => value + 1)}
                    className="mt-1 text-xs text-teal-700 underline"
                  >
                    再試行
                  </button>
                </div>
              )}
              {preview && (
                <div className="rounded border border-teal-200 bg-white p-2 text-xs text-gray-600">
                  <p>この条件に一致する既存明細: {preview.matchCount}件</p>
                  {preview.reusableRuleId != null && (
                    <p className="mt-1 text-teal-700">
                      同じ有効な分類ルールを再利用します。
                    </p>
                  )}
                  {preview.conflictingRules.length > 0 && (
                    <div className="mt-1 text-amber-700">
                      <p>競合する既存ルール:</p>
                      <ul className="list-inside list-disc">
                        {preview.conflictingRules.map((rule) => (
                          <li key={rule.id}>
                            {rule.keyword}
                            {rule.institution ? ` @${rule.institution}` : ""}
                            {" → "}
                            {rule.category}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  <p className="mt-2">
                    保存時に変更するのはこの明細のみです。ほかの既存明細には再分類時に反映されます。
                  </p>
                </div>
              )}
            </div>
          ) : (
            <p className="mt-2 text-xs text-amber-700">
              この明細のカテゴリを固定します。全明細を再分類しても変更されません。
            </p>
          )}
        </div>
      )}

      <label className="mb-1 block text-xs font-medium text-gray-600">メモ</label>
      <input
        value={memo}
        onChange={(e) => setMemo(e.target.value)}
        className="mb-4 w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
      />

      {tx.categoryLocked && !categoryChanged && (
        <button
          type="button"
          onClick={unlock}
          disabled={busy}
          className="mb-4 text-xs text-teal-700 underline disabled:opacity-50"
        >
          固定を解除して分類ルールに戻す
        </button>
      )}

      <div className="flex items-center justify-between">
        <Button variant="danger" onClick={() => setConfirmDelete(true)} disabled={busy}>
          削除
        </Button>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            キャンセル
          </Button>
          <Button onClick={save} disabled={saveDisabled}>
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
