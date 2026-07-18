import { useState } from "react";
import { TabBar } from "./components/TabBar";
import type { TabKey } from "./tabs";
import { TABS } from "./tabs";

export function App() {
  const [active, setActive] = useState<TabKey>("home");
  const current = TABS.find((t) => t.key === active) ?? TABS[0];

  return (
    <div className="mx-auto flex min-h-full max-w-screen-sm flex-col bg-gray-50">
      <main className="flex-1 pb-20">{current.render()}</main>
      <TabBar active={active} onChange={setActive} />
    </div>
  );
}
