import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

import { afterEach, describe, expect, it } from "vitest";

const tempDirs: string[] = [];

function makeTempDir() {
  const dir = mkdtempSync(path.join(tmpdir(), "culturepeople-import-"));
  tempDirs.push(dir);
  return dir;
}

function writeJson(filePath: string, value: unknown) {
  mkdirSync(path.dirname(filePath), { recursive: true });
  writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function readJson<T = unknown>(filePath: string): T {
  return JSON.parse(readFileSync(filePath, "utf8")) as T;
}

describe("prepare-d1-import safe merge guards", () => {
  afterEach(() => {
    for (const dir of tempDirs.splice(0)) {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("renumbers article number collisions instead of skipping distinct historical articles", () => {
    const dir = makeTempDir();
    const input = path.join(dir, "input");
    const existingPath = path.join(dir, "existing-d1-articles.json");
    const sqlPath = path.join(dir, "generated-import.sql");
    const mediaPath = path.join(dir, "media-manifest.json");
    const duplicatePath = path.join(dir, "duplicate-articles.json");
    const renumberPath = path.join(dir, "renumbered-articles.json");

    writeJson(existingPath, [
      {
        id: "live-1",
        no: 10,
        title: "Live Article",
        slug: "live-slug",
        source_url: "https://live.example/article",
      },
    ]);
    writeJson(path.join(input, "articles.json"), [
      {
        id: "old-a",
        no: 10,
        title: "Historical Alpha",
        slug: "historical-alpha",
        source_url: "https://old.example/a",
        body: "<p>Alpha</p>",
        created_at: "2026-01-01T00:00:00.000Z",
      },
      {
        id: "old-b",
        no: 11,
        title: "Historical Beta",
        slug: "live-slug",
        source_url: "https://old.example/b",
        body: "<p>Beta</p>",
        created_at: "2026-01-02T00:00:00.000Z",
      },
      {
        id: "dup-source",
        no: 12,
        title: "Different Duplicate Source Title",
        slug: "dup-source",
        source_url: "https://live.example/article",
        body: "<p>Duplicate</p>",
        created_at: "2026-01-03T00:00:00.000Z",
      },
    ]);

    const result = spawnSync(process.execPath, [
      path.resolve("scripts/prepare-d1-import.mjs"),
      "--input", input,
      "--out", sqlPath,
      "--media", mediaPath,
      "--duplicate-report", duplicatePath,
      "--renumber-report", renumberPath,
      "--existing-articles-json", existingPath,
      "--media-base-url", "https://media.example.test",
    ], {
      cwd: process.cwd(),
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });

    expect(result.status).toBe(0);
    const stdout = JSON.parse(result.stdout);
    expect(stdout.stats).toMatchObject({
      articlesRaw: 3,
      articles: 2,
      articlesSkippedDuplicate: 1,
      articlesRenumbered: 1,
      articleSlugRewrites: 1,
      safeMergeMode: true,
    });

    const sql = readFileSync(sqlPath, "utf8");
    expect(sql).toContain('INSERT OR IGNORE INTO "articles"');
    expect(sql).toContain("'old-a', 13, 'Historical Alpha'");
    expect(sql).toContain("migration_renumber");
    expect(sql).toContain("live-slug-migrated-11");
    expect(sql).not.toContain("'dup-source',");

    const duplicateReport = readJson<Array<{ id: string; reason: string; duplicate_key: string }>>(duplicatePath);
    expect(duplicateReport).toHaveLength(1);
    expect(duplicateReport[0]).toMatchObject({
      id: "dup-source",
      reason: "existing_database_duplicate",
      duplicate_key: "source:https://live.example/article",
    });

    const renumberReport = readJson<{
      renumbered: Array<{ id: string; original_no: number; new_no: number }>;
      slugRewrites: Array<{ id: string; original_slug: string; new_slug: string }>;
    }>(renumberPath);
    expect(renumberReport.renumbered).toEqual([
      expect.objectContaining({ id: "old-a", original_no: 10, new_no: 13 }),
    ]);
    expect(renumberReport.slugRewrites).toEqual([
      expect.objectContaining({ id: "old-b", original_slug: "live-slug", new_slug: "live-slug-migrated-11" }),
    ]);
  });

  it("keeps deliberate full refresh mode explicit", () => {
    const dir = makeTempDir();
    const input = path.join(dir, "input");
    const sqlPath = path.join(dir, "generated-import.sql");
    const mediaPath = path.join(dir, "media-manifest.json");
    const duplicatePath = path.join(dir, "duplicate-articles.json");
    const renumberPath = path.join(dir, "renumbered-articles.json");

    writeJson(path.join(input, "articles.json"), [
      {
        id: "a1",
        no: 1,
        title: "Article One",
        source_url: "https://example.com/a1",
        body: "<p>One</p>",
      },
    ]);

    const result = spawnSync(process.execPath, [
      path.resolve("scripts/prepare-d1-import.mjs"),
      "--input", input,
      "--out", sqlPath,
      "--media", mediaPath,
      "--duplicate-report", duplicatePath,
      "--renumber-report", renumberPath,
      "--replace-existing",
    ], {
      cwd: process.cwd(),
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });

    expect(result.status).toBe(0);
    expect(readFileSync(sqlPath, "utf8")).toContain('INSERT OR REPLACE INTO "articles"');
  });

  it("skips comments that point to articles outside the safe merge target set", () => {
    const dir = makeTempDir();
    const input = path.join(dir, "input");
    const sqlPath = path.join(dir, "generated-import.sql");
    const mediaPath = path.join(dir, "media-manifest.json");

    writeJson(path.join(input, "articles.json"), [
      {
        id: "article-1",
        no: 1,
        title: "Article One",
        source_url: "https://example.com/a1",
        body: "<p>One</p>",
      },
    ]);
    writeJson(path.join(input, "comments.json"), [
      {
        id: "valid-comment",
        article_id: "article-1",
        author: "Reader",
        content: "Valid",
      },
      {
        id: "orphan-comment",
        article_id: "missing-article",
        author: "Reader",
        content: "Orphan",
      },
    ]);

    const result = spawnSync(process.execPath, [
      path.resolve("scripts/prepare-d1-import.mjs"),
      "--input", input,
      "--out", sqlPath,
      "--media", mediaPath,
      "--duplicate-report", path.join(dir, "duplicate-articles.json"),
      "--renumber-report", path.join(dir, "renumbered-articles.json"),
    ], {
      cwd: process.cwd(),
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });

    expect(result.status).toBe(0);
    const stdout = JSON.parse(result.stdout);
    expect(stdout.stats).toMatchObject({
      comments: 1,
      commentsSkippedMissingArticle: 1,
    });

    const sql = readFileSync(sqlPath, "utf8");
    expect(sql).toContain("valid-comment");
    expect(sql).not.toContain("orphan-comment");
  });
});
