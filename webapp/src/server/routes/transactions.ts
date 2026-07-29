import { Hono } from "hono";
import type { AppEnv } from "../types";
import {
  deleteTransaction,
  getSplitRules,
  getTransactionInstitutionsForMonth,
  listTransactions,
  updateTransactionFields,
  type TransactionFilter,
} from "../services/repository";
import { matchEligibleSplitRule, sortSplitRules } from "../../shared/splitwise";
import {
  getLastRecategorizeRun,
  previewRecategorize,
  recategorizeAll,
  RecategorizeUndoError,
  undoLastRecategorize,
} from "../services/recategorize";
import { parseOwnerScope, requireOwner } from "../services/owner";
import {
  previewTransactionCategoryRule,
  saveTransactionEdit,
  TransactionEditError,
  type CategoryChange,
} from "../services/transactionCategoryEdit";

const transactions = new Hono<AppEnv>();

function intParam(v: string | undefined): number | undefined {
  if (v == null || v === "") return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

/**
 * GET /api/transactions
 * Query: owner, year, month, category, institution, keyword, limit, offset
 * `owner` is a read scope ('husband' | 'wife' | 'all', default 'all').
 * Returns a paginated list with total count.
 */
transactions.get("/", async (c) => {
  const q = c.req.query();
  const scope = parseOwnerScope(q.owner);
  if (scope == null) return c.json({ error: "invalid owner" }, 400);
  const filter: TransactionFilter = {
    owner: scope,
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
    items: page.items.map((tx) => {
      const { category_locked, ...item } = tx;
      return {
        ...item,
        categoryLocked: category_locked === 1,
        splitRate: matchEligibleSplitRule(tx, sortedRules)?.rate ?? null,
      };
    }),
  });
});

/**
 * GET /api/transactions/institutions?year=&month=&owner=
 * Returns every institution that has a transaction in the specified month,
 * within the requested read scope.
 */
transactions.get("/institutions", async (c) => {
  const year = intParam(c.req.query("year"));
  const month = intParam(c.req.query("month"));
  if (
    year == null ||
    month == null ||
    !Number.isInteger(year) ||
    !Number.isInteger(month) ||
    year < 1 ||
    month < 1 ||
    month > 12
  ) {
    return c.json({ error: "year and month (1-12) are required" }, 400);
  }
  const scope = parseOwnerScope(c.req.query("owner"));
  if (scope == null) return c.json({ error: "invalid owner" }, 400);
  const items = await getTransactionInstitutionsForMonth(
    c.env.DB,
    year,
    month,
    scope,
  );
  return c.json({ items });
});

// --- Bulk re-categorization -------------------------------------------------
//
// All three endpoints derive the owner from the login. Accepting it from the
// request would defeat the whole point: re-categorizing must never be able to
// touch the other user's transactions.
// (Declared before the parameterized routes so they are not shadowed.)

/**
 * POST /api/transactions/recategorize/preview
 * Dry run — reports what would change without writing anything.
 */
transactions.post("/recategorize/preview", async (c) => {
  const result = await previewRecategorize(c.env.DB, requireOwner(c));
  return c.json(result);
});

/**
 * POST /api/transactions/recategorize/undo
 * Reverts the caller's most recent run.
 */
transactions.post("/recategorize/undo", async (c) => {
  try {
    const result = await undoLastRecategorize(c.env.DB, requireOwner(c));
    return c.json(result);
  } catch (error) {
    if (error instanceof RecategorizeUndoError) {
      return c.json({ error: error.message }, error.status);
    }
    throw error;
  }
});

/**
 * GET /api/transactions/recategorize/last
 * The caller's most recent run, for the "取り消す" affordance.
 */
transactions.get("/recategorize/last", async (c) => {
  const run = await getLastRecategorizeRun(c.env.DB, requireOwner(c));
  return c.json({ run });
});

/**
 * POST /api/transactions/recategorize
 * Re-applies the caller's category rules to the caller's transactions.
 */
