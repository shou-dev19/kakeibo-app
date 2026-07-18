import { createMiddleware } from "hono/factory";
import { createRemoteJWKSet, jwtVerify } from "jose";
import type { JWTPayload } from "jose";
import type { AppEnv } from "../types";

/**
 * Cloudflare Access JWT verification middleware (second wall of defense).
 *
 * Cloudflare Access sits in front of the app and injects a signed JWT into the
 * `Cf-Access-Jwt-Assertion` header on every request. We re-verify it here as a
 * safeguard against Access misconfiguration:
 *   1. Verify the JWT signature / issuer / audience against Access' JWKS.
 *   2. Re-check the `email` claim against the ALLOWED_EMAILS allow-list, so a
 *      misconfigured Access policy alone cannot grant access.
 *
 * In local development, set `DEV_BYPASS_ACCESS=true` (in `.dev.vars`) to skip
 * verification entirely. This must never be enabled in production.
 */

const ACCESS_HEADER = "Cf-Access-Jwt-Assertion";

/** Cached JWKS keyed by team domain so we don't refetch on every request. */
const jwksCache = new Map<string, ReturnType<typeof createRemoteJWKSet>>();

function getJwks(teamDomain: string) {
  let jwks = jwksCache.get(teamDomain);
  if (!jwks) {
    const certsUrl = new URL(`https://${teamDomain}/cdn-cgi/access/certs`);
    jwks = createRemoteJWKSet(certsUrl);
    jwksCache.set(teamDomain, jwks);
  }
  return jwks;
}

/**
 * Parse the comma-separated ALLOWED_EMAILS var into a normalized (lowercased,
 * trimmed) set of allowed addresses.
 */
function parseAllowedEmails(raw: string | undefined): Set<string> {
  const set = new Set<string>();
  if (!raw) return set;
  for (const part of raw.split(",")) {
    const email = part.trim().toLowerCase();
    if (email) set.add(email);
  }
  return set;
}

/**
 * Verifies an Access JWT and returns its payload. Exposed via an injectable
 * options object so tests can substitute a stub verifier without reaching out
 * to a real JWKS endpoint.
 */
export type JwtVerifier = (
  token: string,
  teamDomain: string,
  aud: string,
) => Promise<JWTPayload>;

const defaultVerifier: JwtVerifier = async (token, teamDomain, aud) => {
  const { payload } = await jwtVerify(token, getJwks(teamDomain), {
    issuer: `https://${teamDomain}`,
    audience: aud,
  });
  return payload;
};

export interface AccessAuthOptions {
  /** Override the JWT verifier (used in tests). */
  verify?: JwtVerifier;
}

export function createAccessAuth(options: AccessAuthOptions = {}) {
  const verify = options.verify ?? defaultVerifier;

  return createMiddleware<AppEnv>(async (c, next) => {
    if (c.env.DEV_BYPASS_ACCESS === "true") {
      await next();
      return;
    }

    const token = c.req.header(ACCESS_HEADER);
    if (!token) {
      return c.json({ error: "Missing Access JWT" }, 401);
    }

    const teamDomain = c.env.ACCESS_TEAM_DOMAIN;
    const aud = c.env.ACCESS_AUD;
    if (!teamDomain || !aud) {
      return c.json({ error: "Access verification not configured" }, 500);
    }

    let payload: JWTPayload & { email?: string };
    try {
      payload = (await verify(token, teamDomain, aud)) as JWTPayload & {
        email?: string;
      };
    } catch {
      return c.json({ error: "Invalid Access JWT" }, 401);
    }

    // Re-check the email claim against the allow-list. This is the safeguard
    // against an Access policy that was accidentally left too permissive.
    const allowed = parseAllowedEmails(c.env.ALLOWED_EMAILS);
    const email = payload.email?.trim().toLowerCase();
    if (!email || !allowed.has(email)) {
      return c.json({ error: "Email not allowed" }, 403);
    }

    c.set("accessPayload", payload);
    await next();
  });
}

/** Default middleware instance using the real JWT verifier. */
export const accessAuth = createAccessAuth();
