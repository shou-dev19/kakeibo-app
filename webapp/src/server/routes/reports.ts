import { Hono } from "hono";
import type { AppEnv } from "../types";
import {
  getAllTransactions,
  getExcludedByScope,
  getSecurities,
  getTransactionsForMonth,
} from "../services/repository";
import {
  buildAnnualReport,
  buildAssetSeries,
  buildMonthlyReport,
  buildPortfolio,
} from "../../shared/reports";

const reports = new Hono<AppEnv>();

function intParam(v: string | undefined): number | undefined {
  if (v == null || v === "") return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

/**
 * GET /api/reports/monthly?year=&month=
 * Monthly income/expense summary + per-category expense breakdown.
 */
reports.get("/monthly", async (c) => {
  const year = intParam(c.req.query("year"));
  const month = intParam(c.req.query("month"));
  if (year == null || month == null || month < 1 || month > 12) {
    return c.json({ error: "year and month (1-12) are required" }, 400);
  }

  const [txs, balanceExcluded] = await Promise.all([
    getTransactionsForMonth(c.env.DB, year, month),
    getExcludedByScope(c.env.DB, "balance"),
  ]);
  const report = buildMonthlyReport(txs, year, month, balanceExcluded);
  return c.json(report);
});

/**
 * GET /api/reports/annual?year=&month=
 * Trailing 12-month summary. Reference month defaults to the current month
 * (server time) when year/month are omitted.
 */
reports.get("/annual", async (c) => {
  let year = intParam(c.req.query("year"));
  let month = intParam(c.req.query("month"));
  if (year == null || month == null) {
    const now = new Date();
    year = now.getUTCFullYear();
    month = now.getUTCMonth() + 1;
  }
  if (month < 1 || month > 12) {
    return c.json({ error: "month must be 1-12" }, 400);
  }

  const [txs, balanceExcluded, annualExcluded] = await Promise.all([
    getAllTransactions(c.env.DB),
    getExcludedByScope(c.env.DB, "balance"),
    getExcludedByScope(c.env.DB, "annual"),
  ]);
  const report = buildAnnualReport(txs, year, month, balanceExcluded, annualExcluded);
  return c.json(report);
});

/**
 * GET /api/reports/assets
 * Daily total-asset series + current portfolio snapshot.
 */
reports.get("/assets", async (c) => {
  const [txs, securities] = await Promise.all([
    getAllTransactions(c.env.DB),
    getSecurities(c.env.DB),
  ]);
  const series = buildAssetSeries(txs, securities);
  const portfolio = buildPortfolio(txs, securities);
  return c.json({ series, portfolio });
});

export default reports;
