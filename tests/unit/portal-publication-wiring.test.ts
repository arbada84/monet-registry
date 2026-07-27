import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

function source(path: string) {
  return readFileSync(path, "utf8");
}

describe("portal publication wiring", () => {
  it("connects auto-news direct article creation to the portal publication pipeline", () => {
    const code = source("src/app/api/cron/auto-news/route.ts");

    expect(code).toContain('import { publishArticleToPortals } from "@/lib/portal-publication"');
    expect(code).toContain("const savedNo = await serverCreateArticle(article)");
    expect(code).toContain('if (article.status === "게시")');
    expect(code).toContain('source: "auto-news"');
  });

  it("connects Next.js auto-press direct article creation to the portal publication pipeline", () => {
    const code = source("src/app/api/cron/auto-press/route.ts");

    expect(code).toContain('import { publishArticleToPortals } from "@/lib/portal-publication"');
    expect(code).toContain("const savedNo = await serverCreateArticle(article)");
    expect(code).toContain('if (articleStatus === "게시")');
    expect(code).toContain('source: "auto-press"');
  });

  it("connects worker-notify only after a worker-created article is publicly published", () => {
    const code = source("src/app/api/auto-press/worker-notify/route.ts");

    expect(code).toContain('import { publishArticleToPortals } from "@/lib/portal-publication"');
    expect(code).toContain('let shouldPublishToPortals = status === "게시"');
    expect(code).toContain('shouldPublishToPortals = article.status === "게시"');
    expect(code).toContain('source: "auto-press-worker"');
  });

  it("connects mail registration only when the registered article is published", () => {
    const code = source("src/app/api/mail/register/route.ts");

    expect(code).toContain('import { publishArticleToPortals } from "@/lib/portal-publication"');
    expect(code).toContain("const savedNo = await serverCreateArticle(article)");
    expect(code).toContain('if (article.status === "게시")');
    expect(code).toContain('source: "mail"');
  });

  it("connects AI bulk publishing only after articles are promoted to published", () => {
    const code = source("src/app/api/ai/bulk-generate/route.ts");

    expect(code).toContain('import { publishArticleToPortals } from "@/lib/portal-publication"');
    expect(code).toContain('await serverUpdateArticle(id, { status: "게시" })');
    expect(code).toContain('status: "게시"');
    expect(code).toContain('source: "manual-edit"');
  });
});
