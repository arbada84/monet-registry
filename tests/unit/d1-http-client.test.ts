import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

function response(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("D1 HTTP client", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it("reports missing configuration without exposing token values", async () => {
    const { getD1HttpStatus } = await import("@/lib/d1-http-client");

    expect(getD1HttpStatus()).toMatchObject({
      configured: false,
      hasAccountId: false,
      hasDatabaseId: false,
      hasApiToken: false,
      missing: [
        "CLOUDFLARE_ACCOUNT_ID",
        "CLOUDFLARE_D1_DATABASE_ID or D1_DATABASE_ID",
        "CLOUDFLARE_API_TOKEN",
      ],
    });
  });

  it("executes a parameterized D1 query through Cloudflare's query endpoint", async () => {
    vi.stubEnv("CLOUDFLARE_ACCOUNT_ID", "acc_123");
    vi.stubEnv("CLOUDFLARE_D1_DATABASE_ID", "db_456");
    vi.stubEnv("CLOUDFLARE_API_TOKEN", "secret-token");
    const fetchMock = vi.fn(async () => response({
      success: true,
      result: [{
        success: true,
        results: [{ id: "a1", title: "Hello" }],
        meta: { rows_read: 1 },
      }],
    }));

    const { d1HttpQuery } = await import("@/lib/d1-http-client");
    const result = await d1HttpQuery<{ id: string; title: string }>(
      "SELECT * FROM articles WHERE id = ?",
      ["a1"],
      { fetchImpl: fetchMock as unknown as typeof fetch },
    );

    expect(result.rows).toEqual([{ id: "a1", title: "Hello" }]);
    expect(result.meta).toEqual({ rows_read: 1 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const calls = fetchMock.mock.calls as unknown as Array<[RequestInfo | URL, RequestInit]>;
    const [url, init] = calls[0];
    expect(String(url)).toBe("https://api.cloudflare.com/client/v4/accounts/acc_123/d1/database/db_456/query");
    expect(init?.headers).toMatchObject({
      Authorization: "Bearer secret-token",
      "Content-Type": "application/json",
    });
    expect(JSON.parse(String(init?.body))).toEqual({
      sql: "SELECT * FROM articles WHERE id = ?",
      params: ["a1"],
    });
  });

  it("normalizes health checks", async () => {
    vi.stubEnv("CLOUDFLARE_ACCOUNT_ID", "acc");
    vi.stubEnv("D1_DATABASE_ID", "db");
    vi.stubEnv("CLOUDFLARE_API_TOKEN", "token");
    const fetchMock = vi.fn(async () => response({
      success: true,
      result: { success: true, results: [{ ok: 1 }] },
    }));

    const { d1HttpHealthCheck } = await import("@/lib/d1-http-client");

    await expect(d1HttpHealthCheck({ fetchImpl: fetchMock as unknown as typeof fetch })).resolves.toEqual({
      ok: true,
      row: { ok: 1 },
    });
  });

  it("throws concise Cloudflare API errors", async () => {
    vi.stubEnv("CLOUDFLARE_ACCOUNT_ID", "acc");
    vi.stubEnv("D1_DATABASE_ID", "db");
    vi.stubEnv("CLOUDFLARE_API_TOKEN", "token");
    const fetchMock = vi.fn(async () => response({
      success: false,
      errors: [{ message: "Invalid API Token" }],
    }, 401));

    const { d1HttpQuery } = await import("@/lib/d1-http-client");

    await expect(d1HttpQuery("SELECT 1", [], { fetchImpl: fetchMock as unknown as typeof fetch }))
      .rejects.toThrow("Cloudflare D1 query failed with HTTP 401: Invalid API Token");
  });
});
