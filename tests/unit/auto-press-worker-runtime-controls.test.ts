import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("auto-press worker runtime controls", () => {
  it("keeps runtime controls visible in health and before write side effects", () => {
    const workerSource = readFileSync("cloudflare/auto-press-worker/src/index.js", "utf8");

    expect(workerSource).toContain("AUTO_PRESS_WORKER_ENABLED");
    expect(workerSource).toContain("AUTO_PRESS_WORKER_DRY_RUN");
    expect(workerSource).toContain("AUTO_PRESS_AUTO_PUBLISH_ENABLED");
    expect(workerSource).toContain("controls: workerRuntimeControls(env)");
    expect(workerSource.indexOf("if (workerDryRunEnabled(env))")).toBeGreaterThan(0);
    expect(workerSource.indexOf("if (workerDryRunEnabled(env))")).toBeLessThan(workerSource.indexOf("uploadDownloadedImage(env, sourceImageUrl"));
    expect(workerSource).toContain("if (!autoPublishEnabled(env)) return \"임시저장\"");
  });

  it("keeps duplicate checks active for same-title items even when source URLs differ", () => {
    const workerSource = readFileSync("cloudflare/auto-press-worker/src/index.js", "utf8");
    const observabilitySource = readFileSync("src/lib/auto-press-observability.ts", "utf8");

    expect(workerSource).toContain("normalizeTitle(row.title) === normalizedTitle");
    expect(workerSource).not.toContain("!canonicalUrl\n      && normalizedTitle");
    expect(observabilitySource).toContain("seenTitles");
    expect(observabilitySource).not.toContain("!candidate.canonicalUrl && candidate.normalizedTitle");
  });

  it("keeps successful item writes isolated from best-effort event logging", () => {
    const workerSource = readFileSync("cloudflare/auto-press-worker/src/index.js", "utf8");

    expect(workerSource).toContain("event logging failed");
    expect(workerSource).toContain("run count refresh failed");
    expect(workerSource).toContain("await finishItem(env, item, \"ok\"");
  });
});
