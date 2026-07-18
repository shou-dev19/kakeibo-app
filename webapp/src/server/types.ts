import type { JWTPayload } from "jose";

/** Bindings and vars available on the Worker (see wrangler.jsonc). */
export interface Bindings {
  DB: D1Database;
  ASSETS: Fetcher;
  DEV_BYPASS_ACCESS: string;
  ACCESS_TEAM_DOMAIN: string;
  ACCESS_AUD: string;
  /** Comma-separated allow-list of permitted email addresses. */
  ALLOWED_EMAILS: string;
}

/** Values stashed on the Hono context. */
export interface Variables {
  accessPayload?: JWTPayload & { email?: string };
}

/** Hono environment generic used across the server. */
export interface AppEnv {
  Bindings: Bindings;
  Variables: Variables;
}
