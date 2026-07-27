import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

const tempDirs: string[] = [];
function temp() { const dir = mkdtempSync(path.join(tmpdir(), "cp-tag-r2-")); tempDirs.push(dir); return dir; }
function json(file: string, value: unknown) { mkdirSync(path.dirname(file), { recursive: true }); writeFileSync(file, `${JSON.stringify(value)}\n`); }

describe("tag audit and R2 rewrite gate", () => {
  afterEach(() => { for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true }); });

  it("compares 2/3/5 tag thresholds without applying policy", async () => {
    // @ts-ignore mjs utility
    const { buildTagAudit } = await import("../../scripts/audit-culturepeople-tags.mjs");
    const report = buildTagAudit({
      backupDir: "/fixture",
      articles: [
        { status: "게시", tags: "one,common" },
        { status: "게시", tags: "common,three" },
        { status: "게시", tags: "common,three" },
      ],
    });
    expect(report.comparisons.map((row: { threshold: number }) => row.threshold)).toEqual([2, 3, 5]);
    expect(report.policyApplied).toBe(false);
    expect(report.databaseWrites).toBe(false);
  });

  it("requires complete local, hash, content-type, public verification and rollback evidence", async () => {
    const root = temp();
    const backup = path.join(root, "2026-07-20T00-00-00-000Z");
    const mediaFile = path.join(root, "_media-store", "files", "asset.jpg");
    json(path.join(backup, "backup-manifest.json"), { ok: true, completed_at: "2026-07-20T00:00:00Z" });
    json(path.join(backup, "merged", "media-candidates.json"), [{ url: "https://source.test/a.jpg", download_allowed: true }]);
    json(path.join(backup, "merged", "articles.json"), []);
    json(path.join(backup, "media", "media-manifest.json"), {});
    mkdirSync(path.dirname(mediaFile), { recursive: true });
    writeFileSync(mediaFile, "image");
    json(path.join(root, "media-url-index.json"), { entries: { "https://source.test/a.jpg": { media_store_file: "_media-store/files/asset.jpg" } } });
    const manifest = path.join(root, "r2-manifest.json");
    const copy = path.join(root, "copy.json");
    const verify = path.join(root, "verify.json");
    json(manifest, [{ id: "m1", source_url: "https://source.test/a.jpg", public_url: "https://media.test/a.jpg", object_key: "a.jpg", bucket: "media", should_copy_to_r2: true }]);
    json(copy, { results: [{ id: "m1", status: "copied", source_sha256: "a".repeat(64), content_type: "image/jpeg" }] });
    json(verify, { results: [{ id: "m1", status: "ok", content_type: "image/jpeg" }] });
    // @ts-ignore mjs utility
    const { buildR2MediaReadinessReport } = await import("../../scripts/r2-media-readiness-report.mjs");

    const ready = buildR2MediaReadinessReport({ root, manifestPath: manifest, copyReportPath: copy, verifyReportPath: verify, reportPath: path.join(root, "ready.json") });
    const blocked = buildR2MediaReadinessReport({ root, manifestPath: manifest, copyReportPath: path.join(root, "missing.json"), verifyReportPath: verify, reportPath: path.join(root, "blocked.json") });

    expect(ready.rewrite.productionRewriteAllowed).toBe(true);
    expect(ready.rewrite.rollbackMappingCoverage).toBe(100);
    expect(blocked.rewrite.productionRewriteAllowed).toBe(false);
    expect(blocked.rewrite.blockedReasons.join(" ")).toContain("hash/content-type");
  });
});
