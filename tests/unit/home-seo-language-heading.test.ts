import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();

function read(relativePath: string): string {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

describe("public home SEO structure", () => {
  it("declares Korean as the document language", () => {
    const layout = read("src/app/layout.tsx");

    expect(layout).toContain('<html lang="ko" suppressHydrationWarning>');
    expect(layout).toContain('<meta httpEquiv="content-language" content="ko" />');
  });

  it.each([
    "src/components/themes/culturepeople/CulturePeopleLanding.tsx",
    "src/components/themes/insightkorea/InsightKoreaLanding.tsx",
    "src/components/pages/culturepeople-landing/index.tsx",
  ])("keeps a visible home hero H1 in %s", (relativePath) => {
    const source = read(relativePath);

    expect(source).toMatch(/<h1[\s\S]*?className=(?:"|\{)/);
    expect(source).not.toMatch(/<h1 className="sr-only"/);
    expect(source).toContain("컬처피플 최신 뉴스");
  });
});
