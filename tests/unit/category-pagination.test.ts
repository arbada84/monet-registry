import { describe, expect, it } from "vitest";
import { categoryPageBounds, categoryPageHref, categoryPageResult, parseCategoryPage } from "@/lib/category-pagination";

describe("category pagination helpers", () => {
  it("defaults only absent pages and accepts bounded integers", () => {
    expect(parseCategoryPage(undefined)).toBe(1);
    expect(parseCategoryPage("1")).toBe(1);
    expect(parseCategoryPage("10000")).toBe(10000);
  });
  it.each(["", "0", "-1", "01", "1.5", "1e2", " 2", "2x", "10001", "999999999999999999", ["1", "2"]])("rejects invalid page %s", (page) => {
    expect(parseCategoryPage(page)).toBeNull();
  });
  it("bounds the query and encodes canonical links", () => {
    expect(categoryPageBounds(1)).toEqual({ limit: 21, offset: 0 });
    expect(categoryPageBounds(10000)).toEqual({ limit: 21, offset: 199980 });
    for (const page of [0, -1, 1.5, Infinity, NaN, 10001]) expect(() => categoryPageBounds(page)).toThrow();
    expect(categoryPageHref("문화 & 예술", 1)).toBe(`/category/${encodeURIComponent("문화 & 예술")}`);
    expect(categoryPageHref("news", 2)).toBe("/category/news?page=2");
  });
  it("uses only a sentinel, never an invented total", () => {
    const rows = Array.from({ length: 21 }, (_, id) => ({ id }));
    const result = categoryPageResult(rows, 2);
    expect(result.articles).toHaveLength(20);
    expect(result.hasNext).toBe(true);
    expect(result).not.toHaveProperty("total");
    expect(categoryPageResult(rows.slice(0, 20), 2).hasNext).toBe(false);
    expect(categoryPageResult(rows, 10000).hasNext).toBe(false);
  });
});
