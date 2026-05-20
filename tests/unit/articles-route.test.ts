import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("server-only", () => ({}));

const mocks = vi.hoisted(() => ({
  serverGetArticleById: vi.fn(),
  serverCreateArticle: vi.fn(),
  serverUpdateArticle: vi.fn(),
  serverDeleteArticle: vi.fn(),
  serverRestoreArticle: vi.fn(),
  serverPurgeArticle: vi.fn(),
  serverGetSetting: vi.fn(),
  serverSaveSetting: vi.fn(),
  serverGetFilteredArticles: vi.fn(),
  serverMigrateBodyImages: vi.fn(),
  serverUploadImageUrl: vi.fn(),
  isAuthenticated: vi.fn(),
  verifyAuthToken: vi.fn(),
  timingSafeEqual: vi.fn(),
  notifyNewsletterOnPublish: vi.fn(),
  notifyIndexNow: vi.fn(),
  submitGooglePing: vi.fn(),
  revalidateTag: vi.fn(),
}));

vi.mock("@/lib/db-server", () => ({
  serverGetArticleById: mocks.serverGetArticleById,
  serverCreateArticle: mocks.serverCreateArticle,
  serverUpdateArticle: mocks.serverUpdateArticle,
  serverDeleteArticle: mocks.serverDeleteArticle,
  serverRestoreArticle: mocks.serverRestoreArticle,
  serverPurgeArticle: mocks.serverPurgeArticle,
  serverGetSetting: mocks.serverGetSetting,
  serverSaveSetting: mocks.serverSaveSetting,
  serverGetFilteredArticles: mocks.serverGetFilteredArticles,
}));

vi.mock("@/lib/server-upload-image", () => ({
  serverMigrateBodyImages: mocks.serverMigrateBodyImages,
  serverUploadImageUrl: mocks.serverUploadImageUrl,
}));

vi.mock("@/lib/cookie-auth", () => ({
  isAuthenticated: mocks.isAuthenticated,
  verifyAuthToken: mocks.verifyAuthToken,
  timingSafeEqual: mocks.timingSafeEqual,
}));

vi.mock("@/lib/newsletter-notify", () => ({
  notifyNewsletterOnPublish: mocks.notifyNewsletterOnPublish,
}));

vi.mock("@/lib/notify-search", () => ({
  notifyIndexNow: mocks.notifyIndexNow,
  submitGooglePing: mocks.submitGooglePing,
}));

vi.mock("next/cache", () => ({
  revalidateTag: mocks.revalidateTag,
}));

import { DELETE, GET, PATCH, POST } from "@/app/api/db/articles/route";

function jsonRequest(method: "POST" | "PATCH", body: unknown, cookie = "cp-admin-auth=valid") {
  return new NextRequest("https://culturepeople.co.kr/api/db/articles", {
    method,
    headers: {
      "content-type": "application/json",
      cookie,
    },
    body: JSON.stringify(body),
  });
}

function getRequest(query = "", cookie?: string) {
  return new NextRequest(`https://culturepeople.co.kr/api/db/articles${query}`, {
    method: "GET",
    headers: cookie ? { cookie } : undefined,
  });
}

function deleteRequest(query: string, init: { cookie?: string; authorization?: string } = {}) {
  return new NextRequest(`https://culturepeople.co.kr/api/db/articles${query}`, {
    method: "DELETE",
    headers: {
      ...(init.cookie ? { cookie: init.cookie } : {}),
      ...(init.authorization ? { authorization: init.authorization } : {}),
    },
  });
}

