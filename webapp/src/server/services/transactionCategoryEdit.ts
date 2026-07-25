import type { CategoryRule, Transaction } from "../../shared/types";
import {
  UNCATEGORIZED,
  categorizeOne,
  matchesCategoryRule,
  sortRules,
} from "../../shared/categorize";
import {
  countTransactionsMatchingCategoryRule,
  getCategories,
  getCategoryRules,
  getTransactionById,
} from "./repository";

export interface CategoryRuleInput {
  category: string;
  keyword: string;
  institution: string | null;
}

export interface CategoryRulePreview {
  matchCount: number;
  currentRule: CategoryRule | null;
  conflictingRules: CategoryRule[];
  reusableRuleId: number | null;
  priority: number;
}

export type CategoryChange =
  | ({ mode: "rule" } & CategoryRuleInput)
  | { mode: "fixed"; category: string }
  | { mode: "unlock" };

export interface TransactionEditInput {
  memo?: string | null;
  categoryChange?: CategoryChange;
}

export class TransactionEditError extends Error {
  constructor(
    message: string,
    readonly status: 400 | 404 = 400,
  ) {
    super(message);
    this.name = "TransactionEditError";
  }
}

function normalizeRuleInput(input: CategoryRuleInput): CategoryRuleInput {
  return {
    category: input.category.trim(),
    keyword: input.keyword.trim(),
    institution: input.institution?.trim() || null,
  };
}

async function requireTransaction(
  db: D1Database,
  id: number,
): Promise<Transaction> {
  const tx = await getTransactionById(db, id);
  if (!tx) throw new TransactionEditError("取引が見つかりません", 404);
  return tx;
}

async function validateCategory(
  db: D1Database,
  category: string,
): Promise<void> {
  if (
    !category ||
    (category !== UNCATEGORIZED &&
      !(await getCategories(db)).includes(category))
  ) {
    throw new TransactionEditError("選択できないカテゴリです");
  }
}

export async function previewTransactionCategoryRule(
  db: D1Database,
  id: number,
  rawInput: CategoryRuleInput,
): Promise<CategoryRulePreview> {
  const input = normalizeRuleInput(rawInput);
  const [tx, rules] = await Promise.all([
    requireTransaction(db, id),
    getCategoryRules(db),
  ]);
  await validateCategory(db, input.category);

  if (!input.keyword) {
    throw new TransactionEditError("適用キーワードを入力してください");
  }
  if (!tx.description.includes(input.keyword)) {
    throw new TransactionEditError(
      "適用キーワードはこの取引の説明に含まれる文字列を指定してください",
    );
  }
  if (input.institution != null && input.institution !== tx.institution) {
    throw new TransactionEditError("金融機関がこの取引と一致しません");
  }

  const matchingRules = sortRules(rules).filter((rule) =>
    matchesCategoryRule(tx, rule),
  );
  const currentRule = matchingRules[0] ?? null;
  const reusableRule =
    rules.find(
      (rule) =>
        rule.keyword === input.keyword &&
        (rule.institution || null) === input.institution &&
        rule.category === input.category &&
        currentRule?.id === rule.id,
    ) ?? null;
  const priority =
    matchingRules.length > 0
      ? Math.min(...matchingRules.map((rule) => rule.priority)) - 1
      : 100;
  const matchCount = await countTransactionsMatchingCategoryRule(
    db,
    input.keyword,
    input.institution,
  );

  return {
    matchCount,
    currentRule,
    conflictingRules: matchingRules.filter(
      (rule) => rule.id !== reusableRule?.id,
    ),
    reusableRuleId: reusableRule?.id ?? null,
    priority,
  };
}

function transactionUpdateStatement(
  db: D1Database,
  id: number,
  fields: {
    category?: string;
    categoryLocked?: 0 | 1;
    memo?: string | null;
  },
): D1PreparedStatement {
  const sets: string[] = [];
  const binds: unknown[] = [];
  if (fields.category !== undefined) {
    sets.push("category = ?");
    binds.push(fields.category);
  }
  if (fields.categoryLocked !== undefined) {
    sets.push("category_locked = ?");
    binds.push(fields.categoryLocked);
  }
  if (Object.prototype.hasOwnProperty.call(fields, "memo")) {
    sets.push("memo = ?");
    binds.push(fields.memo ?? null);
  }
  return db
    .prepare(`UPDATE transactions SET ${sets.join(", ")} WHERE id = ?`)
    .bind(...binds, id);
}

export async function saveTransactionEdit(
  db: D1Database,
  id: number,
  input: TransactionEditInput,
): Promise<void> {
  const tx = await requireTransaction(db, id);
  const change = input.categoryChange;

  if (!change) {
    if (!Object.prototype.hasOwnProperty.call(input, "memo")) {
      throw new TransactionEditError("更新する項目がありません");
    }
    await transactionUpdateStatement(db, id, { memo: input.memo }).run();
    return;
  }

  if (change.mode === "fixed") {
    const category = change.category.trim();
    await validateCategory(db, category);
    await transactionUpdateStatement(db, id, {
      category,
      categoryLocked: 1,
      ...(Object.prototype.hasOwnProperty.call(input, "memo")
        ? { memo: input.memo }
        : {}),
    }).run();
    return;
  }

  if (change.mode === "unlock") {
    const rules = await getCategoryRules(db);
    const category = categorizeOne(tx, sortRules(rules));
    await transactionUpdateStatement(db, id, {
      category,
      categoryLocked: 0,
      ...(Object.prototype.hasOwnProperty.call(input, "memo")
        ? { memo: input.memo }
        : {}),
    }).run();
    return;
  }

  const normalized = normalizeRuleInput(change);
  const preview = await previewTransactionCategoryRule(db, id, normalized);
  const statements: D1PreparedStatement[] = [];
  if (preview.reusableRuleId == null) {
    statements.push(
      db
        .prepare(
          "INSERT INTO category_rules (keyword, institution, category, priority) VALUES (?, ?, ?, ?)",
        )
        .bind(
          normalized.keyword,
          normalized.institution,
          normalized.category,
          preview.priority,
        ),
    );
  }
  statements.push(
    transactionUpdateStatement(db, id, {
      category: normalized.category,
      categoryLocked: 0,
      ...(Object.prototype.hasOwnProperty.call(input, "memo")
        ? { memo: input.memo }
        : {}),
    }),
  );
  await db.batch(statements);
}
