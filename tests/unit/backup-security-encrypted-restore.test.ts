import { chmodSync, existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { afterEach, describe, expect, it } from "vitest";

const tempDirs: string[] = [];

function temp(prefix: string) {
  const dir = mkdtempSync(path.join(tmpdir(), prefix));
  tempDirs.push(dir);
  return dir;
}

function json(file: string, value: unknown) {
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function available(command: string) {
  return spawnSync(command, ["--version"], { stdio: "ignore" }).status === 0;
}

function sqlite(file: string) {
  mkdirSync(path.dirname(file), { recursive: true });
  const sql = `
CREATE TABLE metadata (key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE articles (article_index INTEGER PRIMARY KEY, id TEXT, no INTEGER, title TEXT, date TEXT);
CREATE TABLE article_duplicate_sources (id INTEGER PRIMARY KEY AUTOINCREMENT, kept_article_index INTEGER);
CREATE TABLE raw_rows (id INTEGER PRIMARY KEY AUTOINCREMENT, source_database TEXT, table_name TEXT, row_json TEXT);
CREATE TABLE media_candidates (id INTEGER PRIMARY KEY AUTOINCREMENT, url TEXT);
CREATE TABLE media_files (id INTEGER PRIMARY KEY AUTOINCREMENT, status TEXT, url TEXT);
INSERT INTO metadata VALUES ('backup_dir', 'fixture');
INSERT INTO articles VALUES (1, 'a1', 1, 'First', '2026-07-01T00:00:00Z');
INSERT INTO raw_rows (source_database, table_name, row_json) VALUES ('d1', 'articles', '{}');
INSERT INTO raw_rows (source_database, table_name, row_json) VALUES ('supabase', 'articles', '{}');
`;
  expect(spawnSync("sqlite3", [file], { input: sql, encoding: "utf8" }).status).toBe(0);
}

function backupFixture(root: string, name = "2026-07-20T00-00-00-000Z") {
  const dir = path.join(root, name);
  const completed = new Date().toISOString();
  json(path.join(dir, "backup-manifest.json"), {
    ok: true,
    generated_at: completed,
    completed_at: completed,
    sources: {
      d1: { source: "cloudflare_d1", tables: [{ name: "articles", rows: 1 }, { name: "site_settings", rows: 1 }] },
      supabase: { source: "live_rest", fallback_used: false, tables: [{ name: "articles", rows: 0 }] },
    },
    merge: { kept: { total: 1 }, duplicates: [] },
    media: { candidates: 0 },
  });
  json(path.join(dir, "raw", "d1", "export-manifest.json"), { ok: true, tables: [{ name: "articles", rows: 1 }, { name: "site_settings", rows: 1 }] });
  json(path.join(dir, "raw", "supabase", "export-manifest.json"), { ok: true, fallback_used: false, tables: [{ name: "articles", rows: 0 }] });
  json(path.join(dir, "raw", "d1", "tables", "articles.json"), [{ id: "a1", no: 1 }]);
  json(path.join(dir, "raw", "d1", "tables", "site_settings.json"), [{ key: "cp-mail-settings", value: JSON.stringify({ password: "fixture-secret-value" }) }]);
  json(path.join(dir, "raw", "supabase", "tables", "articles.json"), []);
  json(path.join(dir, "merged", "articles.json"), [{ id: "a1", no: 1, title: "First" }]);
  json(path.join(dir, "merged", "media-candidates.json"), []);
  json(path.join(dir, "media", "media-manifest.json"), { candidates: 0, files: [] });
  json(path.join(root, "media-url-index.json"), { entries: {} });
  sqlite(path.join(dir, "merged", "culturepeople.sqlite"));
  return { dir, name };
}

describe("backup security and encrypted restore", () => {
  afterEach(() => {
    for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
  });

  it("reports sensitive field names without including their values", async () => {
    const root = temp("cp-security-");
    backupFixture(root);
    // @ts-ignore mjs utility
    const { buildBackupSecurityAudit } = await import("../../scripts/backup-security-audit.mjs");
    const report = buildBackupSecurityAudit({ root });
    const serialized = JSON.stringify(report);

    expect(report.ok).toBe(true);
    expect(report.sensitiveData.sensitiveSettingCount).toBeGreaterThan(0);
    expect(serialized).toContain("password");
    expect(serialized).not.toContain("fixture-secret-value");
    expect(report.sensitiveData.valuesIncluded).toBe(false);
  });

  (available("gpg") && available("tar") && available("sqlite3") ? it : it.skip)("encrypts and restores a real backup fixture through GnuPG", async () => {
    const root = temp("cp-secure-source-");
    const target = temp("cp-secure-target-");
    const gpgHome = temp("cp-gpg-home-");
    const key = path.join(temp("cp-key-"), "backup.key");
    backupFixture(root);
    writeFileSync(key, "fixture passphrase with enough entropy 12345", { mode: 0o600 });
    chmodSync(key, 0o600);
    chmodSync(gpgHome, 0o700);
    const previousGpgHome = process.env.GNUPGHOME;
    process.env.GNUPGHOME = gpgHome;
    try {
      // @ts-ignore mjs utility
      const { buildSecureCopyPlan, applySecureCopyPlan } = await import("../../scripts/secure-local-backup-copy.mjs");
      // @ts-ignore mjs utility
      const { restoreSecureBackup } = await import("../../scripts/restore-secure-local-backup.mjs");
      const plan = buildSecureCopyPlan({ sourceRoot: root, targetRoot: target, keyFile: key, minFreeGb: 0 });
      expect(plan.ok).toBe(true);
      const archive = await applySecureCopyPlan(plan, { keyFile: key });
      expect(existsSync(archive.archivePath)).toBe(true);

      const restored = await restoreSecureBackup({ archivePath: archive.archivePath, keyFile: key });

      expect(restored.ok).toBe(true);
      expect(restored.archiveSha256Verified).toBe(true);
      expect(restored.restore.ok).toBe(true);
    } finally {
      if (previousGpgHome === undefined) delete process.env.GNUPGHOME;
      else process.env.GNUPGHOME = previousGpgHome;
    }
  }, 30_000);

  it("keeps unique Supabase fallback anchors out of retention candidates", async () => {
    const root = temp("cp-retention-");
    const old = backupFixture(root, "2025-01-01T00-00-00-000Z").dir;
    const latest = backupFixture(root, "2026-07-20T00-00-00-000Z").dir;
    const oldManifest = JSON.parse(readFileSync(path.join(old, "backup-manifest.json"), "utf8"));
    oldManifest.sources.supabase = { source: "local_fallback", fallback_used: true, fallback_generated_at: "2025-01-01T00:00:00Z", tables: [] };
    json(path.join(old, "backup-manifest.json"), oldManifest);
    const oldTime = new Date("2025-01-01T00:00:00Z");
    utimesSync(old, oldTime, oldTime);
    const latestTime = new Date();
    utimesSync(latest, latestTime, latestTime);
    // @ts-ignore mjs utility
    const { buildRetentionPlan } = await import("../../scripts/backup-retention-plan.mjs");

    const plan = buildRetentionPlan({ root, retentionDays: 30, keepLatest: 1 });
    const row = plan.backups.find((item: { name: string }) => item.name.startsWith("2025-01"));

    expect(row.protected).toBe(true);
    expect(row.protection).toBe("supabase-fallback-anchor");
    expect(row.candidate).toBe(false);
  });

  it("does not select a restore-unverified backup for retention", async () => {
    const root = temp("cp-retention-unverified-");
    const old = backupFixture(root, "2025-02-01T00-00-00-000Z").dir;
    const monthlyAnchor = backupFixture(root, "2025-02-20T00-00-00-000Z").dir;
    backupFixture(root, "2026-07-20T00-00-00-000Z");
    const oldTime = new Date("2025-02-01T00:00:00Z");
    utimesSync(old, oldTime, oldTime);
    utimesSync(monthlyAnchor, new Date("2025-02-20T00:00:00Z"), new Date("2025-02-20T00:00:00Z"));
    // @ts-ignore mjs utility
    const { buildRetentionPlan } = await import("../../scripts/backup-retention-plan.mjs");

    const plan = buildRetentionPlan({ root, retentionDays: 30, keepLatest: 1 });
    const row = plan.backups.find((item: { name: string }) => item.name.startsWith("2025-02"));

    expect(row.protection).toBe("restore-unverified");
    expect(row.candidate).toBe(false);
  });
});
