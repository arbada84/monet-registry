import { describe, expect, it } from "vitest";
import { buildCategorySeoCopy, buildTagSeoCopy } from "@/lib/seo-copy";

describe("SEO copy builders", () => {
  it.each(["공공", "문화", "테크·모빌리티"])("builds contextual category metadata for %s", (category) => {
    const copy = buildCategorySeoCopy(category);

    expect(copy.title.length).toBeGreaterThanOrEqual(25);
    expect(copy.description.length).toBeGreaterThanOrEqual(70);
    expect(copy.title).toContain(category);
    expect(copy.description).toContain(category);
  });

  it.each(["차", "문화예술", "국립중앙박물관"])("builds contextual tag metadata for %s", (tag) => {
    const copy = buildTagSeoCopy(tag);

    expect(copy.title.length).toBeGreaterThanOrEqual(25);
    expect(copy.description.length).toBeGreaterThanOrEqual(70);
    expect(copy.title).toContain(tag);
    expect(copy.description).toContain(tag);
  });

  it("normalizes labels before inserting them into metadata", () => {
    expect(buildTagSeoCopy("  문화   예술 ").title).toContain("문화 예술");
  });
});
