import { useState } from "react";
import { api, type SplitMatchType, type SplitRule } from "../../lib/api";
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
  match_type: SplitMatchType;
  pattern: string;
  rate: string;
  priority: string;
};
const emptyDraft: Draft = {
  match_type: "keyword",
  pattern: "",
  rate: "50",
  priority: "100",
};

/** 割り勘ルール（マッチ種別 / パターン / 負担率 / 優先度）の一覧 + CRUD。 */
export function SplitRulesSection() {
  const toast = useToast();
  const rules = useAsync(() => api.getSplitRules(), []);
  const [editing, setEditing] = useState<SplitRule | "new" | null>(null);

  return (
    <Card className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-gray-700">割り勘ルール</h2>
        <Button variant="ghost" onClick={() => setEditing("new")}>
          ＋ 追加
        </Button>
      </div>

      {rules.loading ? (
        <Spinner />
      ) : rules.error ? (
        <ErrorMessage message={rules.error} onRetry={rules.reload} />
      ) : rules.data && rules.data.items.length === 0 ? (
        <EmptyState message="ルールがありません" />
      ) : (
        <div className="max-h-96 overflow-y-auto">
          <ul className="flex flex-col divide-y divide-gray-100">
            {rules.data?.items.map((r) => (
              <li key={r.id}>
                <button
                  type="button"
                  onClick={() => setEditing(r)}
                  className="flex w-full items-center justify-between gap-2 py-2 text-left hover:bg-gray-50"
                >
                  <span className="min-w-0 truncate text-sm text-gray-800">
                    <span className="mr-1 text-xs text-gray-400">
                      {r.match_type === "institution" ? "機関" : "キーワード"}
                    </span>
                    {r.pattern}
                  </span>
                  <span className="flex shrink-0 items-center gap-2">
                    <span className="rounded bg-teal-50 px-1.5 py-0.5 text-xs text-teal-700">
                      {r.rate}%
                    </span>
                    <span className="text-xs text-gray-400">
                      優先 {r.priority}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {editing && (
        <SplitModal
          rule={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onDone={() => {
            setEditing(null);
            rules.reload();
          }}
          onToast={toast}
        />
      )}
    </Card>
  );
}

function SplitModal({
  rule,
  onClose,
  onDone,
  onToast,
}: {
  rule: SplitRule | null;
  onClose: () => void;
  onDone: () => void;
  onToast: { success: (m: string) => void; error: (m: string) => void };
}) {
  const [draft, setDraft] = useState<Draft>(
    rule
      ? {
          match_type: rule.match_type,
          pattern: rule.pattern,
          rate: String(rule.rate),
          priority: String(rule.priority),
        }
      : emptyDraft,
  );
  const [busy, setBusy] = useState(false);

  const save = async () => {
    if (draft.pattern.trim() === "") {
      onToast.error("パターンは必須です");
      return;
    }
    const rate = Number(draft.rate);
    if (!Number.isFinite(rate)) {
      onToast.error("負担率は数値で入力してください");
      return;
    }
    setBusy(true);
    const body = {
      match_type: draft.match_type,
      pattern: draft.pattern.trim(),
      rate: Math.trunc(rate),
      priority: Number(draft.priority) || 100,
    };
    try {
      if (rule) await api.updateSplitRule(rule.id, body);
      else await api.addSplitRule(body);
      onToast.success("保存しました");
      onDone();
    } catch (e) {
      onToast.error(e instanceof Error ? e.message : "保存に失敗しました");
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!rule) return;
    setBusy(true);
    try {
      await api.deleteSplitRule(rule.id);
      onToast.success("削除しました");
      onDone();
    } catch (e) {
      onToast.error(e instanceof Error ? e.message : "削除に失敗しました");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title={rule ? "割り勘ルールを編集" : "割り勘ルールを追加"} onClose={onClose}>
      <div className="flex flex-col gap-3">
        <Field label="マッチ種別">
          <select
            value={draft.match_type}
            onChange={(e) =>
              setDraft({ ...draft, match_type: e.target.value as SplitMatchType })
            }
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
          >
            <option value="keyword">キーワード（内容に部分一致）</option>
            <option value="institution">金融機関（機関名に部分一致）</option>
          </select>
        </Field>
        <Field label="パターン">
          <input
            value={draft.pattern}
            onChange={(e) => setDraft({ ...draft, pattern: e.target.value })}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
          />
        </Field>
        <Field label="負担率（%）">
          <input
            type="number"
            value={draft.rate}
            onChange={(e) => setDraft({ ...draft, rate: e.target.value })}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
          />
        </Field>
        <Field label="優先度（小さいほど優先）">
          <input
            type="number"
            value={draft.priority}
            onChange={(e) => setDraft({ ...draft, priority: e.target.value })}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
          />
        </Field>
      </div>
      <ModalActions
        editing={!!rule}
        busy={busy}
        onSave={save}
        onDelete={remove}
        onCancel={onClose}
      />
    </Modal>
  );
}
