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
    return c.json({ ok: true, email, owner: c.get("owner") ?? null });
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
    OWNER_EMAILS: "husband:husband@example.com,wife:wife@example.com",
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
      owner: "husband",
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

// Who you are, not just whether you may in. The owner drives every write, so an
// allow-listed address with no mapping must be rejected rather than defaulted.
describe("accessAuth owner resolution", () => {
  async function ownerFor(email: string, env: Partial<Bindings> = {}) {
    const app = makeApp(verifierWithEmail(email));
    const res = await app.request(
      "/protected",
      { headers: { "Cf-Access-Jwt-Assertion": "stub-token" } },
      makeEnv(env),
    );
    return { status: res.status, body: (await res.json()) as { owner?: string } };
  }

  it("resolves each mapped email to its user", async () => {
    await expect(ownerFor("husband@example.com")).resolves.toMatchObject({
      status: 200,
      body: { owner: "husband" },
    });
    await expect(ownerFor("wife@example.com")).resolves.toMatchObject({
      status: 200,
      body: { owner: "wife" },
    });
  });

  it("resolves the mapping case-insensitively", async () => {
    await expect(ownerFor("Wife@Example.com")).resolves.toMatchObject({
      status: 200,
      body: { owner: "wife" },
    });
  });

  it("rejects an allow-listed email that has no owner mapping", async () => {
    const { status } = await ownerFor("wife@example.com", {
      OWNER_EMAILS: "husband:husband@example.com",
    });
    expect(status).toBe(403);
  });

  it("rejects everyone when OWNER_EMAILS is unset", async () => {
    const { status } = await ownerFor("husband@example.com", {
      OWNER_EMAILS: "",
    });
    expect(status).toBe(403);
  });

  it("ignores malformed OWNER_EMAILS entries instead of widening access", async () => {
    const { status } = await ownerFor("husband@example.com", {
      // No colon, unknown role, and an empty address: none may grant access.
      OWNER_EMAILS: "husband@example.com,child:kid@example.com,wife:",
    });
    expect(status).toBe(403);
  });

  it("acts as DEV_OWNER while the Access bypass is on", async () => {
    const app = makeApp();
    const res = await app.request(
      "/protected",
      {},
      makeEnv({ DEV_BYPASS_ACCESS: "true", DEV_OWNER: "wife" }),
    );
    expect(await res.json()).toMatchObject({ owner: "wife" });
  });

  it("defaults the bypass owner to the husband when DEV_OWNER is absent or bogus", async () => {
    for (const DEV_OWNER of [undefined, "someone-else"]) {
      const app = makeApp();
      const res = await app.request(
        "/protected",
        {},
        makeEnv({ DEV_BYPASS_ACCESS: "true", DEV_OWNER }),
      );
      expect(await res.json()).toMatchObject({ owner: "husband" });
    }
  });
});
