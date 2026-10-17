import { describe, expect, it, vi } from "vitest";
// @ts-ignore - Node script imported directly.
import { installReadOnlyGuard } from "../../scripts/lib/smoke-read-only.mjs";

describe("admin smoke read-only network guard", () => {
  async function setup() {
    let handler: (request: unknown) => Promise<void> = async () => {};
    const page = { setRequestInterception: vi.fn(), on: vi.fn((_event, listener) => { handler = listener; }) };
    const blocked = await installReadOnlyGuard(page, "https://culturepeople.co.kr");
    return { page, blocked, handle: (method: string, url: string) => {
      const request = { method: () => method, url: () => url, isInterceptResolutionHandled: () => false, continue: vi.fn(), respond: vi.fn() };
      return handler(request).then(() => request);
    } };
  }

  it("only forwards read-only methods", async () => {
    const { handle, blocked, page } = await setup();
    expect(page.setRequestInterception).toHaveBeenCalledWith(true);
    const read = await handle("GET", "https://culturepeople.co.kr/api/db/articles");
    expect(read.continue).toHaveBeenCalledOnce();
    for (const method of ["POST", "PUT", "PATCH", "DELETE"]) {
      const write = await handle(method, "https://culturepeople.co.kr/api/db/articles?secret=never-log");
      expect(write.continue).not.toHaveBeenCalled();
      expect(write.respond).toHaveBeenCalledWith({ status: 403, body: "" });
    }
    expect(blocked).toHaveLength(4);
    expect(JSON.stringify(blocked)).not.toContain("secret");
  });

  it("suppresses known activity telemetry without granting other write endpoints an exception", async () => {
    const { handle, blocked } = await setup();
    const telemetry = await handle("POST", "https://culturepeople.co.kr/api/db/activity-logs");
    expect(telemetry.respond).toHaveBeenCalledWith({ status: 204, body: "" });
    expect(telemetry.continue).not.toHaveBeenCalled();
    await handle("POST", "https://outside.example/api/db/activity-logs?token=secret");
    expect(blocked).toEqual([
      { method: "POST", path: "/api/db/activity-logs", telemetry: true },
      { method: "POST", path: "external", telemetry: false },
    ]);
  });
});
