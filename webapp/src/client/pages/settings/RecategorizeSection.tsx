import { useState } from "react";
import { api, type RecategorizePreview, type RecategorizeRun } from "../../lib/api";
import { useAsync } from "../../hooks/useAsync";
import { useToast } from "../../components/Toast";
import { useMe } from "../../hooks/useMe";
import { Modal } from "../../components/Modal";
import { Button, Card } from "../../components/ui";

/**
 * 全件再分類。
 *
 * 対象はログイン利用者の明細のみ（サーバがログインから決めるので、画面から
 * 相手の明細を対象にする方法はない）。そのうえで、一度誤って流すと復旧が大変
 * だった問題を実行前と実行後の両方から塞ぐ:
 *   - 実行前: ドライランで「何が何件どう変わるか」を見てから確定する
 *   - 実行後: 直近1回を取り消せる
 */
export function RecategorizeSection() {
  const toast = useToast();
  const me = useMe();
  const lastRun = useAsync(() => api.getLastRecategorizeRun(), []);

  const [preview, setPreview] = useState<RecategorizePreview | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [busy, setBusy] = useState(false);

  const openPreview = async () => {
    setPreviewing(true);
    try {
      setPreview(await api.previewRecategorize());
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "影響確認に失敗しました");
    } finally {
      setPreviewing(false);
    }
  };

  const apply = async () => {
    setBusy(true);
    try {
      const res = await api.recategorizeAll();
      toast.success(
        `再分類完了: ${res.total}件中 ${res.updated}件を更新、手動固定 ${res.skippedLocked}件をスキップしました`,
      );
      setPreview(null);
      lastRun.reload();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "再分類に失敗しました");
    } finally {
      setBusy(false);
    }
  };

  const undo = async () => {
    setBusy(true);
    try {
      const res = await api.undoRecategorize();
      toast.success(
        res.skippedModified > 0
          ? `${res.reverted}件を元に戻しました（再分類後に手動変更した ${res.skippedModified}件はそのままです）`
          : `${res.reverted}件を元に戻しました`,
      );
      lastRun.reload();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "取り消しに失敗しました");
    } finally {
      setBusy(false);
    }
  };

  const run = lastRun.data?.run ?? null;

  return (
    <Card className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-gray-700">
            全件再分類{me ? `（${me.label}の明細のみ）` : ""}
          </h2>
          <p className="text-xs text-gray-500">
            現在の分類ルールを、手動固定されていないあなたの全取引に再適用します。
          </p>
        </div>
        <Button onClick={openPreview} disabled={previewing || busy}>
          {previewing ? "確認中..." : "実行"}
        </Button>
      </div>

      {run && <LastRunRow run={run} busy={busy} onUndo={undo} />}

      {preview && (
        <PreviewModal
          preview={preview}
          busy={busy}
          onConfirm={apply}
          onClose={() => setPreview(null)}
        />
      )}
    </Card>
  );
}

function LastRunRow({
  run,
  busy,
  onUndo,
}: {
  run: RecategorizeRun;
  busy: boolean;
  onUndo: () => void;
}) {
  return (
    <div className="flex items-center justify-between gap-2 rounded-lg bg-gray-50 p-2 text-xs text-gray-600">
      <span>
        直近の再分類: {run.executed_at} ／ {run.updated_count}件を更新
        {run.reverted_at && (
          <span className="ml-1 text-gray-400">（取り消し済み）</span>
        )}
      </span>
      {!run.reverted_at && (
        <Button variant="secondary" onClick={onUndo} disabled={busy}>
          取り消す
        </Button>
      )}
    </div>
  );
}

function PreviewModal({
  preview,
  busy,
  onConfirm,
  onClose,
}: {
  preview: RecategorizePreview;
  busy: boolean;
  onConfirm: () => void;
  onClose: () => void;
}) {
  const nothingToDo = preview.changeCount === 0;

  return (
    <Modal title="全件再分類の確認" onClose={onClose}>
      <p className="text-sm text-gray-700">
        対象 {preview.total}件のうち <strong>{preview.changeCount}件</strong>
        のカテゴリが変わります。
        {preview.skippedLocked > 0 && (
          <span className="text-gray-500">
            （手動固定 {preview.skippedLocked}件はスキップ）
          </span>
        )}
      </p>

      {nothingToDo ? (
        <p className="mt-3 text-sm text-gray-500">
          変更はありません。実行しても現在の分類のままです。
        </p>
      ) : (
        <>
          <h3 className="mt-4 mb-1 text-xs font-medium text-gray-600">変更の内訳</h3>
          <ul className="max-h-40 overflow-y-auto rounded border border-gray-200 text-sm">
            {preview.summary.map((row) => (
              <li
                key={`${row.from}-${row.to}`}
                className="flex items-center justify-between gap-2 border-b border-gray-100 px-2 py-1.5 last:border-b-0"
              >
                <span className="min-w-0 truncate text-gray-700">
                  {row.from} → {row.to}
                </span>
                <span className="shrink-0 tabular-nums text-gray-500">
                  {row.count}件
                </span>
              </li>
            ))}
          </ul>

          <h3 className="mt-4 mb-1 text-xs font-medium text-gray-600">
            対象明細の例（先頭{preview.samples.length}件）
          </h3>
          <ul className="max-h-40 overflow-y-auto rounded border border-gray-200 text-xs">
            {preview.samples.map((row) => (
              <li
                key={row.id}
                className="border-b border-gray-100 px-2 py-1.5 last:border-b-0"
              >
                <p className="truncate text-gray-700">{row.description}</p>
                <p className="text-gray-400">
                  {row.date} ・ {row.from} → {row.to}
                </p>
              </li>
            ))}
          </ul>

          <p className="mt-3 text-xs text-gray-500">
            実行後も「取り消す」で元に戻せます。
          </p>
        </>
      )}

      <div className="mt-5 flex justify-end gap-2">
        <Button variant="secondary" onClick={onClose} disabled={busy}>
          キャンセル
        </Button>
        <Button onClick={onConfirm} disabled={busy || nothingToDo}>
          {busy ? "実行中..." : "この内容で実行"}
        </Button>
      </div>
    </Modal>
  );
}
