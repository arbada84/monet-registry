import { EventEmitter } from "node:events";
import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
// @ts-ignore Node helper.
import { limitBuildFontRequests } from "../../scripts/lib/build-font-http-limits.mjs";

afterEach(() => vi.useRealTimers());

function setup() {
  vi.useFakeTimers();
  const request = Object.assign(new EventEmitter(), { destroy: vi.fn() });
  const client = { globalAgent: { maxSockets: Infinity }, request: vi.fn((_input: unknown) => request) };
  limitBuildFontRequests(client, 60_000);
  return { client, request };
}

describe("build-only font HTTP resource limits", () => {
  it("caps per-host concurrency and bounds stalled font requests", () => {
    const { client, request } = setup();
    expect(client.globalAgent.maxSockets).toBe(8);
    client.request("https://fonts.gstatic.com/file.woff2");
    vi.advanceTimersByTime(60_000);
    expect(request.destroy).toHaveBeenCalledWith(expect.objectContaining({ message: expect.stringContaining("deadline") }));
  });
  it("clears the deadline after the font response finishes", () => {
    const { client, request } = setup();
    client.request({ hostname: "fonts.googleapis.com" });
    const response = new EventEmitter();
    request.emit("response", response);
    response.emit("end");
    vi.advanceTimersByTime(60_001);
    expect(request.destroy).not.toHaveBeenCalled();
  });
  it("does not add font deadlines to application APIs or lookalike hosts", () => {
    const { client, request } = setup();
    client.request("https://culturepeople.co.kr/api/health");
    client.request("https://fonts.gstatic.com.attacker.test/file");
    vi.advanceTimersByTime(120_000);
    expect(request.destroy).not.toHaveBeenCalled();
  });
  it("is preloaded by the portable runner only for build", () => {
    const source = readFileSync("scripts/run-next-portable.mjs", "utf8");
    expect(source).toContain('args[0] === "build"');
    expect(source).toContain("build-font-network-preload.mjs");
  });
});
