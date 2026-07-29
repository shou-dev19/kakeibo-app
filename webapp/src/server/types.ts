import type { JWTPayload } from "jose";
import type { Owner } from "../shared/types";

/** Bindings and vars available on the Worker (see wrangler.jsonc). */
export interface Bindings {
  DB: D1Database;
  ASSETS: Fetcher;
  DEV_BYPASS_ACCESS: string;
  ACCESS_TEAM_DOMAIN: string;
  ACCESS_AUD: string;
  /** Comma-separated allow-list of permitted email addresses. */
  ALLOWED_EMAILS: string;
  /** `husband:aaa@example.com,wife:bbb@example.com` 形式の利用者マッピング。 */
  OWNER_EMAILS: string;
  /** ローカル開発時に成りすます利用者 (`.dev.vars` 用)。 */
  DEV_OWNER?: string;
}

/** Values stashed on the Hono context. */
export interface Variables {
  accessPayload?: JWTPayload & { email?: string };
  /** ログイン中の利用者。書き込み系はクエリではなく必ずこれを使う。 */
  owner?: Owner;
}

/** Hono environment generic used across the server. */
export interface AppEnv {
  Bindings: Bindings;
  Variables: Variables;
}
