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
  SecuritiesBalance,
  SplitMatchType,
  SplitRule,
  Transaction,
};

// --- Transactions ----------------------------------------------------------

export type TransactionListItem = Transaction & { splitRate: number | null };

export interface TransactionPage {
  items: TransactionListItem[];
  total: number;
  limit: number;
  offset: number;
}

export interface TransactionFilterQuery {
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

export interface PortfolioReport {
  bankTotal: number;
  securitiesTotal: number;
  total: number;
  slices: PortfolioSlice[];
}

export interface AssetsResponse {
  series: AssetPoint[];
  portfolio: PortfolioReport;
}

// --- Splitwise -------------------------------------------------------------

export interface SplitwiseLineItem {
  id?: number;
  date: string;
  description: string;
  amount: number;
  type: string;
  institution: string | null;
  category: string | null;
  rate: number;
  billed: number;
}

export interface SplitwiseRateSubtotal {
  rate: number;
  amount: number;
  billed: number;
  count: number;
}

export interface SplitwiseResult {
  year: number;
  month: number;
  totalBilled: number;
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
  // Transactions
  getTransactions(filter: TransactionFilterQuery): Promise<TransactionPage> {
    return request<TransactionPage>("/api/transactions", {
      query: buildQuery({
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
  updateTransaction(
    id: number,
    fields: { category?: string | null; memo?: string | null },
  ): Promise<{ ok: true }> {
    return request(`/api/transactions/${id}`, {
      method: "PATCH",
      body: JSON.stringify(fields),
    });
  },
  deleteTransaction(id: number): Promise<{ ok: true }> {
    return request(`/api/transactions/${id}`, { method: "DELETE" });
  },
  recategorizeAll(): Promise<RecategorizeResult> {
    return request("/api/transactions/recategorize", { method: "POST" });
  },

  // Reports
  getMonthlyReport(year: number, month: number): Promise<MonthlyReport> {
    return request("/api/reports/monthly", { query: { year, month } });
  },
  getAnnualReport(year: number, month: number): Promise<AnnualReport> {
    return request("/api/reports/annual", { query: { year, month } });
  },
  getAssets(): Promise<AssetsResponse> {
    return request("/api/reports/assets");
  },

  // Splitwise
  getSplitwise(year: number, month: number): Promise<SplitwiseResult> {
    return request("/api/splitwise", { query: { year, month } });
  },

  // Securities
  getSecurities(): Promise<{ items: SecuritiesBalance[] }> {
    return request("/api/securities");
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

  // Settings: category rules
  getCategoryRules(): Promise<{ items: CategoryRule[] }> {
    return request("/api/settings/category-rules");
  },
  addCategoryRule(body: Omit<CategoryRule, "id">): Promise<{ id: number }> {
    return request("/api/settings/category-rules", {
      method: "POST",
      body: JSON.stringify(body),
    });
  },
  updateCategoryRule(
    id: number,
    body: Omit<CategoryRule, "id">,
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
