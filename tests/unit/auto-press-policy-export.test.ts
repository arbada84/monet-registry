import fs from "node:fs";
import { describe, expect, it } from "vitest";

describe("auto-press policy report export", () => {
  const source = fs.readFileSync(
    "src/app/api/auto-press/blocked-subjects/dry-run/[reportId]/export/route.ts",
    "utf8",
  );

  it("requires policy authentication and disables caching", () => {
    expect(source).toContain('authorizePolicyRead(request, "dry-run")');
    expect(source).toContain('"Cache-Control": "private, no-store"');
  });

  it("protects CSV cells from formula execution", () => {
    expect(source).toContain("/^[=+\\-@]/");
    expect(source).toContain("X-Content-Type-Options");
  });
});
