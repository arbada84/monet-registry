import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

import { afterEach, describe, expect, it } from "vitest";

const tempDirs: string[] = [];

function makeTempDir() {
  const dir = mkdtempSync(path.join(tmpdir(), "culturepeople-restore-check-"));
  tempDirs.push(dir);
  return dir;
}

function writeJson(filePath: string, value: unknown) {
  mkdirSync(path.dirname(filePath), { recursive: true });
  writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function hasSqlite() {
  return spawnSync("sqlite3", ["--version"], { stdio: "ignore" }).status === 0;
}

function createSqlite(filePath: string) {
  mkdirSync(path.dirname(filePath), { recursive: true });
  const sql = `
CREATE TABLE metadata (key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE articles (article_index INTEGER PRIMARY KEY, id TEXT, no INTEGER, title TEXT, date TEXT);
CREATE TABLE article_duplicate_sources (id INTEGER PRIMARY KEY AUTOINCREMENT, kept_article_index INTEGER);
CREATE TABLE raw_rows (id INTEGER PRIMARY KEY AUTOINCREMENT, source_database TEXT, table_name TEXT, row_json TEXT);
CREATE TABLE media_candidates (id INTEGER PRIMARY KEY AUTOINCREMENT, url TEXT);
CREATE TABLE media_files (id INTEGER PRIMARY KEY AUTOINCREMENT, status TEXT, url TEXT);
INSERT INTO metadata (key, value) VALUES ('backup_dir', 'fixture');
INSERT INTO articles (article_index, id, no, title, date) VALUES (1, 'a1', 1, 'First', '2026-06-01T00:00:00.000Z');
INSERT INTO articles (article_index, id, no, title, date) VALUES (2, 'a2', 2, 'Second', '2026-06-02T00:00:00.000Z');
INSERT INTO raw_rows (source_database, table_name, row_json) VALUES ('d1', 'articles', '{}');
INSERT INTO raw_rows (source_database, table_name, row_json) VALUES ('supabase', 'articles', '{}');
`;
  const result = spawnSync("sqlite3", [filePath], {
    input: sql,
    encoding: "utf8",
    stdio: ["pipe", "pipe", "pipe"],
  });
  expect(result.status).toBe(0);
}

function createBackupFixture(root: string) {
  const backupDir = path.join(root, "2026-06-15T00-00-00-000Z");
  const completedAt = new Date().toISOString();
  writeJson(path.join(backupDir, "backup-manifest.json"), {
    ok: true,
    generated_at: completedAt,
    completed_at: completedAt,
    sources: {
      d1: { source: "cloudflare_d1", tables: [{ name: "articles", rows: 1 }] },
      supabase: { source: "live_rest", fallback_used: false, tables: [{ name: "articles", rows: 1 }] },
    },
    merge: { kept: { total: 2 }, duplicates: [] },
    media: { candidates: 0 },
  });
  writeJson(path.join(backupDir, "raw", "d1", "export-manifest.json"), {
    ok: true,
    tables: [{ name: "articles", rows: 1 }],
  });
  writeJson(path.join(backupDir, "raw", "supabase", "export-manifest.json"), {
    ok: true,
    fallback_used: false,
    tables: [{ name: "articles", rows: 1 }],
  });
  writeJson(path.join(backupDir, "raw", "d1", "tables", "articles.json"), [{ id: "a1", no: 1 }]);
  writeJson(path.join(backupDir, "raw", "supabase", "tables", "articles.json"), [{ id: "a2", no: 2 }]);
  writeJson(path.join(backupDir, "merged", "articles.json"), [
    { id: "a1", no: 1, title: "First" },
    { id: "a2", no: 2, title: "Second" },
  ]);
  writeJson(path.join(backupDir, "merged", "media-candidates.json"), []);
  writeJson(path.join(backupDir, "media", "media-manifest.json"), { candidates: 0, files: [] });
  createSqlite(path.join(backupDir, "merged", "culturepeople.sqlite"));
  return backupDir;
}

describe("local backup restore rehearsal script", () => {
  afterEach(() => {
    for (const dir of tempDirs.splice(0)) {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  (hasSqlite() ? it : it.skip)("opens a copied SQLite snapshot and verifies JSON counts", async () => {
    const root = makeTempDir();
    const backupDir = createBackupFixture(root);
    // @ts-ignore - Node .mjs script imported directly for coverage.
    const { buildRestoreCheckReport } = await import("../../scripts/restore-local-culturepeople-backup.mjs") as {
      buildRestoreCheckReport: (options: { backupDir: string }) => {
        ok: boolean;
        restoreDir: string | null;
        summary: {
          sqlite: {
            integrityOk: boolean;
            counts: Record<string, number>;
            latestArticle: { no: number; title: string } | null;
          };
        };
      };
    };

    const report = buildRestoreCheckReport({ backupDir });

    expect(report.ok).toBe(true);
    expect(report.restoreDir).toBeNull();
    expect(report.summary.sqlite.integrityOk).toBe(true);
    expect(report.summary.sqlite.counts).toMatchObject({
      articles: 2,
      raw_rows: 2,
      media_candidates: 0,
      media_files: 0,
    });
    expect(report.summary.sqlite.latestArticle).toMatchObject({
      no: 2,
      title: "Second",
    });
  });
});
