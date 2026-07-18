import type { ReactElement } from "react";
import { Placeholder } from "./pages/Placeholder";

export type TabKey = "home" | "report" | "import" | "settings";

export interface Tab {
  key: TabKey;
  label: string;
  icon: string;
  render: () => ReactElement;
}

export const TABS: Tab[] = [
  {
    key: "home",
    label: "ホーム",
    icon: "🏠",
    render: () => (
      <Placeholder
        title="ホーム"
        description="今月の収支・カテゴリ別支出・総資産をまとめて表示します。"
      />
    ),
  },
  {
    key: "report",
    label: "レポート",
    icon: "📊",
    render: () => (
      <Placeholder
        title="レポート"
        description="月次・年間レポートと資産推移を表示します。"
      />
    ),
  },
  {
    key: "import",
    label: "インポート",
    icon: "📥",
    render: () => (
      <Placeholder
        title="CSVインポート"
        description="複数のCSVファイルをまとめて取り込みます。"
      />
    ),
  },
  {
    key: "settings",
    label: "設定",
    icon: "⚙️",
    render: () => (
      <Placeholder
        title="設定"
        description="分類ルール・CSVフォーマット・割り勘ルール・除外カテゴリを編集します。"
      />
    ),
  },
];
