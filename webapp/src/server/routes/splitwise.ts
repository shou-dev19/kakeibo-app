import { Hono } from "hono";
import type { AppEnv } from "../types";
import { getSplitRules, getTransactionsForMonth } from "../services/repository";
import { calculateSplitwise } from "../../shared/splitwise";

const splitwise = new Hono<AppEnv>();

function intParam(v: string | undefined): number | undefined {
  if (v == null || v === "") return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

/**
 * GET /api/splitwise?year=&month=
 * Split-payment calculation for the month: total billed, per-rate subtotals,
 * and matched line items with their applied rate.
 */
splitwise.get("/", async (c) => {
  const year = intParam(c.req.query("year"));
  const month = intParam(c.req.query("month"));
  if (year == null || month == null || month < 1 || month > 12) {
    return c.json({ error: "year and month (1-12) are required" }, 400);
  }

  const [txs, rules] = await Promise.all([
    getTransactionsForMonth(c.env.DB, year, month),
    getSplitRules(c.env.DB),
  ]);
  const result = calculateSplitwise(txs, rules, year, month);
  return c.json(result);
});

export default splitwise;
