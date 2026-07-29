// Typed API client. All calls go through `request()` which throws a localized
// Error (Japanese) on non-2xx so callers can surface it via toast/inline.
//
// Response shapes are mirrored from the server (routes + services). We do NOT
// import server modules here because those pull in Workers-only types; instead
// we re-declare the client-facing contract and share the DB row types from
// src/shared/types.ts.

import type {
  CategoryRule,
  CsvFormat,
  ExcludedCategory,
  ExclusionScope,
  MeResponse,
  Owner,
  OwnerScope,
  RecategorizeRun,
  SecuritiesBalance,
  SplitMatchType,
  SplitRule,
  Transaction,
} from "../../shared/types";

export type {
  CategoryRule,
  CsvFormat,
  ExcludedCategory,
  ExclusionScope,
  MeResponse,
  Owner,
  OwnerScope,
  RecategorizeRun,
  SecuritiesBalance,
  SplitMatchType,
  SplitRule,
  Transaction,
};

// --- Transactions ----------------------------------------------------------

export type TransactionListItem = Omit<Transaction, "category_locked"> & {
  categoryLocked: boolean;
  splitRate: number | null;
};

/** 分類ルールの入力値。owner はサーバがログインから決めるので送らない。 */
export type CategoryRuleInput = Omit<CategoryRule, "id" | "owner">;

export interface CategoryRulePreview {
  matchCount: number;
  currentRule: CategoryRule | null;
  conflictingRules: CategoryRule[];
  reusableRuleId: number | null;
  priority: number;
}

export type CategoryChange =
  | {
      mode: "rule";
      category: string;
      keyword: string;
      institution: string | null;
    }
  | { mode: "fixed"; category: string }
  | { mode: "unlock" };

export interface TransactionPage {
  items: TransactionListItem[];
  total: number;
  limit: number;
  offset: number;
}

export interface TransactionFilterQuery {
  /** 読み取りスコープ。省略時は 'all' (夫婦合算)。 */
  owner?: OwnerScope;
  year?: number;
  month?: number;
  category?: string;
  institution?: string;
  keyword?: string;
  limit?: number;
  offset?: number;
}

// --- Reports ---------------------------------------------------------------

export interface MonthlyCategoryBreakdown {
  category: string;
  amount: number;
}

export interface MonthlyReport {
  year: number;
  month: number;
  totalIncome: number;
  totalExpense: number;
  balance: number;
  categoryBreakdown: MonthlyCategoryBreakdown[];
}

export interface AnnualMonthlyRow {
  month: string; // 'YYYY/MM' or '合計'
  income: number;
  expense: number;
  surplus: number;
  investment: number;
  afterInvestment: number;
}

export interface AnnualCategoryRow {
  category: string;
  monthly: number[];
  average: number;
  total: number;
}

export interface AnnualReport {
  months: string[];
  monthlySummaries: AnnualMonthlyRow[];
  totals: AnnualMonthlyRow;
  categoryTable: AnnualCategoryRow[];
}

export interface AssetPoint {
  date: string;
  total: number;
}

export interface PortfolioSlice {
  label: string;
  value: number;
}

export interface PortfolioOwnerRow {
  owner: Owner;
  bankTotal: number;
  securitiesTotal: number;
  total: number;
}

export interface PortfolioReport {
  bankTotal: number;
  securitiesTotal: number;
  total: number;
  slices: PortfolioSlice[];
  byOwner: PortfolioOwnerRow[];
}

export interface AssetsResponse {
  series: AssetPoint[];
  portfolio: PortfolioReport;
}

// --- Splitwise -------------------------------------------------------------

export interface SplitwiseLineItem {
  id?: number;
  owner: Owner;
  date: string;
  description: string;
  amount: number;
  type: string;
  institution: string | null;
  category: string | null;
  /** 妻の負担率 (%). 支払者が誰かによらず解釈は変わらない。 */
  rate: number;
  /** 表示用の1行あたり妻負担額 (四捨五入済み)。合計には使わない。 */
  wifeShare: number;
}

export interface SplitwiseRateSubtotal {
  rate: number;
  amount: number;
  wifeShare: number;
  husbandShare: number;
  count: number;
}

export interface SplitwiseResult {
  year: number;
  month: number;
  /** 割り勘対象の総額。 */
  totalAmount: number;
  /** 妻負担額。 */
  wifeShare: number;
  /** 夫負担額 (= totalAmount - wifeShare)。 */
  husbandShare: number;
  husbandPaid: number;
  wifePaid: number;
  /** 精算額。正なら妻→夫、負なら夫→妻。 */
  settlement: number;
  subtotals: SplitwiseRateSubtotal[];
  items: SplitwiseLineItem[];
}

// --- Imports ---------------------------------------------------------------

