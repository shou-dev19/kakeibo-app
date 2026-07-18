import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError } from "../lib/api";

export interface AsyncState<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
  /** Re-run the async function. */
  reload: () => void;
}

function messageOf(e: unknown): string {
  if (e instanceof ApiError) return e.message;
  if (e instanceof Error) return e.message;
  return "予期しないエラーが発生しました。";
}

/**
 * Run an async function on mount and whenever `deps` change. Tracks
 * loading/error/data and exposes a `reload()`. Stale responses are ignored so
 * rapid dependency changes never render an out-of-date result.
 */
export function useAsync<T>(
  fn: () => Promise<T>,
  deps: unknown[],
): AsyncState<T> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);
  const reqId = useRef(0);

  // fn is intentionally excluded from deps; callers pass a `deps` array that
  // captures everything the fn closes over.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const stableFn = useCallback(fn, deps);

  useEffect(() => {
    const id = ++reqId.current;
    setLoading(true);
    setError(null);
    stableFn()
      .then((result) => {
        if (id === reqId.current) {
          setData(result);
          setLoading(false);
        }
      })
      .catch((e: unknown) => {
        if (id === reqId.current) {
          setError(messageOf(e));
          setLoading(false);
        }
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stableFn, nonce]);

  const reload = useCallback(() => setNonce((n) => n + 1), []);

  return { data, loading, error, reload };
}
