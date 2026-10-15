import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("TikTok review administrator authorization", () => {
  it("inherits the existing /cam login and reporter redirect policy", () => {
    const middleware = readFileSync("src/middleware.ts", "utf8");
    expect(middleware).toContain('if (pathname.startsWith("/cam"))');
    expect(middleware).toContain('return NextResponse.redirect(new URL("/cam/articles", request.url))');
    expect(middleware.match(/REPORTER_ALLOWED_PATHS\s*=\s*\[[\s\S]*?\]/)?.[0]).not.toContain("/cam/alidot/tiktok-review");
  });

  it("does not expose the internal route through public Alidot pages", () => {
    const publicSources = [
      "src/app/alidot/page.tsx",
      "src/app/alidot/terms/page.tsx",
      "src/app/alidot/privacy/page.tsx",
    ].map((file) => readFileSync(file, "utf8")).join("\n");
    expect(publicSources).not.toContain("/cam/alidot/tiktok-review");
  });
});
