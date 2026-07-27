import fs from "node:fs";
import { describe, expect, it } from "vitest";

describe("notification unread-count degradation", () => {
  const source = fs.readFileSync("src/app/api/db/notifications/route.ts", "utf8");

  it("keeps the admin shell usable when the notification provider is unavailable", () => {
    expect(source).toContain("{ count: 0, degraded: true }");
    expect(source).toContain('"Cache-Control": "private, no-store"');
  });

  it("does not hide failures for notification list or mutation operations", () => {
    expect(source.match(/status: 500/g)?.length).toBeGreaterThanOrEqual(4);
  });
});
