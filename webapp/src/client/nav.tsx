import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";

export type TabKey = "home" | "transactions" | "report" | "import" | "settings";

/** Cross-page navigation parameters (e.g. drilldown filters). */
export interface NavParams {
  /** Transactions: prefilter by category. */
  category?: string;
  /** Transactions: prefilter by institution. */
  institution?: string;
  /** Transactions / report: target year. */
  year?: number;
  /** Transactions / report: target month. */
  month?: number;
  /** Report: which sub-segment to open. */
  reportSection?: "monthly" | "annual" | "assets" | "splitwise";
}

interface NavState {
  tab: TabKey;
  params: NavParams;
  /** Navigate to a tab, optionally passing params. Params are one-shot: they
   * are consumed by the destination page via `consumeParams`. */
  go: (tab: TabKey, params?: NavParams) => void;
  /** Read and clear the pending params (call once on the destination page). */
  consumeParams: () => NavParams;
}

const NavContext = createContext<NavState | null>(null);

export function NavProvider({ children }: { children: ReactNode }) {
  const [tab, setTab] = useState<TabKey>("home");
  const [params, setParams] = useState<NavParams>({});

  const go = useCallback((next: TabKey, p: NavParams = {}) => {
    setParams(p);
    setTab(next);
  }, []);

  const consumeParams = useCallback(() => {
    const current = params;
    // Clear after read so a later manual tab switch doesn't re-apply filters.
    if (Object.keys(current).length > 0) setParams({});
    return current;
  }, [params]);

  const value = useMemo<NavState>(
    () => ({ tab, params, go, consumeParams }),
    [tab, params, go, consumeParams],
  );

  return <NavContext.Provider value={value}>{children}</NavContext.Provider>;
}

export function useNav(): NavState {
  const ctx = useContext(NavContext);
  if (!ctx) throw new Error("useNav must be used within a NavProvider");
  return ctx;
}
