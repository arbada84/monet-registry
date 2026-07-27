import { describe, expect, it } from "vitest";
import { getLegacyArticleRedirect } from "@/lib/article-legacy-redirects";

describe("article legacy redirects", () => {
  it("maps historical duplicate article numbers to the kept article number", () => {
    expect(getLegacyArticleRedirect("23")).toBe(275);
    expect(getLegacyArticleRedirect("25")).toBe(187);
    expect(getLegacyArticleRedirect("27")).toBe(229);
    expect(getLegacyArticleRedirect("33")).toBe(180);
    expect(getLegacyArticleRedirect("34")).toBe(197);
  });

  it("does not redirect deleted, unpublished, unknown, or UUID article identifiers", () => {
    expect(getLegacyArticleRedirect("7")).toBeNull();
    expect(getLegacyArticleRedirect("57")).toBeNull();
    expect(getLegacyArticleRedirect("article-23")).toBeNull();
    expect(getLegacyArticleRedirect("f8ed6573-e1e3-421b-ab24-f88496e55abd")).toBeNull();
  });
});
