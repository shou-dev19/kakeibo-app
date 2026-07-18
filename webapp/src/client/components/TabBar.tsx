import { TABS } from "../tabs";
import { useNav } from "../nav";

/** Bottom tab navigation (mobile-first, wider on desktop). */
export function TabBar() {
  const { tab, go } = useNav();
  return (
    <nav className="fixed inset-x-0 bottom-0 z-10 border-t border-gray-200 bg-white pb-[env(safe-area-inset-bottom)]">
      <ul className="mx-auto flex max-w-screen-md">
        {TABS.map((t) => {
          const isActive = t.key === tab;
          return (
            <li key={t.key} className="flex-1">
              <button
                type="button"
                onClick={() => go(t.key)}
                aria-current={isActive ? "page" : undefined}
                className={`flex w-full flex-col items-center gap-0.5 py-2 text-xs ${
                  isActive ? "text-teal-700" : "text-gray-400"
                }`}
              >
                <span className="text-lg leading-none" aria-hidden>
                  {t.icon}
                </span>
                <span>{t.label}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
