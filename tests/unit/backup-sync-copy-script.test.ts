import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

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

describe("sync-local-backup-copy script", () => {
  afterEach(() => {
    for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
  });

  it("builds a dry-run plan and applies a restore-compatible second copy", async () => {
    const source = await makeTempDir("culturepeople-copy-source-");
    const target = await makeTempDir("culturepeople-copy-target-");
    const backupName = "2026-06-25T18-45-30-022Z";
    const backupDir = path.join(source, backupName);
    const mediaStoreFile = path.join(source, "_media-store", "files", "ab", "asset.jpg");

    writeJson(path.join(backupDir, "backup-manifest.json"), {
      ok: true,
      completed_at: "2026-06-25T18:45:30.022Z",
    });
    writeJson(path.join(backupDir, "media", "media-manifest.json"), {
      files: [{
        status: "downloaded",
        url: "https://ifducnfrjarmlpktrjkj.supabase.co/storage/v1/object/public/images/a.jpg",
        file: "../_media-store/files/ab/asset.jpg",
        media_store_file: "_media-store/files/ab/asset.jpg",
        bytes: 5,
      }],
    });
    writeJson(path.join(source, "media-url-index.json"), {
      entries: {
        "https://ifducnfrjarmlpktrjkj.supabase.co/storage/v1/object/public/images/a.jpg": {
          media_store_file: "_media-store/files/ab/asset.jpg",
          bytes: 5,
        },
      },
    });
    mkdirSync(path.dirname(mediaStoreFile), { recursive: true });
    writeFileSync(mediaStoreFile, "image", "utf8");
    mkdirSync(path.join(source, "_logs"), { recursive: true });
    writeFileSync(path.join(source, "_logs", "latest.log"), "ok", "utf8");

    // @ts-ignore - Node .mjs script imported directly for coverage.
    const { buildSyncPlan, applySyncPlan } = await import("../../scripts/sync-local-backup-copy.mjs");

    const plan = buildSyncPlan({ sourceRoot: source, targetRoot: target, includeLogsDays: 30, minFreeGb: 0 } as Record<string, unknown>);
    expect(plan.ok).toBe(true);
    expect(plan.totals.toCopy).toBeGreaterThanOrEqual(4);

    const applied = applySyncPlan(plan);
    expect(applied.copied.length).toBeGreaterThanOrEqual(4);
    expect(existsSync(path.join(target, backupName, "backup-manifest.json"))).toBe(true);
    expect(readFileSync(path.join(target, "_media-store", "files", "ab", "asset.jpg"), "utf8")).toBe("image");
    expect(existsSync(path.join(target, "media-url-index.json"))).toBe(true);
  });
});