transactions.post("/recategorize", async (c) => {
  const result = await recategorizeAll(c.env.DB, requireOwner(c));
  return c.json(result);
});

/** Covers both "someone else's row" and "no such row" — we don't leak which. */
const NOT_EDITABLE = "この明細は編集できません";

interface PatchBody {
  category?: string | null;
  memo?: string | null;
  categoryChange?: CategoryChange;
}

function parseCategoryChange(value: unknown): CategoryChange | null {
  if (!value || typeof value !== "object") return null;
  const change = value as Record<string, unknown>;
  if (change.mode === "unlock") return { mode: "unlock" };
  if (change.mode === "fixed" && typeof change.category === "string") {
    return { mode: "fixed", category: change.category };
  }
  if (
    change.mode === "rule" &&
    typeof change.category === "string" &&
    typeof change.keyword === "string" &&
    (change.institution === null ||
      change.institution === undefined ||
      typeof change.institution === "string")
  ) {
    return {
      mode: "rule",
      category: change.category,
      keyword: change.keyword,
      institution:
        typeof change.institution === "string" ? change.institution : null,
    };
  }
  return null;
}

transactions.post("/:id/category-rule-preview", async (c) => {
  const id = intParam(c.req.param("id"));
  if (id == null) return c.json({ error: "invalid id" }, 400);
  const body = await c.req.json<Record<string, unknown>>().catch(() => null);
  if (
    !body ||
    typeof body.category !== "string" ||
    typeof body.keyword !== "string" ||
    !(
      body.institution === null ||
      body.institution === undefined ||
      typeof body.institution === "string"
    )
  ) {
    return c.json({ error: "カテゴリと適用キーワードを指定してください" }, 400);
  }
  try {
    const result = await previewTransactionCategoryRule(c.env.DB, id, requireOwner(c), {
      category: body.category,
      keyword: body.keyword,
      institution:
        typeof body.institution === "string" ? body.institution : null,
    });
    return c.json(result);
  } catch (error) {
    if (error instanceof TransactionEditError) {
      return c.json({ error: error.message }, error.status);
    }
    throw error;
  }
});

/**
 * PATCH /api/transactions/:id
 * Body: { category?, memo?, categoryChange? }.
 */
transactions.patch("/:id", async (c) => {
  const id = intParam(c.req.param("id"));
  if (id == null) return c.json({ error: "invalid id" }, 400);

  const body = await c.req.json<PatchBody>().catch(() => null);
  if (!body) return c.json({ error: "invalid body" }, 400);

  if (Object.prototype.hasOwnProperty.call(body, "categoryChange")) {
    const categoryChange = parseCategoryChange(body.categoryChange);
    if (!categoryChange) {
      return c.json({ error: "カテゴリ変更の指定が不正です" }, 400);
    }
    try {
      await saveTransactionEdit(c.env.DB, id, requireOwner(c), {
        ...(Object.prototype.hasOwnProperty.call(body, "memo")
          ? { memo: body.memo ?? null }
          : {}),
        categoryChange,
      });
      return c.json({ ok: true });
    } catch (error) {
      if (error instanceof TransactionEditError) {
        return c.json({ error: error.message }, error.status);
      }
      throw error;
    }
  }

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

  const updated = await updateTransactionFields(c.env.DB, id, requireOwner(c), fields);
  if (!updated) return c.json({ error: NOT_EDITABLE }, 403);
  return c.json({ ok: true });
});

/**
 * DELETE /api/transactions/:id
 * Only the transaction's own user may delete it (see transactionCategoryEdit).
 */
transactions.delete("/:id", async (c) => {
  const id = intParam(c.req.param("id"));
  if (id == null) return c.json({ error: "invalid id" }, 400);
  const deleted = await deleteTransaction(c.env.DB, id, requireOwner(c));
  if (!deleted) return c.json({ error: NOT_EDITABLE }, 403);
  return c.json({ ok: true });
});

export default transactions;
