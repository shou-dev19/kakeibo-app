import { useCallback, useEffect, useState } from "react";
import { OWNERS, OWNER_LABELS, isOwnerScope, type OwnerScope } from "../../shared/types";

/**
 * 夫 / 妻 / 合算 の切替。明細画面とレポート画面で共有する。
 *
 * 選択値はセッション内で共有する。明細で「妻」を見てからレポートへ移ると、
 * レポートも「妻」で開くのが自然なため。sessionStorage なので、タブを閉じれば
 * 既定 (合算) に戻る。
 */
const STORAGE_KEY = "kakeibo.ownerScope";
const DEFAULT_SCOPE: OwnerScope = "all";

const SEGMENTS: { key: OwnerScope; label: string }[] = [
  ...OWNERS.map((owner) => ({ key: owner as OwnerScope, label: OWNER_LABELS[owner] })),
  { key: "all", label: "合算" },
];

function readStoredScope(): OwnerScope {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    return isOwnerScope(raw) ? raw : DEFAULT_SCOPE;
  } catch {
    // Private-mode / disabled storage: fall back to the default rather than
    // breaking the screen.
    return DEFAULT_SCOPE;
  }
}

/** Session-shared owner scope state. */
export function useOwnerScope(): [OwnerScope, (next: OwnerScope) => void] {
  const [scope, setScope] = useState<OwnerScope>(readStoredScope);

  // Keep sibling screens in sync when one of them changes the scope.
  useEffect(() => {
    const onChange = (event: Event) => {
      const next = (event as CustomEvent<OwnerScope>).detail;
      if (isOwnerScope(next)) setScope(next);
    };
    window.addEventListener(STORAGE_KEY, onChange);
    return () => window.removeEventListener(STORAGE_KEY, onChange);
  }, []);

  const update = useCallback((next: OwnerScope) => {
    setScope(next);
    try {
      sessionStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Storage failures only cost us cross-screen persistence.
    }
    window.dispatchEvent(new CustomEvent(STORAGE_KEY, { detail: next }));
  }, []);

  return [scope, update];
}

export function OwnerTabs({
  value,
  onChange,
}: {
  value: OwnerScope;
  onChange: (next: OwnerScope) => void;
}) {
  return (
    <div role="tablist" aria-label="利用者で絞り込み" className="flex rounded-lg bg-gray-100 p-1">
      {SEGMENTS.map((segment) => (
        <button
          key={segment.key}
          type="button"
          role="tab"
          aria-selected={value === segment.key}
          onClick={() => onChange(segment.key)}
          className={`flex-1 rounded-md py-1.5 text-sm font-medium transition ${
            value === segment.key
              ? "bg-white text-teal-700 shadow-sm"
              : "text-gray-500"
          }`}
        >
          {segment.label}
        </button>
      ))}
    </div>
  );
}

/** 明細カードなどに付ける小さな利用者バッジ。 */
export function OwnerBadge({ owner }: { owner: keyof typeof OWNER_LABELS }) {
  return (
    <span className="rounded bg-violet-50 px-1.5 py-0.5 text-violet-700">
      {OWNER_LABELS[owner]}
    </span>
  );
}
