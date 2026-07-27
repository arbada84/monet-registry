import fs from "node:fs";
import { describe, expect, it } from "vitest";

describe("auto-press policy queue cancellation", () => {
  const service = fs.readFileSync("src/lib/auto-press-policy-audit-service.ts", "utf8");
  const route = fs.readFileSync(
    "src/app/api/auto-press/blocked-subjects/actions/queue-cancel/route.ts",
    "utf8",
  );

  it("requires a verified current report and bounded selection", () => {
    expect(service).toContain("report.report.reportChecksum !== options.reportChecksum");
    expect(service).toContain("state.publishedVersion !== report.report.policyVersion");
    expect(service).toContain("keys.length > 50");
    expect(service).toContain("QUEUE CANCEL ${keys.length}");
  });

  it("requires queue-action capability, same-origin, and idempotency through the shared guard", () => {
    expect(route).toContain('authorizePolicyMutation(request, "queue-action"');
    expect(route).toContain("idempotencyKey: authorized.context.idempotencyKey");
  });

  it("does not expose an article deletion route", () => {
    expect(fs.existsSync("src/app/api/auto-press/blocked-subjects/actions/article-delete/route.ts")).toBe(false);
  });
});
