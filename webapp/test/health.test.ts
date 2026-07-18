import { describe, it, expect } from "vitest";
import app from "../src/server/index";
import type { Bindings } from "../src/server/types";
import type { HealthResponse } from "../src/shared/types";

/**
 * Minimal D1 stub: returns a fixed table count for the health query.
 * We only implement the surface the /api/health route touches.
 */
function makeDbStub(tableCount: number): D1Database {
  return {
    prepare() {
      return {
        async all() {
          return { results: [{ count: tableCount }] };
        },
      };
    },
  } as unknown as D1Database;
}

function makeEnv(tableCount: number): Bindings {
  return {
    DB: makeDbStub(tableCount),
    ASSETS: {} as Fetcher,
    // Bypass Access verification in tests.
    DEV_BYPASS_ACCESS: "true",
    ACCESS_TEAM_DOMAIN: "test.cloudflareaccess.com",
    ACCESS_AUD: "test-aud",
    ALLOWED_EMAILS: "husband@example.com,wife@example.com",
  };
}

describe("GET /api/health", () => {
  it("returns ok with the table count from D1", async () => {
    const res = await app.request("/api/health", {}, makeEnv(6));
    expect(res.status).toBe(200);
    const body = (await res.json()) as HealthResponse;
    expect(body).toEqual({ status: "ok", tables: 6 });
  });

  it("rejects requests when Access is enforced and no JWT is present", async () => {
    const env = makeEnv(6);
    env.DEV_BYPASS_ACCESS = "false";
    const res = await app.request("/api/health", {}, env);
    expect(res.status).toBe(401);
  });
});
