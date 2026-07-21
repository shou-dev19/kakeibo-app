import { useMemo, useRef, useState } from "react";
import {
  api,
  type ImportPreviewFile,
  type ImportResultFile,
} from "../lib/api";
import { useAsync } from "../hooks/useAsync";
import { useToast } from "../components/Toast";
import { fileToBase64 } from "../lib/file";
import { Button, Card, EmptyState, Page, Spinner } from "../components/ui";

interface StagedFile {
  filename: string;
  contentBase64: string;
  /** Manual format override (used when auto-detection failed / to correct it). */
  formatName?: string;
}

/** CSV import: multi-file drag&drop -> preview -> bulk import with per-file results. */
export function ImportPage() {
  const toast = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  const [staged, setStaged] = useState<StagedFile[]>([]);
  const [previews, setPreviews] = useState<ImportPreviewFile[] | null>(null);
  const [results, setResults] = useState<ImportResultFile[] | null>(null);
  const [busy, setBusy] = useState(false);

  const formats = useAsync(() => api.getCsvFormats(), []);
  const formatNames = useMemo(
    () => (formats.data?.items ?? []).map((f) => f.name),
    [formats.data],
  );

  const addFiles = async (files: FileList | File[]) => {
    const arr = [...files];
    const encoded: StagedFile[] = [];
    for (const f of arr) {
      try {
        const contentBase64 = await fileToBase64(f);
        encoded.push({ filename: f.name, contentBase64 });
      } catch {
        toast.error(`${f.name} の読み込みに失敗しました`);
      }
    }
    setStaged((prev) => [...prev, ...encoded]);
    setPreviews(null);
    setResults(null);
  };

  const runPreview = async (list = staged) => {
    if (list.length === 0) return;
    setBusy(true);
    setResults(null);
    try {
      const res = await api.previewImports(
        list.map((s) => ({
          filename: s.filename,
          contentBase64: s.contentBase64,
          formatName: s.formatName,
        })),
      );
      setPreviews(res.files);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "プレビューに失敗しました");
    } finally {
      setBusy(false);
    }
  };

  const runImport = async () => {
    if (staged.length === 0) return;
    setBusy(true);
    try {
      const res = await api.runImports(
        staged.map((s) => ({
          filename: s.filename,
          contentBase64: s.contentBase64,
          formatName: s.formatName,
        })),
      );
      setResults(res.files);
      const imported = res.files.reduce((sum, f) => sum + f.imported, 0);
      const errored = res.files.filter((f) => f.error).length;
      if (errored > 0) {
        toast.error(`${imported}件取込・${errored}ファイルでエラー`);
      } else {
        toast.success(`${imported}件を取り込みました`);
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "インポートに失敗しました");
    } finally {
      setBusy(false);
    }
  };

  const setFormatOverride = (index: number, formatName: string) => {
    setStaged((prev) =>
      prev.map((s, i) =>
        i === index ? { ...s, formatName: formatName || undefined } : s,
      ),
    );
    setPreviews(null);
  };

  const removeStaged = (index: number) => {
    setStaged((prev) => prev.filter((_, i) => i !== index));
    setPreviews(null);
    setResults(null);
  };

  const reset = () => {
    setStaged([]);
    setPreviews(null);
    setResults(null);
  };

  const canImport =
    previews != null &&
    previews.length === staged.length &&
    previews.every((preview) => preview.error == null && preview.detectedFormat != null);

  return (
    <Page title="CSVインポート">
      {/* Drop zone */}
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          if (e.dataTransfer.files.length) addFiles(e.dataTransfer.files);
        }}
        onClick={() => inputRef.current?.click()}
        className={`flex cursor-pointer flex-col items-center gap-2 rounded-xl border-2 border-dashed p-8 text-center transition ${
          dragging ? "border-teal-500 bg-teal-50" : "border-gray-300 bg-white"
        }`}
      >
        <span className="text-3xl">📥</span>
        <p className="text-sm font-medium text-gray-700">
          CSVファイルをドラッグ＆ドロップ
        </p>
        <p className="text-xs text-gray-400">またはタップしてファイルを選択（複数可）</p>
        <input
          ref={inputRef}
          type="file"
          accept=".csv,text/csv"
          multiple
          className="hidden"
          onChange={(e) => {
            if (e.target.files?.length) addFiles(e.target.files);
            e.target.value = "";
          }}
        />
      </div>

      {/* Staged files + preview */}
      {staged.length > 0 && (
        <Card className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-gray-700">
              選択中のファイル（{staged.length}件）
            </h2>
            <button
              type="button"
              onClick={reset}
              className="text-xs text-gray-500 underline"
            >
              全てクリア
            </button>
          </div>

          <ul className="flex flex-col gap-3">
            {staged.map((s, i) => {
              const preview = previews?.[i];
              return (
                <li
                  key={`${s.filename}-${i}`}
                  className="rounded-lg border border-gray-200 p-3"
                >
                  <div className="flex items-start justify-between gap-2">
                    <p className="min-w-0 truncate text-sm font-medium text-gray-800">
                      {s.filename}
                    </p>
                    <button
                      type="button"
                      onClick={() => removeStaged(i)}
                      aria-label="削除"
                      className="shrink-0 text-gray-400 hover:text-rose-600"
                    >
                      ×
                    </button>
                  </div>

                  {preview && (
                    <div className="mt-2 text-xs text-gray-600">
                      {preview.error ? (
                        <p className="text-rose-600">{preview.error}</p>
                      ) : (
                        <div className="flex flex-wrap gap-x-3 gap-y-1">
                          <span>
                            判定:{" "}
                            <span
                              className={
                                preview.detectionConfident
                                  ? "text-teal-700"
                                  : "text-amber-600"
                              }
                            >
                              {preview.detectedFormat ?? "不明"}
                              {preview.detectedFormat && !preview.detectionConfident
                                ? "（要確認）"
                                : ""}
                            </span>
                          </span>
                          <span>{preview.count}件</span>
                          {preview.dateFrom && (
                            <span>
                              {preview.dateFrom} 〜 {preview.dateTo}
                            </span>
                          )}
                          {preview.duplicateCount > 0 && (
                            <span className="text-amber-600">
                              重複 {preview.duplicateCount}件
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Manual format override is always available. */}
                  <div className="mt-2">
                    <label className="mr-2 text-xs text-gray-500">
                      フォーマットを手動選択:
                    </label>
                    <select
                      value={s.formatName ?? ""}
                      onChange={(e) => setFormatOverride(i, e.target.value)}
                      className="rounded border border-gray-300 px-2 py-1 text-xs"
                    >
                      <option value="">自動判定</option>
                      {formatNames.map((n) => (
                        <option key={n} value={n}>
                          {n}
                        </option>
                      ))}
                    </select>
                  </div>
                </li>
              );
            })}
          </ul>

          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={() => runPreview()} disabled={busy}>
              {busy && !results ? "確認中..." : "内容を確認（プレビュー）"}
            </Button>
            <Button onClick={runImport} disabled={busy || !canImport}>
              {busy ? "取込中..." : "まとめてインポート"}
            </Button>
          </div>
        </Card>
      )}

      {busy && staged.length === 0 && <Spinner />}

      {/* Results */}
      {results && (
        <Card className="flex flex-col gap-2">
          <h2 className="text-sm font-semibold text-gray-700">インポート結果</h2>
          <ul className="flex flex-col divide-y divide-gray-100">
            {results.map((r, i) => (
              <li key={`${r.filename}-${i}`} className="py-2">
                <p className="text-sm font-medium text-gray-800">{r.filename}</p>
                {r.error ? (
                  <p className="text-xs text-rose-600">エラー: {r.error}</p>
                ) : (
                  <p className="text-xs text-gray-600">
                    <span className="text-teal-700">取込 {r.imported}件</span>
                    {r.duplicateSkipped > 0 && (
                      <span className="ml-2 text-amber-600">
                        重複スキップ {r.duplicateSkipped}件
                      </span>
                    )}
                    {r.format && <span className="ml-2 text-gray-400">[{r.format}]</span>}
                  </p>
                )}
              </li>
            ))}
          </ul>
        </Card>
      )}

      {staged.length === 0 && !results && (
        <EmptyState message="CSVファイルを追加するとプレビューできます" />
      )}
    </Page>
  );
}
