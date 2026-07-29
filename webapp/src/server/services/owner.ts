// 利用者 (Owner) の解決。
//
// DB にはメールアドレスではなく 'husband' | 'wife' という固定キーだけを保存し、
// メール → Owner の対応は Worker Secret `OWNER_EMAILS` が持つ。書式は
//
//   OWNER_EMAILS=husband:aaa@example.com,wife:bbb@example.com
//
// これにより (1) メールアドレスが Git にも D1 にも残らない、(2) メールを変更しても
// 既存データが孤立しない、(3) DB 値が短く CHECK 制約で守れる、という利点が得られる。

import type { Context } from "hono";
import { isOwner, isOwnerScope, type Owner, type OwnerScope } from "../../shared/types";
import type { AppEnv } from "../types";

/** ローカル開発 (DEV_BYPASS_ACCESS) で owner を解決できないときの既定値。 */
const DEV_DEFAULT_OWNER: Owner = "husband";

/**
 * `OWNER_EMAILS` を メール(小文字) -> Owner のマップへ変換する。
 * 不正なエントリは無視する (許可を広げる方向には働かない)。
 */
export function parseOwnerEmails(raw: string | undefined): Map<string, Owner> {
  const map = new Map<string, Owner>();
  if (!raw) return map;
  for (const part of raw.split(",")) {
    const separator = part.indexOf(":");
    if (separator < 0) continue;
    const owner = part.slice(0, separator).trim().toLowerCase();
    const email = part.slice(separator + 1).trim().toLowerCase();
    if (!isOwner(owner) || email === "") continue;
    map.set(email, owner);
  }
  return map;
}

/** メールアドレスから Owner を解決する。未登録なら null。 */
export function resolveOwner(
  email: string | undefined,
  raw: string | undefined,
): Owner | null {
  const normalized = email?.trim().toLowerCase();
  if (!normalized) return null;
  return parseOwnerEmails(raw).get(normalized) ?? null;
}

/**
 * ローカル開発時の owner。`.dev.vars` の DEV_OWNER で夫/妻を切り替えられるので、
 * 両方の見え方をローカルで検証できる。
 */
export function devOwner(raw: string | undefined): Owner {
  const value = raw?.trim().toLowerCase();
  return isOwner(value) ? value : DEV_DEFAULT_OWNER;
}

/**
 * ログイン中の利用者を返す。書き込み系 (取込・分類ルール・再分類) は必ずこれを使い、
 * クライアントから owner を受け取らないこと。クエリ経由にすると、古い UI や
 * URL 直打ちで「自分のデータだけを操作する」保証が破れる。
 */
export function requireOwner(c: Context<AppEnv>): Owner {
  const owner = c.get("owner");
  if (!owner) {
    // accessAuth を通っていれば必ず設定されている。到達したら設定ミス。
    throw new Error("owner is not resolved on this request");
  }
  return owner;
}

/**
 * 読み取りスコープ (`?owner=husband|wife|all`) を解釈する。
 * 未指定は 'all' (夫婦合算)、不正値は null を返す (呼び出し側で 400)。
 */
export function parseOwnerScope(raw: string | undefined): OwnerScope | null {
  if (raw == null || raw === "") return "all";
  return isOwnerScope(raw) ? raw : null;
}
