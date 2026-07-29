import { useState } from "react";
import { useMe } from "../hooks/useMe";
import { Button, Card, Page } from "../components/ui";
import { ConfirmDialog } from "../components/Modal";
import { CategoryRulesSection } from "./settings/CategoryRulesSection";
import { CsvFormatsSection } from "./settings/CsvFormatsSection";
import { RecategorizeSection } from "./settings/RecategorizeSection";
import { SplitRulesSection } from "./settings/SplitRulesSection";
import { ExcludedCategoriesSection } from "./settings/ExcludedCategoriesSection";

/** 設定: 各種ルール / 全件再分類 / アカウント操作。 */
export function SettingsPage() {
  const me = useMe();
  const [confirmingLogout, setConfirmingLogout] = useState(false);

  const logout = () => {
    window.location.assign("/cdn-cgi/access/logout");
  };

  return (
    <Page title="設定">
      {me && (
        <p className="-mt-2 text-sm text-gray-500">
          {me.label}としてログイン中
        </p>
      )}

      <RecategorizeSection />

      <div className="grid gap-4 md:grid-cols-2">
        <CategoryRulesSection />
        <SplitRulesSection />
        <CsvFormatsSection />
        <ExcludedCategoriesSection />
      </div>

      <Card className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-gray-700">アカウント</h2>
          <p className="text-xs text-gray-500">
            このアプリからログアウトします。
          </p>
        </div>
        <Button variant="danger" onClick={() => setConfirmingLogout(true)}>
          ログアウト
        </Button>
      </Card>

      {confirmingLogout && (
        <ConfirmDialog
          title="ログアウト"
          message="ログアウトしますか？"
          confirmLabel="ログアウト"
          danger
          onConfirm={logout}
          onCancel={() => setConfirmingLogout(false)}
        />
      )}
    </Page>
  );
}
