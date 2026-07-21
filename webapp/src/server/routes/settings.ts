import { Hono } from "hono";
import type { AppEnv } from "../types";
import type {
  ExclusionScope,
  SplitMatchType,
} from "../../shared/types";
import { parseCsvRows } from "../../shared/csv";
import {
  deleteCategoryRule,
  deleteCsvFormat,
  deleteExcludedCategory,
  deleteSplitRule,
  getCategoryRules,
  getCsvFormats,
  getExcludedCategories,
  getSplitRules,
  insertCategoryRule,
  insertCsvFormat,
  insertExcludedCategory,
  insertSplitRule,
  updateCategoryRule,
  updateCsvFormat,
  updateSplitRule,
} from "../services/repository";

const settings = new Hono<AppEnv>();

function intParam(v: string | undefined): number | undefined {
  if (v == null || v === "") return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

function toNullableInt(v: unknown): number | null {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : null;
}

function toNullableString(v: unknown): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  return s === "" ? null : s;
}

// --- category-rules --------------------------------------------------------

settings.get("/category-rules", async (c) => {
  const items = await getCategoryRules(c.env.DB);
  return c.json({ items });
});

settings.post("/category-rules", async (c) => {
  const body = await c.req.json<Record<string, unknown>>().catch(() => null);
  if (!body || typeof body.keyword !== "string" || body.keyword.trim() === "") {
    return c.json({ error: "keyword is required" }, 400);
  }
  if (typeof body.category !== "string" || body.category.trim() === "") {
    return c.json({ error: "category is required" }, 400);
  }
  const id = await insertCategoryRule(c.env.DB, {
    keyword: body.keyword.trim(),
    institution: toNullableString(body.institution),
    category: body.category.trim(),
    priority: toNullableInt(body.priority) ?? 100,
  });
  return c.json({ id }, 201);
});

settings.patch("/category-rules/:id", async (c) => {
  const id = intParam(c.req.param("id"));
  if (id == null) return c.json({ error: "invalid id" }, 400);
  const body = await c.req.json<Record<string, unknown>>().catch(() => null);
  if (!body || typeof body.keyword !== "string" || typeof body.category !== "string") {
    return c.json({ error: "keyword and category are required" }, 400);
  }
  await updateCategoryRule(c.env.DB, id, {
    keyword: body.keyword.trim(),
    institution: toNullableString(body.institution),
    category: body.category.trim(),
    priority: toNullableInt(body.priority) ?? 100,
  });
  return c.json({ ok: true });
});

settings.delete("/category-rules/:id", async (c) => {
  const id = intParam(c.req.param("id"));
  if (id == null) return c.json({ error: "invalid id" }, 400);
  await deleteCategoryRule(c.env.DB, id);
  return c.json({ ok: true });
});

// --- csv-formats -----------------------------------------------------------

function parseCsvFormatBody(body: Record<string, unknown>) {
  const dateCol = toNullableInt(body.date_col);
  const descCol = toNullableInt(body.desc_col);
  const expectedColumns = toNullableInt(body.expected_columns);
  const headerRows = toNullableInt(body.header_rows) ?? 1;
  const headerSignature = toNullableString(body.header_signature);
  if (typeof body.name !== "string" || body.name.trim() === "") return null;
  if (dateCol == null || descCol == null) return null;
  if (!Number.isInteger(Number(body.expected_columns))) return null;
  if (!Number.isInteger(Number(body.header_rows ?? 1))) return null;
  if (expectedColumns == null || expectedColumns < 1 || headerRows < 0) return null;
  if (headerSignature != null) {
    if (headerRows < 1 || parseCsvRows(headerSignature).length !== 1) return null;
  }
  return {
    name: body.name.trim(),
    date_col: dateCol,
    desc_col: descCol,
    expense_col: toNullableInt(body.expense_col),
    income_col: toNullableInt(body.income_col),
    balance_col: toNullableInt(body.balance_col),
    header_rows: headerRows,
    encoding: typeof body.encoding === "string" && body.encoding.trim() !== ""
      ? body.encoding.trim()
      : "UTF-8",
    header_signature: headerSignature,
    expected_columns: expectedColumns,
  };
}

settings.get("/csv-formats", async (c) => {
  const items = await getCsvFormats(c.env.DB);
  return c.json({ items });
});

