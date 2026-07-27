import fs from "node:fs";
import { describe, expect, it } from "vitest";

describe("auto-press policy D1 migration", () => {
  const sql = fs.readFileSync("cloudflare/d1/migrations/0005_auto_press_blocked_subject_policy.sql", "utf8");

  it("is additive and creates policy, observation, and report tables", () => {
    for (const table of [
      "auto_press_policy_state",
      "auto_press_policy_versions",
      "auto_press_blocked_subjects",
      "auto_press_blocked_subject_rules",
      "auto_press_policy_audit_logs",
      "auto_press_policy_runtime_observations",
      "auto_press_policy_reports",
      "auto_press_policy_report_results",
    ]) {
      expect(sql).toContain(`CREATE TABLE IF NOT EXISTS ${table}`);
    }
    expect(sql).not.toMatch(/\bDROP\s+TABLE\b/i);
  });

  it("keeps idempotency keys unique when present", () => {
    expect(sql).toContain("idx_auto_press_policy_audit_idempotency");
    expect(sql).toContain("WHERE idempotency_key IS NOT NULL");
  });
});