export interface ImportPreviewFile {
  filename: string;
  detectedFormat: string | null;
  detectionConfident: boolean;
  count: number;
  dateFrom: string | null;
  dateTo: string | null;
  duplicateCount: number;
  error: string | null;
}

export interface ImportResultFile {
  filename: string;
  format: string | null;
  imported: number;
  duplicateSkipped: number;
  error: string | null;
}

export interface ImportFilePayload {
  filename: string;
  contentBase64: string;
  formatName?: string;
}

// --- Misc ------------------------------------------------------------------

export interface RecategorizeResult {
  updated: number;
  total: number;
  skippedLocked: number;
  runId: number | null;
}

export interface RecategorizeSummaryRow {
  from: string;
  to: string;
  count: number;
}

export interface RecategorizeSampleRow {
  id: number;
  date: string;
  description: string;
  from: string;
  to: string;
}

export interface RecategorizePreview {
  owner: Owner;
  total: number;
  skippedLocked: number;
  changeCount: number;
  summary: RecategorizeSummaryRow[];
  samples: RecategorizeSampleRow[];
}

export interface RecategorizeUndoResult {
  runId: number;
  reverted: number;
  skippedModified: number;
}

// ---------------------------------------------------------------------------
// Core request helper
// ---------------------------------------------------------------------------

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

async function request<T>(
  path: string,
  init?: RequestInit & { query?: Record<string, string | number | undefined> },
): Promise<T> {
  const { query, ...rest } = init ?? {};
  let url = path;
  if (query) {
    const usp = new URLSearchParams();
    for (const [k, v] of Object.entries(query)) {
      if (v != null && v !== "") usp.set(k, String(v));
    }
    const qs = usp.toString();
    if (qs) url += `?${qs}`;
  }

  let res: Response;
  try {
    res = await fetch(url, {
      ...rest,
      headers: {
        ...(rest.body ? { "Content-Type": "application/json" } : {}),
        ...(rest.headers ?? {}),
      },
    });
  } catch {
    throw new ApiError("通信に失敗しました。接続を確認してください。", 0);
  }

  if (!res.ok) {
    let message = `エラーが発生しました (${res.status})`;
    try {
      const body = (await res.json()) as { error?: string };
      if (body?.error) message = body.error;
    } catch {
      // ignore body parse failure; keep the generic message
    }
    throw new ApiError(message, res.status);
  }

  // 204 / empty body tolerance.
  const text = await res.text();
  return (text ? JSON.parse(text) : {}) as T;
}

function buildQuery(
  q: Record<string, string | number | undefined>,
): Record<string, string | number | undefined> {
  return q;
}

// ---------------------------------------------------------------------------
// Endpoint wrappers
// ---------------------------------------------------------------------------