settings.post("/csv-formats", async (c) => {
  const body = await c.req.json<Record<string, unknown>>().catch(() => null);
  const f = body ? parseCsvFormatBody(body) : null;
  if (!f) return c.json({ error: "CSVフォーマットの設定値が不正です" }, 400);
  const id = await insertCsvFormat(c.env.DB, f);
  return c.json({ id }, 201);
});

settings.patch("/csv-formats/:id", async (c) => {
  const id = intParam(c.req.param("id"));
  if (id == null) return c.json({ error: "invalid id" }, 400);
  const body = await c.req.json<Record<string, unknown>>().catch(() => null);
  const f = body ? parseCsvFormatBody(body) : null;
  if (!f) return c.json({ error: "CSVフォーマットの設定値が不正です" }, 400);
  await updateCsvFormat(c.env.DB, id, f);
  return c.json({ ok: true });
});

settings.delete("/csv-formats/:id", async (c) => {
  const id = intParam(c.req.param("id"));
  if (id == null) return c.json({ error: "invalid id" }, 400);
  await deleteCsvFormat(c.env.DB, id);
  return c.json({ ok: true });
});

// --- split-rules -----------------------------------------------------------

function isSplitMatchType(v: unknown): v is SplitMatchType {
  return v === "keyword" || v === "institution";
}

settings.get("/split-rules", async (c) => {
  const items = await getSplitRules(c.env.DB);
  return c.json({ items });
});

settings.post("/split-rules", async (c) => {
  const body = await c.req.json<Record<string, unknown>>().catch(() => null);
  if (!body || !isSplitMatchType(body.match_type)) {
    return c.json({ error: "match_type must be 'keyword' or 'institution'" }, 400);
  }
  if (typeof body.pattern !== "string" || body.pattern.trim() === "") {
    return c.json({ error: "pattern is required" }, 400);
  }
  const rate = toNullableInt(body.rate);
  if (rate == null) return c.json({ error: "rate is required" }, 400);
  const id = await insertSplitRule(c.env.DB, {
    match_type: body.match_type,
    pattern: body.pattern.trim(),
    rate,
  });
  return c.json({ id }, 201);
});

settings.patch("/split-rules/:id", async (c) => {
  const id = intParam(c.req.param("id"));
  if (id == null) return c.json({ error: "invalid id" }, 400);
  const body = await c.req.json<Record<string, unknown>>().catch(() => null);
  if (!body || !isSplitMatchType(body.match_type)) {
    return c.json({ error: "match_type must be 'keyword' or 'institution'" }, 400);
  }
  if (typeof body.pattern !== "string" || body.pattern.trim() === "") {
    return c.json({ error: "pattern is required" }, 400);
  }
  const rate = toNullableInt(body.rate);
  if (rate == null) return c.json({ error: "rate is required" }, 400);
  await updateSplitRule(c.env.DB, id, {
    match_type: body.match_type,
    pattern: body.pattern.trim(),
    rate,
  });
  return c.json({ ok: true });
});

settings.delete("/split-rules/:id", async (c) => {
  const id = intParam(c.req.param("id"));
  if (id == null) return c.json({ error: "invalid id" }, 400);
  await deleteSplitRule(c.env.DB, id);
  return c.json({ ok: true });
});

// --- excluded-categories ---------------------------------------------------

function isScope(v: unknown): v is ExclusionScope {
  return v === "balance" || v === "annual";
}

settings.get("/excluded-categories", async (c) => {
  const items = await getExcludedCategories(c.env.DB);
  return c.json({ items });
});

settings.post("/excluded-categories", async (c) => {
  const body = await c.req.json<Record<string, unknown>>().catch(() => null);
  if (!body || typeof body.category !== "string" || body.category.trim() === "") {
    return c.json({ error: "category is required" }, 400);
  }
  if (!isScope(body.scope)) {
    return c.json({ error: "scope must be 'balance' or 'annual'" }, 400);
  }
  const id = await insertExcludedCategory(c.env.DB, body.category.trim(), body.scope);
  return c.json({ id }, 201);
});

settings.delete("/excluded-categories/:id", async (c) => {
  const id = intParam(c.req.param("id"));
  if (id == null) return c.json({ error: "invalid id" }, 400);
  await deleteExcludedCategory(c.env.DB, id);
  return c.json({ ok: true });
});

export default settings;
