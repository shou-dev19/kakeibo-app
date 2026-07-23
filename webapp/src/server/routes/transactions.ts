import { Hono } from "hono";
import type { AppEnv } from "../types";
import {
  deleteTransaction,
  getSplitRules,
  listTransactions,
  updateTransactionFields,
  type TransactionFilter,
} from "../services/repository";
import { matchEligibleSplitRule, sortSplitRules } from "../../shared/splitwise";
import { recategorizeAll } from "../services/recategorize";

const transactions = new Hono<AppEnv>();

function intParam(v: string | undefined): number | undefined {
  if (v == null || v === "") return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

/**
 * GET /api/transactions
 * Query: year, month, category, institution, keyword, limit, offset
 * Returns a paginated list with total count.
 */
transactions.get("/", async (c) => {
  const q = c.req.query();
  const filter: TransactionFilter = {
    year: intParam(q.year),
    month: intParam(q.month),
    category: q.category,
    institution: q.institution,
    keyword: q.keyword,
    limit: intParam(q.limit) ?? 100,
    offset: intParam(q.offset) ?? 0,
  };
  const [page, rules] = await Promise.all([
    listTransactions(c.env.DB, filter),
    getSplitRules(c.env.DB),
  ]);
  const sortedRules = sortSplitRules(rules);
  return c.json({
    ...page,
    items: page.items.map((tx) => ({
      ...tx,
      splitRate: matchEligibleSplitRule(tx, sortedRules)?.rate ?? null,
    })),
  });
});

/**
 * POST /api/transactions/recategorize
 * Re-applies the latest category rules to every stored transaction.
 * (Declared before the parameterized routes so it is not shadowed.)
 */
transactions.post("/recategorize", async (c) => {
  const result = await recategorizeAll(c.env.DB);
  return c.json(result);
});

interface PatchBody {
  category?: string | null;
  memo?: string | null;
}

/**
 * PATCH /api/transactions/:id
 * Body: { category?, memo? } — updates category and/or memo.
 */
transactions.patch("/:id", async (c) => {
  const id = intParam(c.req.param("id"));
  if (id == null) return c.json({ error: "invalid id" }, 400);

  const body = await c.req.json<PatchBody>().catch(() => null);
  if (!body) return c.json({ error: "invalid body" }, 400);

  const fields: PatchBody = {};
  if (Object.prototype.hasOwnProperty.call(body, "category")) {
    fields.category = body.category ?? null;
  }
  if (Object.prototype.hasOwnProperty.call(body, "memo")) {
    fields.memo = body.memo ?? null;
  }
  if (Object.keys(fields).length === 0) {
    return c.json({ error: "no updatable fields provided" }, 400);
  }

  await updateTransactionFields(c.env.DB, id, fields);
  return c.json({ ok: true });
});

/**
 * DELETE /api/transactions/:id
 */
transactions.delete("/:id", async (c) => {
  const id = intParam(c.req.param("id"));
  if (id == null) return c.json({ error: "invalid id" }, 400);
  await deleteTransaction(c.env.DB, id);
  return c.json({ ok: true });
});

export default transactions;