describe("/api/db/articles route", () => {
  afterEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
  });

  it("serves public filtered article lists with a safe public limit cap", async () => {
    mocks.isAuthenticated.mockResolvedValue(false);
    mocks.serverGetFilteredArticles.mockResolvedValue({
      articles: [{ id: "a1", title: "Public", status: "게시" }],
      total: 1,
    });

    const response = await GET(getRequest("?page=2&limit=1000&q=문화&category=공연&status=게시"));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toContain("s-maxage=60");
    expect(json).toMatchObject({ success: true, total: 1, page: 2, limit: 200 });
    expect(mocks.serverGetFilteredArticles).toHaveBeenCalledWith({
      q: "문화",
      category: "공연",
      status: "게시",
      page: 2,
      limit: 200,
      authed: false,
    });
  });

  it("blocks unauthenticated draft article list access", async () => {
    mocks.isAuthenticated.mockResolvedValue(false);

    const response = await GET(getRequest("?status=임시저장"));
    const json = await response.json();

    expect(response.status).toBe(401);
    expect(json.success).toBe(false);
    expect(mocks.serverGetFilteredArticles).not.toHaveBeenCalled();
  });

  it("creates published articles as admins and migrates remote images first", async () => {
    mocks.verifyAuthToken.mockResolvedValue({ valid: true, role: "admin" });
    mocks.serverMigrateBodyImages.mockResolvedValue("<p>migrated</p>");
    mocks.serverUploadImageUrl.mockResolvedValue("https://cdn.example/thumb.jpg");
    mocks.serverCreateArticle.mockResolvedValue(77);
    mocks.notifyNewsletterOnPublish.mockResolvedValue(undefined);
    mocks.notifyIndexNow.mockResolvedValue(undefined);
    mocks.submitGooglePing.mockResolvedValue(undefined);

    const response = await POST(jsonRequest("POST", {
      title: "새 기사",
      category: "문화",
      status: "게시",
      body: "<p><img src=\"https://remote.example/a.jpg\"></p>",
      thumbnail: "https://remote.example/thumb.jpg",
      _distribute: { indexNow: true, googlePing: true },
    }));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json).toMatchObject({ success: true, no: 77 });
    expect(mocks.serverCreateArticle).toHaveBeenCalledWith(expect.objectContaining({
      title: "새 기사",
      status: "게시",
      body: "<p>migrated</p>",
      thumbnail: "https://cdn.example/thumb.jpg",
    }));
    expect(mocks.revalidateTag).toHaveBeenCalledWith("articles");
    expect(mocks.notifyIndexNow).toHaveBeenCalledWith(77, "URL_UPDATED");
    expect(mocks.submitGooglePing).toHaveBeenCalled();
    expect(mocks.notifyNewsletterOnPublish).toHaveBeenCalledWith(expect.objectContaining({ no: 77 }));
  });

  it("blocks reporters from directly creating published articles", async () => {
    mocks.verifyAuthToken.mockResolvedValue({ valid: true, role: "reporter" });

    const response = await POST(jsonRequest("POST", {
      title: "기자 작성",
      category: "문화",
      status: "게시",
      body: "<p>body</p>",
    }));
    const json = await response.json();

    expect(response.status).toBe(403);
    expect(json.success).toBe(false);
    expect(mocks.serverCreateArticle).not.toHaveBeenCalled();
  });

  it("publishes draft updates through admin-only PATCH flow", async () => {
    mocks.verifyAuthToken.mockResolvedValue({ valid: true, role: "admin" });
    mocks.serverGetArticleById.mockResolvedValue({
      id: "draft-1",
      no: 88,
      title: "기존 초안",
      status: "임시저장",
      body: "<p>old</p>",
      thumbnail: "https://remote.example/old.jpg",
    });
    mocks.serverMigrateBodyImages.mockResolvedValue("<p>published</p>");
    mocks.serverUploadImageUrl.mockResolvedValue("https://cdn.example/new.jpg");
    mocks.serverUpdateArticle.mockResolvedValue(undefined);
    mocks.notifyNewsletterOnPublish.mockResolvedValue(undefined);
    mocks.notifyIndexNow.mockResolvedValue(undefined);
    mocks.submitGooglePing.mockResolvedValue(undefined);

    const response = await PATCH(jsonRequest("PATCH", {
      id: "draft-1",
      title: "게시 전환",
      status: "게시",
      body: "<p><img src=\"https://remote.example/new.jpg\"></p>",
      thumbnail: "https://remote.example/new.jpg",
      _distribute: { googlePing: true },
    }));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.success).toBe(true);
    expect(mocks.serverUpdateArticle).toHaveBeenCalledWith("draft-1", expect.objectContaining({
      title: "게시 전환",
      status: "게시",
      body: "<p>published</p>",
      thumbnail: "https://cdn.example/new.jpg",
      updatedAt: expect.any(String),
    }));
    expect(mocks.notifyIndexNow).toHaveBeenCalledWith(88, "URL_UPDATED");
    expect(mocks.notifyNewsletterOnPublish).toHaveBeenCalledWith(expect.objectContaining({
      id: "draft-1",
      title: "게시 전환",
      status: "게시",
    }));
  });

  it("allows CRON_SECRET bearer deletes while still blocking reporter deletes", async () => {
    vi.stubEnv("CRON_SECRET", "cron-secret");
    mocks.verifyAuthToken
      .mockResolvedValueOnce({ valid: true, role: "reporter" })
      .mockResolvedValueOnce({ valid: false });
    mocks.timingSafeEqual.mockReturnValue(true);
    mocks.serverDeleteArticle.mockResolvedValue(undefined);
    mocks.notifyIndexNow.mockResolvedValue(undefined);

    const reporterResponse = await DELETE(deleteRequest("?id=article-1", { cookie: "cp-admin-auth=reporter" }));
    const reporterJson = await reporterResponse.json();
    const cronResponse = await DELETE(deleteRequest("?id=article-1", { authorization: "Bearer cron-secret" }));
    const cronJson = await cronResponse.json();

    expect(reporterResponse.status).toBe(403);
    expect(reporterJson.success).toBe(false);
    expect(cronResponse.status).toBe(200);
    expect(cronJson.success).toBe(true);
    expect(mocks.serverDeleteArticle).toHaveBeenCalledTimes(1);
    expect(mocks.serverDeleteArticle).toHaveBeenCalledWith("article-1");
    expect(mocks.notifyIndexNow).toHaveBeenCalledWith("article-1", "URL_DELETED");
  });
});
