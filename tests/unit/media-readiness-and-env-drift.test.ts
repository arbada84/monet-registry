import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

import { afterEach, describe, expect, it } from "vitest";

const tempDirs: string[] = [];

async function makeTempDir(prefix: string) {
  const dir = await mkdtemp(path.join(tmpdir(), prefix));
  tempDirs.push(dir);
  return dir;
}

function writeJson(filePath: string, value: unknown) {
  mkdirSync(path.dirname(filePath), { recursive: true });
  writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

describe("media readiness and env drift operations scripts", () => {
  afterEach(() => {
    for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
  });

  it("reports missing local media as a production rewrite blocker", async () => {
    const root = await makeTempDir("culturepeople-media-readiness-");
    const backupDir = path.join(root, "2026-06-25T18-45-30-022Z");
    const r2Manifest = path.join(root, "r2-media-manifest.json");
    const reportPath = path.join(root, "readiness.json");

    writeJson(path.join(backupDir, "backup-manifest.json"), { ok: true, completed_at: "2026-06-25T18:45:30.022Z" });
    writeJson(path.join(backupDir, "merged", "media-candidates.json"), [
      { url: "https://ifducnfrjarmlpktrjkj.supabase.co/storage/v1/object/public/images/a.jpg", download_allowed: true },
    ]);
    writeJson(path.join(backupDir, "merged", "articles.json"), [
      { id: "a1", body: "<img src=\"https://ifducnfrjarmlpktrjkj.supabase.co/storage/v1/object/public/images/a.jpg\">" },
    ]);
    writeJson(path.join(backupDir, "media", "media-manifest.json"), { files: [], failed: 1 });
    writeJson(path.join(root, "media-url-index.json"), { entries: {} });
    writeJson(r2Manifest, [{
      source_url: "https://ifducnfrjarmlpktrjkj.supabase.co/storage/v1/object/public/images/a.jpg",
      should_copy_to_r2: true,
      bucket: "culturepeople-media-prod",
      object_key: "migrated/a.jpg",
      public_url: "https://media.culturepeople.co.kr/migrated/a.jpg",
    }]);

    // @ts-ignore - Node .mjs script imported directly for coverage.
    const { buildR2MediaReadinessReport } = await import("../../scripts/r2-media-readiness-report.mjs");
    const report = buildR2MediaReadinessReport({ root, manifestPath: r2Manifest, reportPath });

    expect(report.ok).toBe(true);
    expect(report.media.missing).toBe(1);
    expect(report.r2.copyRequired).toBe(1);
    expect(report.rewrite.productionRewriteAllowed).toBe(false);
    expect(report.rewrite.blockedReasons[0]).toContain("not materialized");
  });

  it("counts a locally backed-up and publicly verified R2 replacement as migrated media", async () => {
    const root = await makeTempDir("culturepeople-media-migrated-");
    const backupDir = path.join(root, "2026-07-20T00-00-00-000Z");
    const sourceUrl = "https://project.supabase.co/storage/v1/object/public/images/a.jpg";
    const publicUrl = "https://media.culturepeople.co.kr/migrated/a.jpg";
    const mediaFile = path.join(root, "_media-store", "files", "asset.jpg");
    const r2Manifest = path.join(root, "r2-media-manifest.json");
    const verifyReport = path.join(root, "r2-verify-report.json");

    writeJson(path.join(backupDir, "backup-manifest.json"), { ok: true, completed_at: "2026-07-20T00:00:00Z" });
    writeJson(path.join(backupDir, "merged", "media-candidates.json"), [{ url: sourceUrl, download_allowed: true }]);
    writeJson(path.join(backupDir, "merged", "articles.json"), [{ id: "a1", body: `<img src="${sourceUrl}">` }]);
    writeJson(path.join(backupDir, "media", "media-manifest.json"), {});
    mkdirSync(path.dirname(mediaFile), { recursive: true });
    writeFileSync(mediaFile, "image");
    writeJson(path.join(root, "media-url-index.json"), {
      entries: {
        [publicUrl]: {
          media_store_file: "_media-store/files/asset.jpg",
          content_hash: "a".repeat(64),
          content_type: "image/jpeg",
        },
      },
    });
    writeJson(r2Manifest, [{
      id: "m1",
      source_url: sourceUrl,
      public_url: publicUrl,
      object_key: "migrated/a.jpg",
      bucket: "media",
      should_copy_to_r2: true,
    }]);
    writeJson(verifyReport, { results: [{ id: "m1", status: "ok", content_type: "image/jpeg" }] });

    // @ts-ignore - Node .mjs script imported directly for coverage.
    const { buildR2MediaReadinessReport } = await import("../../scripts/r2-media-readiness-report.mjs");
    const report = buildR2MediaReadinessReport({
      root,
      manifestPath: r2Manifest,
      copyReportPath: path.join(root, "missing-copy-report.json"),
      verifyReportPath: verifyReport,
      reportPath: path.join(root, "readiness.json"),
    });

    expect(report.media.directMaterialized).toBe(0);
    expect(report.media.migratedEquivalent).toBe(1);
    expect(report.media.missing).toBe(0);
    expect(report.r2.reconciledExistingWithHashAndContentType).toBe(1);
    expect(report.r2.copyEvidenceComplete).toBe(true);
    expect(report.rewrite.productionRewriteAllowed).toBe(true);
  });

  it("flags empty sensitive env overrides without exposing values", async () => {
    const root = await makeTempDir("culturepeople-env-drift-");
    const local = path.join(root, ".env.local");
    const vercel = path.join(root, ".env.vercel.local");
    writeFileSync(local, "CULTUREPEOPLE_VERCEL_TOKEN=real-token\nNEXT_PUBLIC_VALUE=ok\n", "utf8");
    writeFileSync(vercel, "CULTUREPEOPLE_VERCEL_TOKEN=\n", "utf8");

    // @ts-ignore - Node .mjs script imported directly for coverage.
    const { buildEnvDriftReport } = await import("../../scripts/env-drift-check.mjs");
    const report = buildEnvDriftReport({ files: [local, vercel], failEmptyOverrides: true });

    expect(report.ok).toBe(false);
    expect(report.emptyOverrides).toHaveLength(1);
    expect(JSON.stringify(report)).not.toContain("real-token");
    expect(report.sensitiveKeys).toContainEqual({ key: "CULTUREPEOPLE_VERCEL_TOKEN", value: "***" });
  });

  it("prints a predeploy ops dry-run plan without executing checks", () => {
    const result = spawnSync(process.execPath, [
      path.resolve("scripts/predeploy-ops-check.mjs"),
      "--root", "/tmp/culturepeople-backups",
      "--base", "https://culturepeople.co.kr",
      "--dry-run",
      "--json",
    ], {
      cwd: process.cwd(),
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });

    expect(result.status).toBe(0);
    const report = JSON.parse(result.stdout);
    expect(report.mode).toBe("dry-run");
    expect(report.steps.map((step: { name: string }) => step.name)).toEqual(expect.arrayContaining([
      "typecheck",
      "backup-status",
      "restore-check-all",
      "ops-audit",
      "portal-surface",
    ]));
  });
});
