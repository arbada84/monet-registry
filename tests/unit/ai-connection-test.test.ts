import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("server-only", () => ({}));
const mocks = vi.hoisted(() => ({ auth: vi.fn(), read: vi.fn(), rate: vi.fn(), fetch: vi.fn() }));
vi.mock("@/lib/cookie-auth", () => ({ verifyAuthToken: mocks.auth }));
vi.mock("@/lib/db-server", () => ({ serverGetSetting: mocks.read }));
vi.mock("@/lib/redis", () => ({ checkRateLimit: mocks.rate }));
import { POST } from "@/app/api/ai/test-connection/route";

const request = (body: object, origin = "https://example.test") => new NextRequest("https://example.test/api/ai/test-connection", {
  method: "POST", headers: { origin, "Content-Type": "application/json" }, body: JSON.stringify(body),
});
const input = { provider: "openai", model: "gpt-6.1-sol", apiKey: "sk-new-input-test" };

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubGlobal("fetch", mocks.fetch);
  vi.stubEnv("OPENAI_API_KEY", "sk-env-test");
  mocks.auth.mockResolvedValue({ valid: true, name: "test-admin", role: "admin" });
  mocks.rate.mockResolvedValue(true);
  mocks.read.mockResolvedValue({ openaiApiKey: "sk-old-stored-test" });
  mocks.fetch.mockResolvedValue(Response.json({ id: input.model }));
});
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

describe("AI connection test", () => {
  it("tests the newly entered key without reading or saving old settings or generating text", async () => {
    const response = await POST(request({ ...input, apiKey: ` ${input.apiKey} ` }));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ success: true, generated: false });
    expect(mocks.read).not.toHaveBeenCalled();
    expect(mocks.fetch).toHaveBeenCalledExactlyOnceWith(`https://api.openai.com/v1/models/${input.model}`, expect.objectContaining({
      headers: { Authorization: `Bearer ${input.apiKey}` }, cache: "no-store",
    }));
    expect(mocks.fetch.mock.calls[0][1]).not.toHaveProperty("body");
  });

  it("uses the environment key for an explicitly empty input, not an old stored key", async () => {
    expect((await POST(request({ ...input, apiKey: "" }))).status).toBe(200);
    expect(mocks.read).not.toHaveBeenCalled();
    expect(mocks.fetch.mock.calls[0][1].headers.Authorization).toBe("Bearer sk-env-test");
  });

  it("can test saved settings when no override is supplied", async () => {
    await POST(request({ provider: input.provider, model: input.model }));
    expect(mocks.fetch.mock.calls[0][1].headers.Authorization).toBe("Bearer sk-old-stored-test");
  });

  it.each(["sk-****masked", "••••••••", "sk-invalid internal-space"])("rejects masked/malformed keys before making a request: %s", async apiKey => {
    expect((await POST(request({ ...input, apiKey }))).status).toBe(400);
    expect(mocks.fetch).not.toHaveBeenCalled();
  });

  it.each([
    [401, "invalid_api_key", "인증이 거부"],
    [404, "model_not_found", "모델 접근권한"],
    [403, "insufficient_permissions", "모델 조회 권한"],
    [429, "insufficient_quota", "잔액"],
    [429, "rate_limit_exceeded", "요청 한도"],
    [503, "server_error", "제공자 서버 오류"],
  ])("distinguishes provider status %s / %s without exposing provider secrets", async (status, code, message) => {
    mocks.fetch.mockResolvedValue(Response.json({ error: { code, message: `private ${input.apiKey}` } }, { status }));
    const response = await POST(request(input));
    const body = await response.text();
    expect(body).toContain(message);
    expect(body).not.toContain(input.apiKey);
    expect(body).not.toContain("private");
  });

  it("fails closed on an unauthenticated request", async () => {
    mocks.auth.mockResolvedValue({ valid: false, role: "" });
    expect((await POST(request(input))).status).toBe(403);
    expect(mocks.read).not.toHaveBeenCalled();
    expect(mocks.fetch).not.toHaveBeenCalled();
  });

  it("does not accept reporter role or cross-origin requests", async () => {
    mocks.auth.mockResolvedValueOnce({ valid: true, role: "reporter" });
    expect((await POST(request(input))).status).toBe(403);
    expect((await POST(request(input, "https://evil.test"))).status).toBe(403);
    expect(mocks.fetch).not.toHaveBeenCalled();
  });

  it("enforces the rate limit", async () => {
    mocks.rate.mockResolvedValue(false);
    expect((await POST(request(input))).status).toBe(429);
    expect(mocks.fetch).not.toHaveBeenCalled();
  });

  it("does not leak a network error containing a key", async () => {
    mocks.fetch.mockRejectedValue(new Error(`network failure ${input.apiKey}`));
    const response = await POST(request(input));
    expect(response.status).toBe(502);
    expect(await response.text()).not.toContain(input.apiKey);
  });

  it("distinguishes timeouts", async () => {
    mocks.fetch.mockRejectedValue(new DOMException("timeout", "TimeoutError"));
    expect((await POST(request(input))).status).toBe(504);
  });

  it("does not report malformed model responses as success", async () => {
    mocks.fetch.mockResolvedValue(Response.json({}));
    expect((await POST(request(input))).status).toBe(502);
  });

  it("also tests the unsaved Gemini key without generating content", async () => {
    mocks.fetch.mockResolvedValue(Response.json({ name: "models/gemini-2.5-flash" }));
    expect((await POST(request({ provider: "gemini", model: "gemini-2.5-flash", apiKey: "gemini-input-test" }))).status).toBe(200);
    expect(mocks.fetch.mock.calls[0][1].headers).toEqual({ "x-goog-api-key": "gemini-input-test" });
  });

  it("classifies Gemini HTTP 400 API_KEY_INVALID details as an authentication failure", async () => {
    mocks.fetch.mockResolvedValue(Response.json({ error: { code: 400, status: "INVALID_ARGUMENT", details: [{ reason: "API_KEY_INVALID" }] } }, { status: 400 }));
    const response = await POST(request({ provider: "gemini", model: "gemini-2.5-flash", apiKey: "gemini-input-test" }));
    expect(await response.text()).toContain("인증이 거부");
  });
});
