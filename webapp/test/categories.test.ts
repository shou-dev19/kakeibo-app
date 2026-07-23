import { describe, expect, it } from "vitest";
import { getCategories } from "../src/server/services/repository";

describe("getCategories", () => {
  it("unions saved categories, filters blank values, orders them, and returns strings", async () => {
    let preparedSql = "";
    const db = {
      prepare(sql: string) {
        preparedSql = sql;
        return {
          async all<T>() {
            return {
              results: [{ category: "給与" }, { category: "食料品" }] as unknown as T[],
            };
          },
        };
      },
    } as unknown as D1Database;

    await expect(getCategories(db)).resolves.toEqual(["給与", "食料品"]);
    expect(preparedSql).toContain("SELECT category FROM category_rules");
    expect(preparedSql).toContain("SELECT category FROM transactions");
    expect(preparedSql).toContain("SELECT category FROM excluded_categories");
    expect(preparedSql).not.toMatch(/\bUNION\s+ALL\b/);
    expect(preparedSql.match(/\bUNION\b/g)).toHaveLength(2);
    expect(preparedSql).toMatch(/WHERE\s+category\s+IS\s+NOT\s+NULL/);
    expect(preparedSql).toMatch(/TRIM\(category\)\s*<>\s*''/);
    expect(preparedSql).toMatch(/ORDER\s+BY\s+category\s+ASC/);
  });
});
