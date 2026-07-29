import { createContext, useContext } from "react";
import type { MeResponse } from "../lib/api";

/**
 * ログイン中の利用者。App が起動時に一度だけ取得し、以降は Context で配る。
 * 「編集できるのは自分の明細だけ」の判定にも使うため、画面ごとの再取得はしない。
 */
export const MeContext = createContext<MeResponse | null>(null);

export function useMe(): MeResponse | null {
  return useContext(MeContext);
}
