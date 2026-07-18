import { Hono } from "hono";
import type { AppEnv } from "./types";
import { accessAuth } from "./middleware/access";
import type { HealthResponse } from "../shared/types";

const app = new Hono<AppEnv>();

const api = new Hono<AppEnv>();

// Protect all API routes behind Access JWT verification.
api.use("*", accessAuth);

/**
 * GET /api/health
 * Connects to D1 and reports the number of user tables. Used as a smoke test.
 */
api.get("/health", async (c) => {
  const { results } = await c.env.DB.prepare(
    "SELECT COUNT(*) AS count FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' AND name != 'd1_migrations'",
  ).all<{ count: number }>();

  const tables = results[0]?.count ?? 0;
  const body: HealthResponse = { status: "ok", tables };
  return c.json(body);
});

app.route("/api", api);

export default app;
