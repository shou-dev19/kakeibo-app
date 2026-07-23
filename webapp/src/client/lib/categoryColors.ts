/** A qualitative palette that reads well on white. */
export const CATEGORY_COLORS = [
  "#0d9488",
  "#f59e0b",
  "#3b82f6",
  "#ef4444",
  "#8b5cf6",
  "#10b981",
  "#ec4899",
  "#6366f1",
  "#f97316",
  "#14b8a6",
  "#84cc16",
  "#a855f7",
] as const;

/** A neutral color for categories that have not been assigned. */
export const UNCATEGORIZED_CATEGORY_COLOR = "#6b7280";

const FNV_OFFSET_BASIS_32 = 0x811c9dc5;
const FNV_PRIME_32 = 0x01000193;

/**
 * Returns a stable palette color based only on a category's trimmed UTF-8 name.
 */
export function getCategoryColor(category: string | null | undefined): string {
  const normalizedCategory = category?.trim();
  if (!normalizedCategory || normalizedCategory === "未分類") {
    return UNCATEGORIZED_CATEGORY_COLOR;
  }

  let hash = FNV_OFFSET_BASIS_32;
  for (const byte of new TextEncoder().encode(normalizedCategory)) {
    hash ^= byte;
    hash = Math.imul(hash, FNV_PRIME_32);
  }

  return CATEGORY_COLORS[(hash >>> 0) % CATEGORY_COLORS.length];
}
