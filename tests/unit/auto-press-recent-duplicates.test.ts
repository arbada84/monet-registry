import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { describe, expect, it, vi } from "vitest";
import { findDuplicateArticleCandidate, type ArticleDedupeInput } from "@/lib/article-dedupe";
import { duplicateArticleExists } from "../../cloudflare/auto-press-worker/src/index.js";

// CI runs Node 24, while the app still declares Node 20 types.
type SqlValue = string | null;
const { DatabaseSync }: {
  DatabaseSync: new (path: string) => {
    exec(sql: string): void;
    prepare(sql: string): { run(...args: SqlValue[]): unknown; all(...args: SqlValue[]): Record<string, unknown>[] };
    close(): void;
  };
} = createRequire(import.meta.url)("node:sqlite");

const first = {
  no: 5197,
  title: "로케뜨, CPHI 인디아 2026에서 제약 부형제 및 캡슐 혁신 솔루션 공개",
  sourceUrl: "https://first.example/release",
};
const second = {
  title: "로케트, CPHI 인도 2026서 혁신적인 의약품 부형제 및 캡슐 솔루션 공개",
  sourceUrl: "https://second.example/release",
};
const check = (input: ArticleDedupeInput) => findDuplicateArticleCandidate(input, [first], { similarPressTitles: true });

describe("automatic press duplicate matching", () => {
  it("recognizes the 5197/5198 incident across different source URLs", () => {
    expect(check(second)).toMatchObject({ no: 5197, reason: "similar_title" });
  });

  it("does not misclassify a different event year or an unrelated release", () => {
    expect(check({ ...second, title: second.title.replace("2026", "2027") })).toBeNull();
    expect(check({ ...second, title: "CPHI 인도 2026서 제약 회사 환경 투자 전략 발표" })).toBeNull();
  });

  it("keeps the precise source match and does not change the manual default", () => {
    expect(check({ ...second, sourceUrl: first.sourceUrl + "?utm_source=test" })?.reason).toBe("source_url");
    expect(findDuplicateArticleCandidate(second, [first])).toBeNull();
  });

  it("queries only active articles from the last 168 hours using the existing index", async () => {
    const db = new DatabaseSync(":memory:");
    vi.useFakeTimers({ now: new Date("2026-11-19T12:00:00.000Z") });
    try {
      db.exec(readFileSync("cloudflare/d1/migrations/0001_initial_schema.sql", "utf8"));
      db.exec("CREATE INDEX idx_articles_active_created ON articles(created_at DESC) WHERE deleted_at IS NULL");
      const insert = db.prepare("INSERT INTO articles (id,title,source_url,date,created_at,deleted_at) VALUES (?, ?, ?, '2026-11-12', ?, ?)");
      for (let i = 0; i < 200; i++) {
        insert.run(`historical-${i}`, "Historical article", null, new Date(Date.UTC(2026, 0, i + 1)).toISOString(), null);
      }
      insert.run("too-old", first.title, first.sourceUrl, "2026-11-12T11:59:59.999Z", null);
      insert.run("deleted", first.title, first.sourceUrl, "2026-11-19T00:00:00.000Z", "2026-11-19T01:00:00.000Z");
      db.exec("ANALYZE");
      const env = { DB: { prepare: (sql: string) => ({ bind: (cutoff: string) => ({
        all: async () => {
          const plan = db.prepare("EXPLAIN QUERY PLAN " + sql).all(cutoff);
          expect(plan.some(row => String(row.detail).includes("idx_articles_active_created"))).toBe(true);
          return { results: db.prepare(sql).all(cutoff) };
        },
      }) }) } };
      await expect(duplicateArticleExists(env, second.sourceUrl, "candidate", second.title)).resolves.toBe(false);
      insert.run("boundary", first.title, first.sourceUrl, "2026-11-12T12:00:00.000Z", null);
      await expect(duplicateArticleExists(env, second.sourceUrl, "candidate", second.title)).resolves.toBe(true);
    } finally {
      vi.useRealTimers();
      db.close();
    }
  });
});
