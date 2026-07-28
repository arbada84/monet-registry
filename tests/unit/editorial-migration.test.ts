import fs from "node:fs";
import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";

describe("editorial D1 migration", () => {
  it("is additive, feature-off, and guarded against auto publication", () => {
    const sql = fs.readFileSync("cloudflare/d1/migrations/0006_editorial_pipeline.sql", "utf8");
    expect(sql).not.toMatch(/\bDROP\s+TABLE\b|\bDELETE\s+FROM\b|\bALTER\s+TABLE\s+articles\b/i);
    expect(sql).toContain("auto_publish_enabled INTEGER NOT NULL DEFAULT 0 CHECK (auto_publish_enabled = 0)");
    expect(sql).toContain("CHECK (fixture = 0 OR (evidence_eligible = 0 AND training_eligible = 0))");
  });

  it("applies twice to a clean SQLite database with integrity guards", () => {
    const result = spawnSync(process.execPath, ["scripts/rehearse-editorial-migration.mjs"], {
      cwd: process.cwd(),
      encoding: "utf8",
    });
    expect(result.status, result.stderr || result.stdout).toBe(0);
    expect(JSON.parse(result.stdout)).toMatchObject({
      ok: true,
      appliedTwice: true,
      autoPublishGuard: true,
      fixtureEligibilityGuard: true,
      integrity: "ok",
    });
  });
});
