import { TabBar } from "./components/TabBar";
import { NavProvider, useNav } from "./nav";
import { ToastProvider } from "./components/Toast";
import { TABS } from "./tabs";

function Shell() {
  const { tab } = useNav();
  const current = TABS.find((t) => t.key === tab) ?? TABS[0];
  return (
    <div className="mx-auto flex min-h-full max-w-screen-md flex-col bg-gray-50">
      <main className="flex-1 pb-20">{current.render()}</main>
      <TabBar />
    </div>
  );
}

export function App() {
  return (
    <ToastProvider>
      <NavProvider>
        <Shell />
      </NavProvider>
    </ToastProvider>
  );
}
