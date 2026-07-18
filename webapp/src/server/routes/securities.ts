import { Hono } from "hono";
import type { AppEnv } from "../types";
import {
  deleteSecurity,
  getSecurities,
  insertSecurity,
} from "../services/repository";
import { normalizeDate } from "../../shared/dates";

const securities = new Hono<AppEnv>();

function intParam(v: string | undefined): number | undefined {
  if (v == null || v === "") return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

/** GET /api/securities — list all securities balance entries. */
securities.get("/", async (c) => {
  const items = await getSecurities(c.env.DB);
  return c.json({ items });
});

interface SecurityBody {
  date?: string;
  brokerage?: string;
  value?: number;
}

/**
 * POST /api/securities
 * Body: { date, brokerage, value }. `date` accepts YYYY-MM-DD, YYYY/MM/DD or
 * YYMMDD and is normalized to ISO. `value` is an integer (円).
 */
securities.post("/", async (c) => {
  const body = await c.req.json<SecurityBody>().catch(() => null);
  if (!body) return c.json({ error: "invalid body" }, 400);

  const date = normalizeDate(body.date);
  if (!date) return c.json({ error: "invalid date" }, 400);
  if (typeof body.brokerage !== "string" || body.brokerage.trim() === "") {
    return c.json({ error: "brokerage is required" }, 400);
  }
  if (typeof body.value !== "number" || !Number.isFinite(body.value)) {
    return c.json({ error: "value must be a number" }, 400);
  }

  const id = await insertSecurity(c.env.DB, {
    date,
    brokerage: body.brokerage.trim(),
    value: Math.round(body.value),
  });
  return c.json({ id }, 201);
});

/** DELETE /api/securities/:id */
securities.delete("/:id", async (c) => {
  const id = intParam(c.req.param("id"));
  if (id == null) return c.json({ error: "invalid id" }, 400);
  await deleteSecurity(c.env.DB, id);
  return c.json({ ok: true });
});

export default securities;
