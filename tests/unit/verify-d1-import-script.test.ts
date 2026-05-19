import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

import { afterEach, describe, expect, it } from "vitest";

const tempDirs: string[] = [];

function makeTempDir() {
  const dir = mkdtempSync(path.join(tmpdir(), "culturepeople-d1-verify-"));
  tempDirs.push(dir);
  return dir;
}

function writeJson(filePath: string, value: unknown) {
  mkdirSync(path.dirname(filePath), { recursive: true });
  writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function makeSummary(stats: Record<string, unknown>) {
  return {
    ok: true,
    steps: [
      {
        label: "prepare-import",
        ok: true,
        stdoutJson: {
          stats,
        },
      },
    ],
  };
}

function runVerify({
  dir,
  stats,
  counts,
}: {
  dir: string;
  stats: Record<string, unknown>;
  counts: Record<string, number>;
}) {
  const summaryPath = path.join(dir, "rehearsal-summary.json");
  const countsPath = path.join(dir, "counts.json");
  const mediaPath = path.join(dir, "media-manifest.json");

  writeJson(summaryPath, makeSummary(stats));
  writeJson(countsPath, counts);
  writeJson(mediaPath, []);

  return spawnSync(process.execPath, [
    path.resolve("scripts/verify-d1-import.mjs"),
    "--summary", summaryPath,
    "--media", mediaPath,
    "--counts-json", countsPath,
    "--database", "culturepeople-prod",
  ], {
    cwd: process.cwd(),
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
}

describe("verify-d1-import safe merge verification", () => {
  afterEach(() => {
    for (const dir of tempDirs.splice(0)) {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("accepts a non-empty live D1 merge when actual rows meet safe minimums", () => {
    const dir = makeTempDir();
    const result = runVerify({
      dir,
      stats: {
        articles: 3,
        existingDedupeArticles: 2,
        settings: 1,
        comments: 1,
        notifications: 0,
        viewLogs: 2,
        distributeLogs: 1,
        mediaObjects: 4,
        safeMergeMode: true,
      },
      counts: {
        articles: 5,
        article_search_index: 3,
        site_settings: 1,
        comments: 1,
        notifications: 0,
        view_logs: 2,
        distribute_logs: 1,
        media_objects: 4,
        migration_runs: 1,
      },
    });

    expect(result.status).toBe(0);
    const report = JSON.parse(result.stdout);
    expect(report).toMatchObject({
      ok: true,
      expectedMode: "safe-merge-minimum",
      existingDedupeArticles: 2,
    });
    expect(report.checks.find((check: { table: string }) => check.table === "articles")).toMatchObject({
      mode: "minimum",
      expectedMinimum: 5,
      actual: 5,
      ok: true,
    });
    expect(report.warnings).toEqual([
      expect.stringContaining("article_search_index does not match articles"),
    ]);
  });

  it("rejects a safe merge when the live article total is below the preserved plus imported minimum", () => {
    const dir = makeTempDir();
    const result = runVerify({
      dir,
      stats: {
        articles: 3,
        existingDedupeArticles: 2,
        settings: 0,
        comments: 0,
        notifications: 0,
        viewLogs: 0,
        distributeLogs: 0,
        mediaObjects: 0,
        safeMergeMode: true,
      },
      counts: {
        articles: 4,
        article_search_index: 3,
        site_settings: 0,
        comments: 0,
        notifications: 0,
        view_logs: 0,
        distribute_logs: 0,
        media_objects: 0,
        migration_runs: 1,
      },
    });

    expect(result.status).toBe(1);
    const report = JSON.parse(result.stdout);
    expect(report.ok).toBe(false);
    expect(report.errors).toEqual([
      expect.stringContaining("articles count below safe-merge minimum"),
    ]);
  });

  it("keeps exact verification for empty or replacement-style imports", () => {
    const dir = makeTempDir();
    const result = runVerify({
      dir,
      stats: {
        articles: 3,
        existingDedupeArticles: 0,
        settings: 0,
        comments: 0,
        notifications: 0,
        viewLogs: 0,
        distributeLogs: 0,
        mediaObjects: 0,
        safeMergeMode: true,
      },
      counts: {
        articles: 4,
        article_search_index: 4,
        site_settings: 0,
        comments: 0,
        notifications: 0,
        view_logs: 0,
        distribute_logs: 0,
        media_objects: 0,
        migration_runs: 1,
      },
    });

    expect(result.status).toBe(1);
    const report = JSON.parse(result.stdout);
    expect(report.expectedMode).toBe("exact");
    expect(report.errors).toContain("articles count mismatch: expected 3, actual 4.");
  });
});
