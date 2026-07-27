import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("public article data cache", () => {
  it("uses short tag-invalidated caches without removing the CSP nonce", () => {
    const db = readFileSync("src/lib/db-server.ts", "utf8");
    const layout = readFileSync("src/app/layout.tsx", "utf8");
    expect(db).toContain('"public-article-by-no"');
    expect(db).toContain('"public-home-articles"');
    expect(db).toContain('"public-articles-by-category"');
    expect(db).toContain('tags: ["articles"]');
    expect(layout).toContain('headersList.get("x-nonce")');
    expect(layout).toContain("nonce={cspNonce}");
  });
});
