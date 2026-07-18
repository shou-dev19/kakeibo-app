import { useState } from "react";
import { api, type CsvFormat } from "../../lib/api";
import { useAsync } from "../../hooks/useAsync";
import { useToast } from "../../components/Toast";
import { Modal } from "../../components/Modal";
import {
  Button,
  Card,
  EmptyState,
  ErrorMessage,
  Spinner,
} from "../../components/ui";
import { Field, ModalActions } from "./CategoryRulesSection";

type Draft = {
  name: string;
  date_col: string;
  desc_col: string;
  expense_col: string;
  income_col: string;
  balance_col: string;
  header_rows: string;
  encoding: string;
};

const emptyDraft: Draft = {
  name: "",
  date_col: "1",
  desc_col: "2",
  expense_col: "",
  income_col: "",
  balance_col: "",
  header_rows: "1",
  encoding: "UTF-8",
};

/** CSVフォーマット定義の一覧 + CRUD（列番号は1-based）。 */
export function CsvFormatsSection() {
  const toast = useToast();
  const formats = useAsync(() => api.getCsvFormats(), []);
  const [editing, setEditing] = useState<CsvFormat | "new" | null>(null);

  return (
    <Card className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-gray-700">CSVフォーマット</h2>
        <Button variant="ghost" onClick={() => setEditing("new")}>
          ＋ 追加
        </Button>
      </div>

      {formats.loading ? (
        <Spinner />
      ) : formats.error ? (
        <ErrorMessage message={formats.error} onRetry={formats.reload} />
      ) : formats.data && formats.data.items.length === 0 ? (
        <EmptyState message="フォーマットがありません" />
      ) : (
        <ul className="flex flex-col divide-y divide-gray-100">
          {formats.data?.items.map((f) => (
            <li key={f.id}>
              <button
                type="button"
                onClick={() => setEditing(f)}
                className="flex w-full items-center justify-between gap-2 py-2 text-left hover:bg-gray-50"
              >
                <span className="text-sm text-gray-800">{f.name}</span>
                <span className="text-xs text-gray-400">
                  {f.encoding}・日{f.date_col}/名{f.desc_col}
                  {f.expense_col ? `/出${f.expense_col}` : ""}
                  {f.income_col ? `/入${f.income_col}` : ""}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {editing && (
        <FormatModal
          format={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onDone={() => {
            setEditing(null);
            formats.reload();
          }}
          onToast={toast}
        />
      )}
    </Card>
  );
}

function FormatModal({
  format,
  onClose,
  onDone,
  onToast,
}: {
  format: CsvFormat | null;
  onClose: () => void;
  onDone: () => void;
  onToast: { success: (m: string) => void; error: (m: string) => void };
}) {
  const [draft, setDraft] = useState<Draft>(
    format
      ? {
          name: format.name,
          date_col: String(format.date_col),
          desc_col: String(format.desc_col),
          expense_col: format.expense_col == null ? "" : String(format.expense_col),
          income_col: format.income_col == null ? "" : String(format.income_col),
          balance_col: format.balance_col == null ? "" : String(format.balance_col),
          header_rows: String(format.header_rows),
          encoding: format.encoding,
        }
      : emptyDraft,
  );
  const [busy, setBusy] = useState(false);

  const num = (v: string): number | null => (v.trim() === "" ? null : Number(v));

  const save = async () => {
    if (draft.name.trim() === "") {
      onToast.error("フォーマット名は必須です");
      return;
    }
    const dateCol = num(draft.date_col);
    const descCol = num(draft.desc_col);
    if (dateCol == null || descCol == null) {
      onToast.error("日付列・内容列は必須です");
      return;
    }
    setBusy(true);
    const body = {
      name: draft.name.trim(),
      date_col: dateCol,
      desc_col: descCol,
      expense_col: num(draft.expense_col),
      income_col: num(draft.income_col),
      balance_col: num(draft.balance_col),
      header_rows: num(draft.header_rows) ?? 1,
      encoding: draft.encoding.trim() || "UTF-8",
    };
    try {
      if (format) await api.updateCsvFormat(format.id, body);
      else await api.addCsvFormat(body);
      onToast.success("保存しました");
      onDone();
    } catch (e) {
      onToast.error(e instanceof Error ? e.message : "保存に失敗しました");
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!format) return;
    setBusy(true);
    try {
      await api.deleteCsvFormat(format.id);
      onToast.success("削除しました");
      onDone();
    } catch (e) {
      onToast.error(e instanceof Error ? e.message : "削除に失敗しました");
    } finally {
      setBusy(false);
    }
  };

  const set = (k: keyof Draft, v: string) => setDraft({ ...draft, [k]: v });

  return (
    <Modal title={format ? "フォーマットを編集" : "フォーマットを追加"} onClose={onClose}>
      <div className="flex flex-col gap-3">
        <Field label="フォーマット名（Driveフォルダ名と一致）">
          <input
            value={draft.name}
            onChange={(e) => set("name", e.target.value)}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
          />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="日付列">
            <NumInput value={draft.date_col} onChange={(v) => set("date_col", v)} />
          </Field>
          <Field label="内容列">
            <NumInput value={draft.desc_col} onChange={(v) => set("desc_col", v)} />
          </Field>
          <Field label="支出列（任意）">
            <NumInput value={draft.expense_col} onChange={(v) => set("expense_col", v)} />
          </Field>
          <Field label="収入列（任意）">
            <NumInput value={draft.income_col} onChange={(v) => set("income_col", v)} />
          </Field>
          <Field label="残高列（任意）">
            <NumInput value={draft.balance_col} onChange={(v) => set("balance_col", v)} />
          </Field>
          <Field label="ヘッダー行数">
            <NumInput value={draft.header_rows} onChange={(v) => set("header_rows", v)} />
          </Field>
        </div>
        <Field label="エンコーディング">
          <select
            value={draft.encoding}
            onChange={(e) => set("encoding", e.target.value)}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
          >
            <option value="UTF-8">UTF-8</option>
            <option value="Shift_JIS">Shift_JIS</option>
          </select>
        </Field>
      </div>
      <ModalActions
        editing={!!format}
        busy={busy}
        onSave={save}
        onDelete={remove}
        onCancel={onClose}
      />
    </Modal>
  );
}

function NumInput({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <input
      type="number"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
    />
  );
}
