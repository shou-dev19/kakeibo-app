import { useState } from "react";
import { api, type CategoryRule } from "../../lib/api";
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

type Draft = {
  keyword: string;
  institution: string;
  category: string;
  priority: string;
};

const emptyDraft: Draft = { keyword: "", institution: "", category: "", priority: "100" };

/** 分類ルール（キーワード / 金融機関 / カテゴリ / 優先度）の一覧 + CRUD。 */
export function CategoryRulesSection() {
  const toast = useToast();
  const rules = useAsync(() => api.getCategoryRules(), []);
  const [editing, setEditing] = useState<CategoryRule | "new" | null>(null);

  return (
    <Card className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-gray-700">分類ルール</h2>
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
                  <span className="min-w-0">
                    <span className="text-sm text-gray-800">
                      {r.keyword}
                      {r.institution ? (
                        <span className="ml-1 text-xs text-gray-400">
                          @{r.institution}
                        </span>
                      ) : null}
                    </span>
                    <span className="ml-2 rounded bg-teal-50 px-1.5 py-0.5 text-xs text-teal-700">
                      {r.category}
                    </span>
                  </span>
                  <span className="shrink-0 text-xs text-gray-400">
                    優先 {r.priority}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {editing && (
        <RuleModal
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

function RuleModal({
  rule,
  onClose,
  onDone,
  onToast,
}: {
  rule: CategoryRule | null;
  onClose: () => void;
  onDone: () => void;
  onToast: { success: (m: string) => void; error: (m: string) => void };
}) {
  const [draft, setDraft] = useState<Draft>(
    rule
      ? {
          keyword: rule.keyword,
          institution: rule.institution ?? "",
          category: rule.category,
          priority: String(rule.priority),
        }
      : emptyDraft,
  );
  const [busy, setBusy] = useState(false);

  const save = async () => {
    if (draft.keyword.trim() === "" || draft.category.trim() === "") {
      onToast.error("キーワードとカテゴリは必須です");
      return;
    }
    setBusy(true);
    const body = {
      keyword: draft.keyword.trim(),
      institution: draft.institution.trim() === "" ? null : draft.institution.trim(),
      category: draft.category.trim(),
      priority: Number(draft.priority) || 100,
    };
    try {
      if (rule) await api.updateCategoryRule(rule.id, body);
      else await api.addCategoryRule(body);
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
      await api.deleteCategoryRule(rule.id);
      onToast.success("削除しました");
      onDone();
    } catch (e) {
      onToast.error(e instanceof Error ? e.message : "削除に失敗しました");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title={rule ? "ルールを編集" : "ルールを追加"} onClose={onClose}>
      <div className="flex flex-col gap-3">
        <Field label="キーワード（部分一致）">
          <input
            value={draft.keyword}
            onChange={(e) => setDraft({ ...draft, keyword: e.target.value })}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
          />
        </Field>
        <Field label="金融機関（任意・完全一致）">
          <input
            value={draft.institution}
            onChange={(e) => setDraft({ ...draft, institution: e.target.value })}
            placeholder="空欄可"
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
          />
        </Field>
        <Field label="カテゴリ">
          <input
            value={draft.category}
            onChange={(e) => setDraft({ ...draft, category: e.target.value })}
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

export function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-gray-600">{label}</span>
      {children}
    </label>
  );
}

export function ModalActions({
  editing,
  busy,
  onSave,
  onDelete,
  onCancel,
}: {
  editing: boolean;
  busy: boolean;
  onSave: () => void;
  onDelete?: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="mt-5 flex items-center justify-between">
      {editing && onDelete ? (
        <Button variant="danger" onClick={onDelete} disabled={busy}>
          削除
        </Button>
      ) : (
        <span />
      )}
      <div className="flex gap-2">
        <Button variant="secondary" onClick={onCancel} disabled={busy}>
          キャンセル
        </Button>
        <Button onClick={onSave} disabled={busy}>
          {busy ? "保存中..." : "保存"}
        </Button>
      </div>
    </div>
  );
}
