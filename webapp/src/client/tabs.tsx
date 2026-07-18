import type { ReactElement } from "react";
import type { TabKey } from "./nav";
import { HomePage } from "./pages/HomePage";
import { TransactionsPage } from "./pages/TransactionsPage";
import { ReportPage } from "./pages/ReportPage";
import { ImportPage } from "./pages/ImportPage";
import { SettingsPage } from "./pages/SettingsPage";

export interface Tab {
  key: TabKey;
  label: string;
  icon: string;
  render: () => ReactElement;
}

export const TABS: Tab[] = [
  { key: "home", label: "ホーム", icon: "🏠", render: () => <HomePage /> },
  {
    key: "transactions",
    label: "明細",
    icon: "📄",
    render: () => <TransactionsPage />,
  },
  { key: "report", label: "レポート", icon: "📊", render: () => <ReportPage /> },
  { key: "import", label: "インポート", icon: "📥", render: () => <ImportPage /> },
  { key: "settings", label: "設定", icon: "⚙️", render: () => <SettingsPage /> },
];
