import { useState } from "react";
import { api } from "../lib/api";
import { useToast } from "../components/Toast";
import { Button, Card, Page } from "../components/ui";
import { ConfirmDialog } from "../components/Modal";
import { CategoryRulesSection } from "./settings/CategoryRulesSection";
import { CsvFormatsSection } from "./settings/CsvFormatsSection";
import { SplitRulesSection } from "./settings/SplitRulesSection";
import { ExcludedCategoriesSection } from "./settings/ExcludedCategoriesSection";

/** 設定: 分類ルール / CSVフォーマット / 割り勘ルール / 除外カテゴリ + 全件再分類。 */
export function SettingsPage() {
  const toast = useToast();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);

  const recategorize = async () => {
    setBusy(true);
    try {
      const res = await api.recategorizeAll();
      toast.success(
        `再分類完了: ${res.total}件中 ${res.updated}件を更新しました`,
      );
      setConfirming(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "再分類に失敗しました");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Page title="設定">
      <Card className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-gray-700">全件再分類</h2>
          <p className="text-xs text-gray-500">
            現在の分類ルールを全取引に再適用します。
          </p>
        </div>
        <Button onClick={() => setConfirming(true)}>実行</Button>
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        <CategoryRulesSection />
        <SplitRulesSection />
        <CsvFormatsSection />
        <ExcludedCategoriesSection />
      </div>

      {confirming && (
        <ConfirmDialog
          title="全件再分類"
          message="全ての取引に現在の分類ルールを再適用します。よろしいですか？"
          confirmLabel="再分類する"
          busy={busy}
          onConfirm={recategorize}
          onCancel={() => setConfirming(false)}
        />
      )}
    </Page>
  );
}
