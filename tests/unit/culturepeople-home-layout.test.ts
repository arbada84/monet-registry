import { describe, expect, it } from "vitest";
import type { Article } from "@/types/article";
import { selectCulturePeopleHome } from "@/lib/culturepeople-home-layout";

const article = (id: number, patch: Partial<Article> = {}): Article => ({
  id: String(id), no: id, title: `기사 ${id}`, date: `2026-11-${String(id).padStart(2, "0")}T00:00:00Z`,
  status: "게시", category: "문화", views: id, body: "", ...patch,
});
describe("culturepeople editorial home selection", () => {
  it("excludes drafts, deleted articles and repeated IDs without mutating input", () => {
    const source = [article(1), article(2, { status: "임시저장" }), article(3, { deletedAt: "2026-11-15" }), article(1)];
    const result = selectCulturePeopleHome(source, []);
    expect(result.lead?.id).toBe("1");
    expect(result.latest).toEqual([]);
    expect(result.popular).toHaveLength(1);
    expect(source).toHaveLength(4);
  });
  it("keeps lead/latest out of category cards while retaining original popularity ranking", () => {
    const result = selectCulturePeopleHome(Array.from({ length: 8 }, (_, i) => article(i + 1)), []);
    expect(result.lead?.id).toBe("8");
    expect(result.latest.map((a) => a.id)).toEqual(["7", "6", "5"]);
    expect(result.sections[0].articles.map((a) => a.id)).toEqual(["4", "3", "2", "1"]);
    expect(result.popular[0].id).toBe("8");
    expect(result.popular).toHaveLength(5);
  });
  it("renders a single remaining category and honors configured order and visibility", () => {
    const source = Array.from({ length: 8 }, (_, i) => article(i + 1));
    const categories = [{ name: "공공", order: 0, visible: false }, { name: "문화", order: 1, visible: true }];
    const result = selectCulturePeopleHome(source, categories);
    expect(result.names).toEqual(["문화"]);
    expect(result.sections.map((s) => s.name)).toEqual(["문화"]);
    expect(categories[0].name).toBe("공공");
  });
  it("does not merge distinct articles with a shared image", () => {
    const result = selectCulturePeopleHome([article(1, { thumbnail: "/same.jpg" }), article(2, { thumbnail: "/same.jpg" })], []);
    expect(result.lead?.id).toBe("2");
    expect(result.latest[0].id).toBe("1");
  });
  it("handles empty feeds and explicitly hidden categories", () => {
    expect(selectCulturePeopleHome([], []).lead).toBeUndefined();
    expect(selectCulturePeopleHome([article(1)], [{ name: "문화", order: 0, visible: false }]).names).toEqual([]);
  });
});
