import fs from "node:fs";
import { describe, expect, it } from "vitest";

describe("auto-press Worker dynamic policy wiring", () => {
  const worker = fs.readFileSync("cloudflare/auto-press-worker/src/index.js", "utf8");
  const policy = fs.readFileSync("cloudflare/auto-press-worker/src/blocked-subject-policy.js", "utf8");
  const wrangler = fs.readFileSync("cloudflare/auto-press-worker/wrangler.toml", "utf8");

  it("loads once for queue batches and scheduled invocations", () => {
    expect(worker).toContain('consumer: "worker-queue"');
    expect(worker).toContain('consumer: "worker-scheduled"');
    expect(worker).toContain("loadedPolicy.snapshot");
    expect(policy).toContain("QUEUE_CACHE_TTL_MS = 60_000");
  });

  it("enables the published dynamic policy with a static fallback", () => {
    expect(wrangler).toContain('AUTO_PRESS_DYNAMIC_POLICY_ENABLED = "true"');
    expect(policy).toContain('source: "static-fallback"');
    expect(policy).toContain("lastKnownGood");
  });

  it("records the actually applied runtime version", () => {
    expect(policy).toContain("auto_press_policy_runtime_observations");
    expect(policy).toContain("policy_version=excluded.policy_version");
  });
});
