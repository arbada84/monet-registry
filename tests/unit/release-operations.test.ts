import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("release reproducibility operations", () => {
  it("requires a successful same-SHA CI run and rejects stale queued runs", async () => {
    // @ts-ignore mjs utility
    const { buildGithubActionsHealth } = await import("../../scripts/github-actions-health.mjs");
    const now = Date.parse("2026-07-21T00:00:00Z");
    const healthy = buildGithubActionsHealth({
      headSha: "abc",
      now,
      runs: [{ headSha: "abc", status: "completed", conclusion: "success", createdAt: "2026-07-20T00:00:00Z", updatedAt: "2026-07-20T00:10:00Z" }],
    });
    const blocked = buildGithubActionsHealth({
      headSha: "abc",
      now,
      runs: [{ headSha: "abc", status: "queued", conclusion: null, createdAt: "2026-07-19T00:00:00Z" }],
    });

    expect(healthy.ok).toBe(true);
    expect(blocked.ok).toBe(false);
    expect(blocked.queuedStale).toHaveLength(1);
  });

  it("fails the release gate when any required check fails", async () => {
    // @ts-ignore mjs utility
    const { evaluateReleaseGate } = await import("../../scripts/culturepeople-release-gate.mjs");
    expect(evaluateReleaseGate([{ name: "a", ok: true }, { name: "b", ok: true }]).ok).toBe(true);
    expect(evaluateReleaseGate([{ name: "a", ok: true }, { name: "b", ok: false }])).toMatchObject({ ok: false, failed: ["b"] });
  });

  it("masks environment values in a release manifest", async () => {
    const secret = "release-fixture-secret-never-print";
    const previous = process.env.TEST_RELEASE_SECRET;
    process.env.TEST_RELEASE_SECRET = secret;
    try {
      // @ts-ignore mjs utility
      const { safeEnvStatus } = await import("../../scripts/create-culturepeople-release-manifest.mjs");
      const environment = safeEnvStatus(["TEST_RELEASE_SECRET"]);
      const serialized = JSON.stringify(environment);
      expect(environment).toEqual([{ key: "TEST_RELEASE_SECRET", state: "masked", valueIncluded: false }]);
      expect(serialized).not.toContain(secret);
    } finally {
      if (previous === undefined) delete process.env.TEST_RELEASE_SECRET;
      else process.env.TEST_RELEASE_SECRET = previous;
    }
  });

  it("accepts a secure restore only when its manifest names the latest backup", async () => {
    const dir = mkdtempSync(path.join(tmpdir(), "cp-release-secure-"));
    const archive = path.join(dir, "copy.tar.gpg");
    const manifestPath = `${archive}.manifest.json`;
    const reportPath = path.join(dir, "restore.json");
    writeFileSync(archive, "fixture", "utf8");
    writeFileSync(manifestPath, JSON.stringify({ ok: true, archiveFile: path.basename(archive), archiveSha256: "fixture-hash", latestBackupName: "2026-07-21T00-00-00-000Z" }), "utf8");
    writeFileSync(reportPath, JSON.stringify({ ok: true, archiveSha256Verified: true, archivePath: archive, manifestPath, restore: { ok: true } }), "utf8");
    // @ts-ignore mjs utility
    const { latestValidSecureRestore } = await import("../../scripts/culturepeople-release-gate.mjs");

    expect(latestValidSecureRestore(reportPath, "2026-07-21T00-00-00-000Z").ok).toBe(true);
    expect(latestValidSecureRestore(reportPath, "2026-07-22T00-00-00-000Z").ok).toBe(false);
  });
});
