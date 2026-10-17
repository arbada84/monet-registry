import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.setConfig({ testTimeout: 30_000 });

vi.mock("server-only", () => ({}));
const query = vi.hoisted(() => vi.fn());
vi.mock("@/lib/d1-http-client", () => ({ d1HttpQuery: query, d1HttpFirst: vi.fn() }));

beforeEach(() => {
  vi.resetModules();
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://database.invalid");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "test-anon");
  query.mockReset();
});
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

const rows = Array.from({ length: 21 }, (_, id) => ({ id: String(id), title: "Article", status: "게시", body: "must not leak" }));

describe("bounded category adapters", () => {
  it("D1 selects list columns, filters, orders and uses LIMIT + OFFSET", async () => {
    query.mockResolvedValue({ rows });
    const { d1GetCategoryArticlePage } = await import("@/lib/d1-server-db");
    const result = await d1GetCategoryArticlePage("culture", 3);
    const [sql, params] = query.mock.calls[0];
    expect(sql).not.toMatch(/SELECT\s+\*|\bbody\b/i);
    expect(sql).toContain("status = ? AND deleted_at IS NULL AND category = ?");
    expect(sql).toContain("ORDER BY date DESC NULLS LAST, created_at DESC NULLS LAST, id DESC");
    expect(sql).toContain("LIMIT ? OFFSET ?");
    expect(params).toEqual(["게시", "culture", 21, 40]);
    expect(result.articles).toHaveLength(20);
    expect(result.articles[0].body).toBe("");
    expect(result.hasNext).toBe(true);
    await d1GetCategoryArticlePage("culture", 10000);
    expect(query.mock.calls[1][1]).toEqual(["게시", "culture", 21, 199980]);
  });
  it("Supabase uses a bounded list SELECT and article cache tags", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(rows)));
    vi.stubGlobal("fetch", fetchMock);
    const { sbGetCategoryArticlePage } = await import("@/lib/supabase-server-db");
    const result = await sbGetCategoryArticlePage("culture & art", 2);
    const [url, init] = fetchMock.mock.calls[0];
    const params = new URL(url).searchParams;
    expect(params.get("select").split(",")).not.toContain("body");
    expect(params.get("select")).not.toContain("*");
    expect(params.get("category")).toBe("eq.culture & art");
    expect(params.get("status")).toBe("eq.게시");
    expect(params.get("deleted_at")).toBe("is.null");
    expect(params.get("order")).toBe("date.desc.nullslast,created_at.desc.nullslast,id.desc");
    expect(params.get("limit")).toBe("21");
    expect(params.get("offset")).toBe("20");
    expect(init.next).toEqual({ revalidate: 300, tags: ["articles"] });
    expect(init.method).toBeUndefined();
    expect(result.articles).toHaveLength(20);
    expect(result.articles[0].body).toBe("");
    expect(result.hasNext).toBe(true);
  });
  it("rejects invalid pages before IO and propagates failures", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const { sbGetCategoryArticlePage } = await import("@/lib/supabase-server-db");
    const { d1GetCategoryArticlePage } = await import("@/lib/d1-server-db");
    for (const page of [0, NaN, Infinity, 1.5, 10001]) {
      await expect(sbGetCategoryArticlePage("news", page)).rejects.toThrow();
      await expect(d1GetCategoryArticlePage("news", page)).rejects.toThrow();
    }
    expect(fetchMock).not.toHaveBeenCalled();
    expect(query).not.toHaveBeenCalled();
    query.mockRejectedValue(new Error("DB unavailable"));
    await expect(d1GetCategoryArticlePage("news", 1)).rejects.toThrow("DB unavailable");
    fetchMock.mockResolvedValue(new Response("unavailable", { status: 503 }));
    await expect(sbGetCategoryArticlePage("news", 1)).rejects.toThrow("503");
    fetchMock.mockRejectedValue(new Error("offline"));
    await expect(sbGetCategoryArticlePage("news", 1)).rejects.toThrow("offline");
  });
});
