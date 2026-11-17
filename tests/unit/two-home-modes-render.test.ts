import * as React from "react";
import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import CulturePeopleHome from "@/components/themes/culturepeople/CulturePeopleHome";
import InsightKoreaNewsHome from "@/components/themes/insightkorea/InsightKoreaNewsHome";
import type { Article } from "@/types/article";

beforeAll(() => vi.stubGlobal("React", React));
afterAll(() => vi.unstubAllGlobals());

const articles: Article[] = Array.from({ length: 12 }, (_, index) => ({
  id: `fixture-${index + 1}`, no: index + 1, title: `공개 기사 ${index + 1}`,
  status: "게시", date: `2026-11-${String(index + 1).padStart(2, "0")}T00:00:00Z`,
  category: "문화", body: "", views: index,
}));
const categories = [{ name: "문화", order: 0, visible: true }];
const adSlots = Object.fromEntries(["top", "home-mid-1", "home-mid-2", "bottom"]
  .map((name) => [name, React.createElement("span", { key: name }, `advertisement-${name}`)]));

describe.each([
  { type: "culturepeople", Component: CulturePeopleHome, title: "지금, 주목할 이야기", name: "CulturePeopleHome" },
  { type: "insightkorea", Component: InsightKoreaNewsHome, title: "컬처피플 최신 뉴스", name: "InsightKoreaNewsHome" },
])("$type home render", ({ type, Component, title, name }) => {
  it("connects the actual theme export to the approved home", () => {
    const source = readFileSync(`src/components/themes/${type}/index.ts`, "utf8");
    expect(source).toContain(`from "./${name}"`);
  });

  it("renders real article numbers, one visible H1, legal links and all advertising slots", () => {
    const html = renderToStaticMarkup(React.createElement(Component, {
      articles, initialCategories: categories, adSlots, initialSiteSettings: { siteName: "컬처피플" },
    }));
    expect(html).toContain(title);
    expect(html.match(/<h1(?:\s|>)/g)).toHaveLength(1);
    expect(html).toContain('href="/article/12"');
    expect(html).not.toContain('/article/fixture-');
    expect(html).toContain('href="/alidot"');
    expect(html).toContain('href="/privacy"');
    expect(html).toContain('href="/youth-policy"');
    for (const slot of Object.keys(adSlots)) expect(html).toContain(`advertisement-${slot}`);
  });

  it("keeps empty article feeds usable without invented article links", () => {
    const html = renderToStaticMarkup(React.createElement(Component, { articles: [] }));
    expect(html).toContain("현재 표시할 기사가 없습니다.");
    expect(html).not.toContain('href="/article/');
  });
});
