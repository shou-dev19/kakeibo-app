import { describe, it, expect } from "vitest";
import { Hono } from "hono";
import type { JWTPayload } from "jose";
import { createAccessAuth, type JwtVerifier } from "../src/server/middleware/access";
import type { AppEnv, Bindings } from "../src/server/types";

/**
 * Build a tiny app whose only route is guarded by the accessAuth middleware,
 * so we can assert on the middleware's behavior in isolation.
 *
 * `verify` lets us inject a stub JWT verifier, avoiding any network call to a
 * real JWKS endpoint.
 */
function makeApp(verify?: JwtVerifier) {
  const app = new Hono<AppEnv>();
  app.use("*", createAccessAuth(verify ? { verify } : {}));
  app.get("/protected", (c) => {
    const email = c.get("accessPayload")?.email ?? null;
    return c.json({ ok: true, email });
  });
  return app;
}

function makeEnv(overrides: Partial<Bindings> = {}): Bindings {
  return {
    DB: {} as D1Database,
    ASSETS: {} as Fetcher,
    DEV_BYPASS_ACCESS: "false",
    ACCESS_TEAM_DOMAIN: "test.cloudflareaccess.com",
    ACCESS_AUD: "test-aud",
    ALLOWED_EMAILS: "husband@example.com,wife@example.com",
    ...overrides,
  };
}

/** A verifier that always succeeds with a fixed email claim. */
function verifierWithEmail(email?: string): JwtVerifier {
  return async () => ({ email }) as JWTPayload;
}

describe("accessAuth middleware", () => {
  it("returns 401 when bypass is disabled and no JWT header is present", async () => {
    const app = makeApp(verifierWithEmail("husband@example.com"));
    const res = await app.request("/protected", {}, makeEnv());
    expect(res.status).toBe(401);
  });

  it("returns 403 when the JWT email is not in the allow-list", async () => {
    const app = makeApp(verifierWithEmail("stranger@example.com"));
    const res = await app.request(
      "/protected",
      { headers: { "Cf-Access-Jwt-Assertion": "stub-token" } },
      makeEnv(),
    );
    expect(res.status).toBe(403);
  });

  it("returns 403 when the JWT has no email claim", async () => {
    const app = makeApp(verifierWithEmail(undefined));
    const res = await app.request(
      "/protected",
      { headers: { "Cf-Access-Jwt-Assertion": "stub-token" } },
      makeEnv(),
    );
    expect(res.status).toBe(403);
  });

  it("passes through when the JWT email is in the allow-list", async () => {
    const app = makeApp(verifierWithEmail("husband@example.com"));
    const res = await app.request(
      "/protected",
      { headers: { "Cf-Access-Jwt-Assertion": "stub-token" } },
      makeEnv(),
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      ok: true,
      email: "husband@example.com",
    });
  });

  it("compares emails case-insensitively", async () => {
    const app = makeApp(verifierWithEmail("Husband@Example.com"));
    const res = await app.request(
      "/protected",
      { headers: { "Cf-Access-Jwt-Assertion": "stub-token" } },
      makeEnv(),
    );
    expect(res.status).toBe(200);
  });

  it("returns 401 when the JWT fails verification", async () => {
    const failing: JwtVerifier = async () => {
      throw new Error("bad signature");
    };
    const app = makeApp(failing);
    const res = await app.request(
      "/protected",
      { headers: { "Cf-Access-Jwt-Assertion": "stub-token" } },
      makeEnv(),
    );
    expect(res.status).toBe(401);
  });

  it("passes through without a JWT header when DEV_BYPASS_ACCESS is true", async () => {
    const app = makeApp();
    const res = await app.request(
      "/protected",
      {},
      makeEnv({ DEV_BYPASS_ACCESS: "true" }),
    );
    expect(res.status).toBe(200);
  });
});
