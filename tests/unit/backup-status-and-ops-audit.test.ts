import { mkdtempSync, mkdirSync, rmSync, writeFileSync, utimesSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const tempDirs: string[] = [];

function makeTempDir() {
  const dir = mkdtempSync(path.join(tmpdir(), "culturepeople-status-"));
  tempDirs.push(dir);
  return dir;
}

function writeJson(filePath: string, value: unknown) {
  mkdirSync(path.dirname(filePath), { recursive: true });
  writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function isoHoursAgo(hours: number) {
  return new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
}

function createStatusFixture(root: string) {
  const backupDir = path.join(root, "2026-06-15T00-00-00-000Z");
  writeJson(path.join(backupDir, "backup-manifest.json"), {
    ok: true,
    generated_at: isoHoursAgo(3),
    completed_at: isoHoursAgo(3),
    sources: {
      d1: { tables: [{ name: "articles", rows: 2 }] },
      supabase: {
        source: "local_fallback",
        fallback_used: true,
        fallback_generated_at: isoHoursAgo(10 * 24),
        remote_errors: ["fetch failed"],
        tables: [{ name: "articles", rows: 1 }],
      },
    },
    merge: { kept: { total: 2 }, duplicates: [] },
  });
  writeJson(path.join(backupDir, "merged", "media-candidates.json"), [
    { url: "https://media.example.test/a.jpg", download_allowed: true },
  ]);
  writeJson(path.join(backupDir, "media", "media-manifest.json"), {
    candidates: 1,
    files: [],
    deferred_recent_failures: 1,
    deferred_recent_failure_hosts: { "media.example.test": 1 },
  });
  writeJson(path.join(root, "media-url-index.json"), { entries: {} });
  writeJson(path.join(root, "_image-backfill-runs", "image-backfill-2026-06-15T00-00-00-000Z.json"), {
    generated_at: new Date().toISOString(),
    media: {
      materialized_before: 0,
      materialized_after: 0,
      downloaded: 0,
      failed: 0,
      deferred_dns: 1,
    },
  });
  writeJson(path.join(root, "_image-backfill-runs", "latest.json"), {
    generated_at: new Date().toISOString(),
    media: {
      downloaded: 0,
      failed: 0,
      deferred_dns: 1,
    },
  });
}

function createSecondCopyFixture(root: string) {
  const backupDir = path.join(root, "2026-06-15T00-00-00-000Z");
  writeJson(path.join(backupDir, "backup-manifest.json"), {
    ok: true,
    generated_at: isoHoursAgo(3),
    completed_at: isoHoursAgo(3),
    sources: {
      d1: { tables: [{ name: "articles", rows: 2 }] },
      supabase: { source: "local_fallback", fallback_used: true, fallback_generated_at: isoHoursAgo(10 * 24), tables: [{ name: "articles", rows: 1 }] },
    },
    merge: { kept: { total: 2 }, duplicates: [] },
  });
  mkdirSync(path.join(backupDir, "merged"), { recursive: true });
  writeFileSync(path.join(backupDir, "merged", "culturepeople.sqlite"), "SQLite format 3\u0000fixture", "binary");
  writeJson(path.join(root, "media-url-index.json"), { entries: {} });
}

describe("local backup status and operations audit", () => {
  beforeEach(() => {
    vi.stubEnv("CULTUREPEOPLE_BACKUP_SECOND_COPY", "");
    vi.stubEnv("CULTUREPEOPLE_BACKUP_SECOND_COPY_CONFIG", path.join(makeTempDir(), "no-second-copy-config"));
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    for (const dir of tempDirs.splice(0)) {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("reports RPO, stale fallback, and image backfill health", () => {
    const root = makeTempDir();
    createStatusFixture(root);

    const result = spawnSync(process.execPath, [
      path.resolve("scripts/local-culturepeople-backup-status.mjs"),
      "--root", root,
      "--backup-rpo-hours", "1",
      "--json",
    ], {
      cwd: process.cwd(),
      encoding: "utf8",
      env: {
        ...process.env,
        CULTUREPEOPLE_BACKUP_SECOND_COPY: "",
        CULTUREPEOPLE_BACKUP_SECOND_COPY_CONFIG: path.join(root, "missing-second-copy-config"),
      },
      stdio: ["ignore", "pipe", "pipe"],
    });

    expect(result.status).toBe(0);
    const status = JSON.parse(result.stdout);
    expect(status.targets.backupRpoHours).toBe(1);
    expect(status.health.backupFreshness.status).toBe("danger");
    expect(status.health.supabaseFallback.status).toBe("danger");
    expect(status.health.imageBackfill.status).toBe("warning");
    expect(status.warnings).toEqual(expect.arrayContaining([
      expect.stringContaining("Latest backup is older than RPO"),
      expect.stringContaining("Supabase fallback snapshot is stale"),
      expect.stringContaining("Image backfill added 0 local files"),
    ]));
  });

  it("reports optional second-copy freshness", () => {
    const root = makeTempDir();
    const secondCopy = makeTempDir();
    createStatusFixture(root);
    createSecondCopyFixture(secondCopy);

    const result = spawnSync(process.execPath, [
      path.resolve("scripts/local-culturepeople-backup-status.mjs"),
      "--root", root,
      "--second-copy", secondCopy,
      "--json",
    ], {
      cwd: process.cwd(),
      encoding: "utf8",
      env: {
        ...process.env,
        CULTUREPEOPLE_BACKUP_SECOND_COPY: "",
        CULTUREPEOPLE_BACKUP_SECOND_COPY_CONFIG: path.join(root, "missing-second-copy-config"),
      },
      stdio: ["ignore", "pipe", "pipe"],
    });

    expect(result.status).toBe(0);
    const status = JSON.parse(result.stdout);
    expect(status.secondCopy).toMatchObject({
      root: secondCopy,
      latestBackupName: "2026-06-15T00-00-00-000Z",
      status: "ok",
      mediaIndexPresent: true,
      sqlitePresent: true,
    });
    expect(status.health.secondCopy.status).toBe("ok");
  });

  it("uses the configured second-copy path when no CLI option is provided", () => {
    const root = makeTempDir();
    const secondCopy = makeTempDir();
    const configFile = path.join(root, "config", "backup-second-copy-path");
    createStatusFixture(root);
    createSecondCopyFixture(secondCopy);
    mkdirSync(path.dirname(configFile), { recursive: true });
    writeFileSync(configFile, `${secondCopy}\n`, "utf8");

    const result = spawnSync(process.execPath, [
      path.resolve("scripts/local-culturepeople-backup-status.mjs"),
      "--root", root,
      "--json",
    ], {
      cwd: process.cwd(),
      encoding: "utf8",
      env: {
        ...process.env,
        CULTUREPEOPLE_BACKUP_SECOND_COPY: "",
        CULTUREPEOPLE_BACKUP_SECOND_COPY_CONFIG: configFile,
      },
      stdio: ["ignore", "pipe", "pipe"],
    });

    expect(result.status).toBe(0);
    const status = JSON.parse(result.stdout);
    expect(status.secondCopy).toMatchObject({
      root: secondCopy,
      status: "ok",
      sqlitePresent: true,
    });
  });

  it("warns when disk used percent crosses the configured threshold", () => {
    const root = makeTempDir();
    createStatusFixture(root);

    const result = spawnSync(process.execPath, [
      path.resolve("scripts/local-culturepeople-backup-status.mjs"),
      "--root", root,
      "--disk-warning-used-percent", "1",
      "--disk-danger-used-percent", "101",
      "--disk-warning-gb", "1",
      "--disk-danger-gb", "1",
      "--disk-block-gb", "1",
      "--json",
    ], {
      cwd: process.cwd(),
      encoding: "utf8",
      env: {
        ...process.env,
        CULTUREPEOPLE_BACKUP_SECOND_COPY: "",
        CULTUREPEOPLE_BACKUP_SECOND_COPY_CONFIG: path.join(root, "missing-second-copy-config"),
      },
      stdio: ["ignore", "pipe", "pipe"],
    });

    expect(result.status).toBe(0);
    const status = JSON.parse(result.stdout);
    expect(status.targets.diskWarningUsedPercent).toBe(1);
    expect(status.targets.diskDangerUsedPercent).toBe(101);
    expect(status.health.disk.status).toBe("warning");
    expect(status.warnings).toEqual(expect.arrayContaining([
      expect.stringContaining("used, above the 1% warning threshold"),
    ]));
  });

  it("summarizes local portal evidence without live calls", async () => {
    const root = makeTempDir();
    const portalRunsDir = path.join(root, "portal-runs");
    createStatusFixture(root);
    writeJson(path.join(portalRunsDir, "portal-backfill-dry-run-2026-06-15T00-00-00-000Z.json"), {
      generatedAt: isoHoursAgo(1),
      summary: {
        publishedArticles: 10,
        successfulLogs: 9,
        candidates: 1,
        authFailed: 0,
      },
    });
    // @ts-ignore - Node .mjs script imported directly for coverage.
    const { buildAuditReport } = await import("../../scripts/culturepeople-ops-audit.mjs");

    const audit = buildAuditReport({ root, portalRunsDir });

    expect(audit.ok).toBe(true);
    expect(audit.portalEvidence).toMatchObject({
      latestKind: "dry-run",
      candidates: 1,
      authFailed: 0,
    });
    expect(audit.warnings).toEqual(expect.arrayContaining([
      expect.stringContaining("portal: 1 published URLs"),
    ]));
  });

  it("does not turn stale legacy evidence or missing auth counts into a clean bill of health", async () => {
    const root = makeTempDir();
    createStatusFixture(root);
    const portalRunsDir = path.join(root, "portal-runs");
    writeJson(path.join(portalRunsDir, "portal-backfill-dry-run-2026-06-15T00-00-00-000Z.json"), {
      generatedAt: isoHoursAgo(100), publishedArticles: 10,
      successfulIndexNowLogsVisible: 10, candidates: 0, results: [],
    });
    // @ts-ignore - Node .mjs script imported directly for coverage.
    const { buildAuditReport } = await import("../../scripts/culturepeople-ops-audit.mjs");
    const audit = buildAuditReport({ root, portalRunsDir });
    expect(audit.ok).toBe(false);
    expect(audit.portalEvidence).toMatchObject({ freshness: "stale", successfulLogs: 10, candidates: 0, authFailed: null, countsKnown: false });
  });

  it.each([null, "bad", new Date(Date.now() + 3_600_000).toISOString()])("rejects invalid or future evidence timestamps: %s", async (generatedAt) => {
    const root = makeTempDir();
    writeJson(path.join(root, "portal-backfill-apply-2026-10-18.json"), {
      generatedAt, published: 1, successfulLogs: 1, candidates: 0, authFailed: 0,
    });
    // @ts-ignore - Node .mjs script imported directly for coverage.
    const { summarizePortalEvidence } = await import("../../scripts/culturepeople-ops-audit.mjs");
    expect(summarizePortalEvidence(root)).toMatchObject({ ok: false, freshness: "invalid" });
  });

  it("selects the latest named report even if an old file was just copied", async () => {
    const root = makeTempDir();
    const old = path.join(root, "portal-backfill-apply-2026-06-15.json");
    writeJson(old, { generatedAt: isoHoursAgo(100), authFailed: 5 });
    writeJson(path.join(root, "portal-backfill-dry-run-2026-10-18.json"), {
      generatedAt: isoHoursAgo(1), published: 1, successfulLogs: 1, candidates: 0, authFailed: 0,
    });
    utimesSync(old, new Date(Date.now() + 10000), new Date(Date.now() + 10000));
    // @ts-ignore - Node .mjs script imported directly for coverage.
    const { summarizePortalEvidence } = await import("../../scripts/culturepeople-ops-audit.mjs");
    expect(summarizePortalEvidence(root)).toMatchObject({ ok: true, latestKind: "dry-run", freshness: "fresh", authFailed: 0 });
  });

  it.each([-1, "0", {}, 1.5])("does not coerce invalid counts to zero: %s", async (candidates) => {
    const root = makeTempDir();
    writeJson(path.join(root, "portal-backfill-apply-2026-10-18.json"), {
      generatedAt: isoHoursAgo(1), published: 1, successfulLogs: 1, candidates, authFailed: 0,
    });
    // @ts-ignore - Node .mjs script imported directly for coverage.
    const { summarizePortalEvidence } = await import("../../scripts/culturepeople-ops-audit.mjs");
    expect(summarizePortalEvidence(root)).toMatchObject({ ok: false, candidates: null });
  });

  it.each([true, false])("refreshes aggregate evidence and propagates refresh success=%s", async (ok) => {
    const root = makeTempDir();
    const portalRunsDir = path.join(root, "portal");
    const reportFile = path.join(portalRunsDir, `portal-backfill-${ok ? "dry-run" : "blocked"}-2026-10-18.json`);
    mkdirSync(path.join(root, "scripts"), { recursive: true });
    writeFileSync(path.join(root, "scripts/local-culturepeople-backup-status.mjs"), 'console.log(JSON.stringify({ok:true}));');
    const evidence = { ok, generatedAt: isoHoursAgo(0), published: 1, successfulLogs: 1, candidates: 0, authFailed: 0, ...(ok ? {} : { blocked: { reason: "unavailable" } }) };
    writeFileSync(path.join(root, "scripts/backfill-portal-publication.mjs"), `
      import fs from 'node:fs';
      if (!process.argv.includes('--status-only')) throw Error('aggregate refresh flag missing');
      fs.mkdirSync(${JSON.stringify(portalRunsDir)}, {recursive:true});
      fs.writeFileSync(${JSON.stringify(reportFile)}, ${JSON.stringify(JSON.stringify(evidence))});
      console.log('- report: ' + ${JSON.stringify(reportFile)});
      process.exitCode=${ok ? 0 : 1};
    `);
    // @ts-ignore - Node .mjs script imported directly for coverage.
    const { buildAuditReport } = await import("../../scripts/culturepeople-ops-audit.mjs");
    const cwd = vi.spyOn(process, "cwd").mockReturnValue(root);
    try {
      const audit = buildAuditReport({ root, portalRunsDir, runIndexNowDryRun: true });
      expect(audit.ok).toBe(ok);
      expect(audit.portalEvidence.latestFile).toBe(reportFile);
      expect(audit.indexNowDryRun.ok).toBe(ok);
      if (!ok) expect(audit.errors).toContain("IndexNow read-only status refresh failed.");
    } finally { cwd.mockRestore(); }
  });
});