export const api = {
  /** The logged-in user. Drives the owner labels and edit permissions. */
  getMe(): Promise<MeResponse> {
    return request("/api/me");
  },

  // Transactions
  getTransactions(filter: TransactionFilterQuery): Promise<TransactionPage> {
    return request<TransactionPage>("/api/transactions", {
      query: buildQuery({
        owner: filter.owner,
        year: filter.year,
        month: filter.month,
        category: filter.category,
        institution: filter.institution,
        keyword: filter.keyword,
        limit: filter.limit,
        offset: filter.offset,
      }),
    });
  },
  getTransactionInstitutions(
    year: number,
    month: number,
    owner?: OwnerScope,
  ): Promise<{ items: string[] }> {
    return request("/api/transactions/institutions", {
      query: { year, month, owner },
    });
  },
  updateTransaction(
    id: number,
    fields: {
      category?: string | null;
      memo?: string | null;
      categoryChange?: CategoryChange;
    },
  ): Promise<{ ok: true }> {
    return request(`/api/transactions/${id}`, {
      method: "PATCH",
      body: JSON.stringify(fields),
    });
  },
  previewTransactionCategoryRule(
    id: number,
    body: {
      category: string;
      keyword: string;
      institution: string | null;
    },
  ): Promise<CategoryRulePreview> {
    return request(`/api/transactions/${id}/category-rule-preview`, {
      method: "POST",
      body: JSON.stringify(body),
    });
  },
  deleteTransaction(id: number): Promise<{ ok: true }> {
    return request(`/api/transactions/${id}`, { method: "DELETE" });
  },
  // Bulk re-categorization. All three act on the logged-in user only — the
  // server derives the owner from the session, so there is nothing to pass.
  previewRecategorize(): Promise<RecategorizePreview> {
    return request("/api/transactions/recategorize/preview", { method: "POST" });
  },
  recategorizeAll(): Promise<RecategorizeResult> {
    return request("/api/transactions/recategorize", { method: "POST" });
  },
  undoRecategorize(): Promise<RecategorizeUndoResult> {
    return request("/api/transactions/recategorize/undo", { method: "POST" });
  },
  getLastRecategorizeRun(): Promise<{ run: RecategorizeRun | null }> {
    return request("/api/transactions/recategorize/last");
  },

  // Reports
  getMonthlyReport(
    year: number,
    month: number,
    owner?: OwnerScope,
  ): Promise<MonthlyReport> {
    return request("/api/reports/monthly", { query: { year, month, owner } });
  },
  getAnnualReport(
    year: number,
    month: number,
    owner?: OwnerScope,
  ): Promise<AnnualReport> {
    return request("/api/reports/annual", { query: { year, month, owner } });
  },
  getAssets(owner?: OwnerScope): Promise<AssetsResponse> {
    return request("/api/reports/assets", { query: { owner } });
  },

  // Splitwise
  getSplitwise(year: number, month: number): Promise<SplitwiseResult> {
    return request("/api/splitwise", { query: { year, month } });
  },

  // Securities
  getSecurities(owner?: OwnerScope): Promise<{ items: SecuritiesBalance[] }> {
    return request("/api/securities", { query: { owner } });
  },
  addSecurity(body: {
    date: string;
    brokerage: string;
    value: number;
  }): Promise<{ id: number }> {
    return request("/api/securities", {
      method: "POST",
      body: JSON.stringify(body),
    });
  },
  deleteSecurity(id: number): Promise<{ ok: true }> {
    return request(`/api/securities/${id}`, { method: "DELETE" });
  },

  // Imports
  previewImports(
    files: ImportFilePayload[],
  ): Promise<{ files: ImportPreviewFile[] }> {
    return request("/api/imports/preview", {
      method: "POST",
      body: JSON.stringify({ files }),
    });
  },
  runImports(files: ImportFilePayload[]): Promise<{ files: ImportResultFile[] }> {
    return request("/api/imports", {
      method: "POST",
      body: JSON.stringify({ files }),
    });
  },

  // Settings: categories
  getCategories(): Promise<{ items: string[] }> {
    return request("/api/settings/categories");
  },

  // Settings: category rules. Always scoped to the logged-in user by the
  // server, so `owner` is never part of the request payload.
  getCategoryRules(): Promise<{ items: CategoryRule[] }> {
    return request("/api/settings/category-rules");
  },
  addCategoryRule(body: CategoryRuleInput): Promise<{ id: number }> {
    return request("/api/settings/category-rules", {
      method: "POST",
      body: JSON.stringify(body),
    });
  },
  updateCategoryRule(
    id: number,
    body: CategoryRuleInput,
  ): Promise<{ ok: true }> {
    return request(`/api/settings/category-rules/${id}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    });
  },
  deleteCategoryRule(id: number): Promise<{ ok: true }> {
    return request(`/api/settings/category-rules/${id}`, { method: "DELETE" });
  },

  // Settings: csv formats
  getCsvFormats(): Promise<{ items: CsvFormat[] }> {
    return request("/api/settings/csv-formats");
  },
  addCsvFormat(body: Omit<CsvFormat, "id">): Promise<{ id: number }> {
    return request("/api/settings/csv-formats", {
      method: "POST",
      body: JSON.stringify(body),
    });
  },
  updateCsvFormat(id: number, body: Omit<CsvFormat, "id">): Promise<{ ok: true }> {
    return request(`/api/settings/csv-formats/${id}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    });
  },
  deleteCsvFormat(id: number): Promise<{ ok: true }> {
    return request(`/api/settings/csv-formats/${id}`, { method: "DELETE" });
  },

  // Settings: split rules
  getSplitRules(): Promise<{ items: SplitRule[] }> {
    return request("/api/settings/split-rules");
  },
  addSplitRule(body: Omit<SplitRule, "id">): Promise<{ id: number }> {
    return request("/api/settings/split-rules", {
      method: "POST",
      body: JSON.stringify(body),
    });
  },
  updateSplitRule(id: number, body: Omit<SplitRule, "id">): Promise<{ ok: true }> {
    return request(`/api/settings/split-rules/${id}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    });
  },
  deleteSplitRule(id: number): Promise<{ ok: true }> {
    return request(`/api/settings/split-rules/${id}`, { method: "DELETE" });
  },

  // Settings: excluded categories
  getExcludedCategories(): Promise<{ items: ExcludedCategory[] }> {
    return request("/api/settings/excluded-categories");
  },
  addExcludedCategory(body: {
    category: string;
    scope: ExclusionScope;
  }): Promise<{ id: number }> {
    return request("/api/settings/excluded-categories", {
      method: "POST",
      body: JSON.stringify(body),
    });
  },
  deleteExcludedCategory(id: number): Promise<{ ok: true }> {
    return request(`/api/settings/excluded-categories/${id}`, {
      method: "DELETE",
    });
  },
};
