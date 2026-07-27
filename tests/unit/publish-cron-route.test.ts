import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("server-only", () => ({}));

const mocks = vi.hoisted(() => ({
  cache: {
    revalidateTag: vi.fn(),
  },
  cookieAuth: {
    isAuthenticated: vi.fn(),
    timingSafeEqual: vi.fn((left: string, right: string) => left === right),
  },
  db: {
    serverGetArticleById: vi.fn(),
    serverGetDeletedArticles: vi.fn(),
    serverGetScheduledArticles: vi.fn(),
    serverGetSetting: vi.fn(),
    serverPurgeArticle: vi.fn(),
    serverUpdateArticle: vi.fn(),
  },
  images: {
    serverMigrateBodyImages: vi.fn(),
    serverUploadImageUrl: vi.fn(),
  },
  portalPublication: {
    publishArticleToPortals: vi.fn(),
  },
  newsletter: {
    notifyNewsletterOnPublish: vi.fn(),
  },
}));

vi.mock("next/cache", () => ({
  revalidateTag: mocks.cache.revalidateTag,
}));

vi.mock("@/lib/cookie-auth", () => mocks.cookieAuth);
vi.mock("@/lib/db-server", () => mocks.db);
vi.mock("@/lib/server-upload-image", () => mocks.images);
vi.mock("@/lib/portal-publication", () => mocks.portalPublication);
vi.mock("@/lib/newsletter-notify", () => mocks.newsletter);

import { GET, POST } from "@/app/api/cron/publish/route";

function request(method: "GET" | "POST", bearer = "") {
  return new NextRequest("https://culturepeople.co.kr/api/cron/publish", {
    method,
    headers: bearer ? { authorization: bearer } : undefined,
  });
}

describe("/api/cron/publish", () => {
  afterEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
    vi.useRealTimers();
  });

  it("rejects manual POST execution when admin authentication is missing", async () => {
    mocks.cookieAuth.isAuthenticated.mockResolvedValueOnce(false);

    const response = await POST(request("POST"));
    const json = await response.json();

    expect(response.status).toBe(401);
    expect(json).toEqual({ success: false, error: "Unauthorized" });
    expect(mocks.db.serverGetScheduledArticles).not.toHaveBeenCalled();
  });

  it("publishes scheduled articles, migrates external media, purges expired trash, and sends notifications", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-20T00:00:00.000Z"));
    mocks.cookieAuth.isAuthenticated.mockResolvedValueOnce(true);
    mocks.db.serverGetScheduledArticles.mockResolvedValueOnce([
      {
        id: "scheduled-1",
        no: 123,
        title: "예약 기사",
        body: "<p>요약</p>",
        thumbnail: "https://cdn.example.com/thumb.jpg",
      },
    ]);
    mocks.db.serverGetArticleById.mockResolvedValueOnce({
      id: "scheduled-1",
      body: '<p><img src="https://cdn.example.com/body.jpg"></p>',
      thumbnail: "https://cdn.example.com/thumb.jpg",
    });
    mocks.images.serverMigrateBodyImages.mockResolvedValueOnce("<p>migrated body</p>");
    mocks.images.serverUploadImageUrl.mockResolvedValueOnce("https://culturepeople.co.kr/images/thumb.webp");
    mocks.db.serverGetSetting.mockResolvedValueOnce({ retentionDays: 30 });
    mocks.db.serverGetDeletedArticles.mockResolvedValueOnce([
      { id: "old-trash", deletedAt: "2026-04-01T00:00:00.000Z" },
      { id: "recent-trash", deletedAt: "2026-05-10T00:00:00.000Z" },
    ]);

    const response = await POST(request("POST"));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json).toMatchObject({
      success: true,
      published: 1,
      purged: 1,
      articles: [{ id: "scheduled-1", title: "예약 기사" }],
    });
    expect(mocks.images.serverMigrateBodyImages).toHaveBeenCalledWith(
      '<p><img src="https://cdn.example.com/body.jpg"></p>',
    );
    expect(mocks.images.serverUploadImageUrl).toHaveBeenCalledWith("https://cdn.example.com/thumb.jpg");
    expect(mocks.db.serverUpdateArticle).toHaveBeenCalledWith(
      "scheduled-1",
      expect.objectContaining({
        body: "<p>migrated body</p>",
        thumbnail: "https://culturepeople.co.kr/images/thumb.webp",
        updatedAt: "2026-05-20T00:00:00.000Z",
      }),
    );
    expect(mocks.db.serverPurgeArticle).toHaveBeenCalledTimes(1);
    expect(mocks.db.serverPurgeArticle).toHaveBeenCalledWith("old-trash");
    expect(mocks.portalPublication.publishArticleToPortals).toHaveBeenCalledWith(expect.objectContaining({
      articleId: "scheduled-1",
      articleNo: 123,
      status: "게시",
      source: "scheduled",
    }));
    expect(mocks.newsletter.notifyNewsletterOnPublish).toHaveBeenCalledWith(
      expect.objectContaining({ id: "scheduled-1", title: "예약 기사" }),
    );
    expect(mocks.cache.revalidateTag).toHaveBeenCalledWith("articles");
  });

  it("continues publishing when image migration fails", async () => {
    mocks.cookieAuth.isAuthenticated.mockResolvedValueOnce(true);
    mocks.db.serverGetScheduledArticles.mockResolvedValueOnce([
      { id: "scheduled-2", no: 124, title: "이미지 실패 기사", body: "<p>본문</p>", thumbnail: "https://cdn.example.com/thumb.jpg" },
    ]);
    mocks.db.serverGetArticleById.mockResolvedValueOnce(null);
    mocks.images.serverMigrateBodyImages.mockRejectedValueOnce(new Error("image host timeout"));
    mocks.db.serverGetSetting.mockResolvedValueOnce({ retentionDays: 30 });
    mocks.db.serverGetDeletedArticles.mockResolvedValueOnce([]);

    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const response = await POST(request("POST"));
    const json = await response.json();
    warnSpy.mockRestore();

    expect(response.status).toBe(200);
    expect(json).toMatchObject({ success: true, published: 1, purged: 0 });
    expect(mocks.db.serverUpdateArticle).toHaveBeenCalledWith(
      "scheduled-2",
      expect.objectContaining({
        body: "<p>본문</p>",
        thumbnail: "https://cdn.example.com/thumb.jpg",
      }),
    );
  });

  it("runs from GET only with a valid CRON_SECRET bearer token", async () => {
    vi.stubEnv("CRON_SECRET", "cron-secret");
    mocks.db.serverGetScheduledArticles.mockResolvedValueOnce([]);
    mocks.db.serverGetSetting.mockResolvedValueOnce({ retentionDays: 30 });
    mocks.db.serverGetDeletedArticles.mockResolvedValueOnce([]);

    const authorized = await GET(request("GET", "Bearer cron-secret"));
    const authorizedJson = await authorized.json();
    const unauthenticated = await GET(request("GET"));
    const unauthenticatedJson = await unauthenticated.json();

    expect(authorized.status).toBe(200);
    expect(authorizedJson).toMatchObject({ success: true, published: 0, purged: 0 });
    expect(unauthenticated.status).toBe(200);
    expect(unauthenticatedJson).toEqual({
      status: "ok",
      message: "Use POST to execute manually",
      enabled: true,
    });
    expect(mocks.db.serverGetScheduledArticles).toHaveBeenCalledTimes(1);
  });
});
