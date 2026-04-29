import { afterEach, describe, expect, it, vi } from "vitest";
import type { Article, DistributeLog } from "@/types/article";

vi.mock("server-only", () => ({}));

const mocks = vi.hoisted(() => ({
  cache: {
    revalidateTag: vi.fn(),
  },
  supabase: {
    sbGetArticles: vi.fn(),
    sbGetArticlesByCategory: vi.fn(),
    sbGetArticlesByTag: vi.fn(),
    sbSearchArticles: vi.fn(),
    sbGetArticleById: vi.fn(),
    sbGetArticleByNo: vi.fn(),
    sbGetPublishedArticles: vi.fn(),
    sbGetRecentArticles: vi.fn(),
    sbGetFeedArticles: vi.fn(),
    sbGetArticlesByAuthor: vi.fn(),
    sbGetHomeArticles: vi.fn(),
    sbGetMaintenanceArticles: vi.fn(),
    sbGetArticleSitemapData: vi.fn(),
    sbGetScheduledArticles: vi.fn(),
    sbGetRecentTitles: vi.fn(),
    sbGetTopArticles: vi.fn(),
    sbGetFilteredArticles: vi.fn(),
    sbGetSetting: vi.fn(),
    sbSaveSetting: vi.fn(),
    sbCreateArticle: vi.fn(),
    sbUpdateArticle: vi.fn(),
    sbDeleteArticle: vi.fn(),
    sbPurgeArticle: vi.fn(),
    sbGetDeletedArticles: vi.fn(),
    sbIncrementViews: vi.fn(),
    sbGetMaxArticleNo: vi.fn(),
    sbGetNextArticleNo: vi.fn(),
    sbGetComments: vi.fn(),
    sbCreateComment: vi.fn(),
    sbUpdateCommentStatus: vi.fn(),
    sbDeleteComment: vi.fn(),
    sbGetNotifications: vi.fn(),
    sbCountUnreadNotifications: vi.fn(),
    sbCreateNotification: vi.fn(),
    sbMarkNotificationsRead: vi.fn(),
    sbDeleteAllNotifications: vi.fn(),
  },
  d1: {
    d1AddDistributeLogs: vi.fn(),
    d1AddViewLog: vi.fn(),
    d1ClearDistributeLogs: vi.fn(),
    d1CreateArticle: vi.fn(),
    d1CreateComment: vi.fn(),
    d1CreateNotification: vi.fn(),
    d1DeleteArticle: vi.fn(),
    d1DeleteComment: vi.fn(),
    d1DeleteAllNotifications: vi.fn(),
    d1GetDistributeLogs: vi.fn(),
    d1GetDeletedArticles: vi.fn(),
    d1GetArticleSitemapData: vi.fn(),
    d1GetArticlesByAuthor: vi.fn(),
    d1GetArticlesByCategory: vi.fn(),
    d1GetArticlesByTag: vi.fn(),
    d1GetArticleById: vi.fn(),
    d1GetArticleByNo: vi.fn(),
    d1GetFeedArticles: vi.fn(),
    d1GetNotifications: vi.fn(),
    d1GetComments: vi.fn(),
    d1GetFilteredArticles: vi.fn(),
    d1GetHomeArticles: vi.fn(),
    d1GetMaintenanceArticles: vi.fn(),
    d1GetMaxArticleNo: vi.fn(),
    d1GetPublishedArticles: vi.fn(),
    d1GetRecentArticles: vi.fn(),
    d1GetRecentTitles: vi.fn(),
    d1GetScheduledArticles: vi.fn(),
    d1GetSetting: vi.fn(),
    d1GetTopArticles: vi.fn(),
    d1GetViewLogs: vi.fn(),
    d1CountUnreadNotifications: vi.fn(),
    d1IncrementViews: vi.fn(),
    d1MarkNotificationsRead: vi.fn(),
    d1PurgeArticle: vi.fn(),
    d1SaveSetting: vi.fn(),
    d1SearchArticles: vi.fn(),
    d1UpdateArticle: vi.fn(),
    d1UpdateCommentStatus: vi.fn(),
  },
  telegram: {
    notifyTelegramDbNotification: vi.fn(),
  },
  settingsStore: {
    readSiteSetting: vi.fn(),
    writeSiteSetting: vi.fn(),
  },
}));

vi.mock("next/cache", () => ({
  unstable_cache: (fn: () => unknown) => fn,
  revalidateTag: mocks.cache.revalidateTag,
}));

vi.mock("@/lib/supabase-server-db", () => mocks.supabase);
vi.mock("@/lib/d1-server-db", () => mocks.d1);
vi.mock("@/lib/telegram-notify", () => mocks.telegram);
vi.mock("@/lib/site-settings-store", () => mocks.settingsStore);

function enableD1ReadAdapter() {
  vi.stubEnv("D1_READ_ADAPTER_ENABLED", "true");
  vi.stubEnv("CLOUDFLARE_ACCOUNT_ID", "account-id");
  vi.stubEnv("CLOUDFLARE_D1_DATABASE_ID", "database-id");
  vi.stubEnv("CLOUDFLARE_API_TOKEN", "token");
}

function writableArticle(overrides: Partial<Article> = {}): Article {
  return {
    id: "a1",
    no: 1,
    title: "Article",
    category: "\uB274\uC2A4",
    date: "2026-04-29",
    status: "\uAC8C\uC2DC" as Article["status"],
    views: 0,
    body: "",
    ...overrides,
  };
}

describe("server DB D1 read adapter gate", () => {
  afterEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
  });

  it("keeps public reads on Supabase by default", async () => {
    const expected = [{ id: "supabase" }];
    mocks.supabase.sbGetRecentArticles.mockResolvedValueOnce(expected);

    const { serverGetRecentArticles } = await import("@/lib/db-server");

    await expect(serverGetRecentArticles(5)).resolves.toBe(expected);
    expect(mocks.supabase.sbGetRecentArticles).toHaveBeenCalledWith(5);
    expect(mocks.d1.d1GetRecentArticles).not.toHaveBeenCalled();
  });

  it("routes supported public reads to D1 only when the explicit read flag and HTTP API envs exist", async () => {
    enableD1ReadAdapter();
    const expected = [{ id: "d1" }];
    mocks.d1.d1GetRecentArticles.mockResolvedValueOnce(expected);

    const { serverGetRecentArticles } = await import("@/lib/db-server");

    await expect(serverGetRecentArticles(10)).resolves.toBe(expected);
    expect(mocks.d1.d1GetRecentArticles).toHaveBeenCalledWith(10);
    expect(mocks.supabase.sbGetRecentArticles).not.toHaveBeenCalled();
  });

  it("falls back to Supabase when the read flag is set but D1 API credentials are incomplete", async () => {
    vi.stubEnv("D1_READ_ADAPTER_ENABLED", "true");
    const expected = [{ id: "supabase" }];
    mocks.supabase.sbSearchArticles.mockResolvedValueOnce(expected);

    const { serverSearchArticles } = await import("@/lib/db-server");

    await expect(serverSearchArticles("news")).resolves.toBe(expected);
    expect(mocks.supabase.sbSearchArticles).toHaveBeenCalledWith("news");
    expect(mocks.d1.d1SearchArticles).not.toHaveBeenCalled();
  });

  it("routes admin filtered reads and settings to D1 behind the same read gate", async () => {
    enableD1ReadAdapter();
    const filtered = { articles: [{ id: "d1" }], total: 1 };
    mocks.d1.d1GetFilteredArticles.mockResolvedValueOnce(filtered);
    mocks.settingsStore.readSiteSetting.mockResolvedValueOnce({ enabled: true });

    const { serverGetFilteredArticles, serverGetSetting } = await import("@/lib/db-server");

    await expect(serverGetFilteredArticles({ q: "news", page: 1, limit: 10, authed: true })).resolves.toBe(filtered);
    await expect(serverGetSetting("cp-auto-press-settings", { enabled: false })).resolves.toEqual({ enabled: true });
    expect(mocks.d1.d1GetFilteredArticles).toHaveBeenCalledWith({ q: "news", page: 1, limit: 10, authed: true });
    expect(mocks.settingsStore.readSiteSetting).toHaveBeenCalledWith("cp-auto-press-settings", { enabled: false });
    expect(mocks.supabase.sbGetFilteredArticles).not.toHaveBeenCalled();
    expect(mocks.supabase.sbGetSetting).not.toHaveBeenCalled();
  });

  it("routes expanded public article reads to D1 behind the read gate", async () => {
    enableD1ReadAdapter();
    const expected = [{ id: "d1" }];
    const sitemap = [{ no: 1, date: "2026-04-29" }];
    mocks.d1.d1GetArticlesByCategory.mockResolvedValueOnce(expected);
    mocks.d1.d1GetArticlesByTag.mockResolvedValueOnce(expected);
    mocks.d1.d1GetFeedArticles.mockResolvedValueOnce(expected);
    mocks.d1.d1GetArticlesByAuthor.mockResolvedValueOnce(expected);
    mocks.d1.d1GetHomeArticles.mockResolvedValueOnce(expected);
    mocks.d1.d1GetTopArticles.mockResolvedValueOnce(expected);
    mocks.d1.d1GetArticleSitemapData.mockResolvedValueOnce(sitemap);

    const {
      serverGetArticleSitemapData,
      serverGetArticlesByAuthor,
      serverGetArticlesByCategory,
      serverGetArticlesByTag,
      serverGetFeedArticles,
      serverGetHomeArticles,
      serverGetTopArticles,
    } = await import("@/lib/db-server");

    await expect(serverGetArticlesByCategory("\uB274\uC2A4")).resolves.toBe(expected);
    await expect(serverGetArticlesByTag("culture")).resolves.toBe(expected);
    await expect(serverGetFeedArticles({ limit: 20, includeBody: true })).resolves.toBe(expected);
    await expect(serverGetArticlesByAuthor("Reporter", 5)).resolves.toBe(expected);
    await expect(serverGetHomeArticles(12)).resolves.toBe(expected);
    await expect(serverGetTopArticles(5)).resolves.toBe(expected);
    await expect(serverGetArticleSitemapData()).resolves.toBe(sitemap);

    expect(mocks.d1.d1GetArticlesByCategory).toHaveBeenCalledWith("\uB274\uC2A4");
    expect(mocks.d1.d1GetArticlesByTag).toHaveBeenCalledWith("culture");
    expect(mocks.d1.d1GetFeedArticles).toHaveBeenCalledWith({ limit: 20, includeBody: true });
    expect(mocks.d1.d1GetArticlesByAuthor).toHaveBeenCalledWith("Reporter", 5);
    expect(mocks.d1.d1GetHomeArticles).toHaveBeenCalledWith(12);
    expect(mocks.d1.d1GetTopArticles).toHaveBeenCalledWith(5);
    expect(mocks.d1.d1GetArticleSitemapData).toHaveBeenCalled();
    expect(mocks.supabase.sbGetArticlesByCategory).not.toHaveBeenCalled();
    expect(mocks.supabase.sbGetFeedArticles).not.toHaveBeenCalled();
    expect(mocks.supabase.sbGetTopArticles).not.toHaveBeenCalled();
  });

  it("routes operational article reads to D1 behind the read gate", async () => {
    enableD1ReadAdapter();
    const articles = [{ id: "d1" }];
    const titles = [{ title: "Existing", sourceUrl: "https://example.com/source" }];
    mocks.d1.d1GetMaintenanceArticles.mockResolvedValueOnce(articles);
    mocks.d1.d1GetScheduledArticles.mockResolvedValueOnce(articles);
    mocks.d1.d1GetRecentTitles.mockResolvedValueOnce(titles);
    mocks.d1.d1GetDeletedArticles.mockResolvedValueOnce(articles);

    const {
      serverGetDeletedArticles,
      serverGetMaintenanceArticles,
      serverGetRecentTitles,
      serverGetScheduledArticles,
    } = await import("@/lib/db-server");

    await expect(serverGetMaintenanceArticles({ page: 2, limit: 50, since: "2026-04-01", includeBody: true })).resolves.toBe(articles);
    await expect(serverGetScheduledArticles()).resolves.toBe(articles);
    await expect(serverGetRecentTitles(7)).resolves.toBe(titles);
    await expect(serverGetDeletedArticles()).resolves.toBe(articles);

    expect(mocks.d1.d1GetMaintenanceArticles).toHaveBeenCalledWith({ page: 2, limit: 50, since: "2026-04-01", includeBody: true });
    expect(mocks.d1.d1GetScheduledArticles).toHaveBeenCalled();
    expect(mocks.d1.d1GetRecentTitles).toHaveBeenCalledWith(7);
    expect(mocks.d1.d1GetDeletedArticles).toHaveBeenCalled();
    expect(mocks.supabase.sbGetMaintenanceArticles).not.toHaveBeenCalled();
    expect(mocks.supabase.sbGetScheduledArticles).not.toHaveBeenCalled();
    expect(mocks.supabase.sbGetRecentTitles).not.toHaveBeenCalled();
    expect(mocks.supabase.sbGetDeletedArticles).not.toHaveBeenCalled();
  });

  it("delegates setting writes to the shared site settings store", async () => {
    mocks.settingsStore.writeSiteSetting.mockResolvedValueOnce(undefined);

    const { serverSaveSetting } = await import("@/lib/db-server");

    await expect(serverSaveSetting("cp-auto-press-settings", { enabled: true })).resolves.toBeUndefined();
    expect(mocks.settingsStore.writeSiteSetting).toHaveBeenCalledWith("cp-auto-press-settings", { enabled: true });
    expect(mocks.supabase.sbSaveSetting).not.toHaveBeenCalled();
    expect(mocks.d1.d1SaveSetting).not.toHaveBeenCalled();
    expect(mocks.cache.revalidateTag).toHaveBeenCalledWith("setting:cp-auto-press-settings");
  });

  it("surfaces shared setting store write errors before cache revalidation", async () => {
    mocks.settingsStore.writeSiteSetting.mockRejectedValueOnce(new Error("settings unavailable"));

    const { serverSaveSetting } = await import("@/lib/db-server");

    await expect(serverSaveSetting("cp-auto-press-settings", { enabled: true })).rejects.toThrow("settings unavailable");
    expect(mocks.cache.revalidateTag).not.toHaveBeenCalledWith("setting:cp-auto-press-settings");
  });

  it("keeps article writes Supabase-only by default", async () => {
    const article = writableArticle();
    mocks.supabase.sbCreateArticle.mockResolvedValueOnce(undefined);

    const { serverCreateArticle } = await import("@/lib/db-server");

    await expect(serverCreateArticle(article)).resolves.toBe(1);
    expect(mocks.supabase.sbCreateArticle).toHaveBeenCalledWith({ ...article, id: "1" });
    expect(mocks.d1.d1CreateArticle).not.toHaveBeenCalled();
  });

  it("dual-writes article create/update/delete/purge to D1 only when explicitly enabled and configured", async () => {
    vi.stubEnv("D1_ARTICLES_DUAL_WRITE_ENABLED", "true");
    vi.stubEnv("CLOUDFLARE_ACCOUNT_ID", "account-id");
    vi.stubEnv("CLOUDFLARE_D1_DATABASE_ID", "database-id");
    vi.stubEnv("CLOUDFLARE_API_TOKEN", "token");
    const article = writableArticle();
    mocks.supabase.sbCreateArticle.mockResolvedValueOnce(undefined);
    mocks.supabase.sbUpdateArticle.mockResolvedValueOnce(undefined);
    mocks.supabase.sbDeleteArticle.mockResolvedValueOnce(undefined);
    mocks.supabase.sbPurgeArticle.mockResolvedValueOnce(undefined);
    mocks.d1.d1CreateArticle.mockResolvedValueOnce(undefined);
    mocks.d1.d1UpdateArticle.mockResolvedValueOnce(undefined);
    mocks.d1.d1DeleteArticle.mockResolvedValueOnce(undefined);
    mocks.d1.d1PurgeArticle.mockResolvedValueOnce(undefined);

    const {
      serverCreateArticle,
      serverDeleteArticle,
      serverPurgeArticle,
      serverUpdateArticle,
    } = await import("@/lib/db-server");

    await expect(serverCreateArticle(article)).resolves.toBe(1);
    await expect(serverUpdateArticle("a1", { title: "Updated" })).resolves.toBeUndefined();
    await expect(serverDeleteArticle("a1")).resolves.toBeUndefined();
    await expect(serverPurgeArticle("a1")).resolves.toBeUndefined();

    expect(mocks.d1.d1CreateArticle).toHaveBeenCalledWith({ ...article, id: "1" });
    expect(mocks.d1.d1UpdateArticle).toHaveBeenCalledWith("a1", { title: "Updated" });
    expect(mocks.d1.d1DeleteArticle).toHaveBeenCalledWith("a1");
    expect(mocks.d1.d1PurgeArticle).toHaveBeenCalledWith("a1");
  });

  it("writes article create/update/delete/purge to D1 primary only after DATABASE_PROVIDER=d1 cutover", async () => {
    vi.stubEnv("DATABASE_PROVIDER", "d1");
    enableD1ReadAdapter();
    const article = writableArticle();
    mocks.d1.d1CreateArticle.mockResolvedValueOnce(undefined);
    mocks.d1.d1UpdateArticle.mockResolvedValueOnce(undefined);
    mocks.d1.d1DeleteArticle.mockResolvedValueOnce(undefined);
    mocks.d1.d1PurgeArticle.mockResolvedValueOnce(undefined);

    const {
      serverCreateArticle,
      serverDeleteArticle,
      serverPurgeArticle,
      serverUpdateArticle,
    } = await import("@/lib/db-server");

    await expect(serverCreateArticle(article)).resolves.toBe(1);
    await expect(serverUpdateArticle("a1", { title: "Updated" })).resolves.toBeUndefined();
    await expect(serverDeleteArticle("a1")).resolves.toBeUndefined();
    await expect(serverPurgeArticle("a1")).resolves.toBeUndefined();

    expect(mocks.d1.d1CreateArticle).toHaveBeenCalledWith({ ...article, id: "1" });
    expect(mocks.d1.d1UpdateArticle).toHaveBeenCalledWith("a1", { title: "Updated" });
    expect(mocks.d1.d1DeleteArticle).toHaveBeenCalledWith("a1");
    expect(mocks.d1.d1PurgeArticle).toHaveBeenCalledWith("a1");
    expect(mocks.supabase.sbCreateArticle).not.toHaveBeenCalled();
    expect(mocks.supabase.sbUpdateArticle).not.toHaveBeenCalled();
    expect(mocks.supabase.sbDeleteArticle).not.toHaveBeenCalled();
    expect(mocks.supabase.sbPurgeArticle).not.toHaveBeenCalled();
  });

  it("uses D1 max article number and site setting counter for D1 primary article numbers", async () => {
    vi.stubEnv("DATABASE_PROVIDER", "d1");
    enableD1ReadAdapter();
    const article = writableArticle({ id: "", no: undefined });
    mocks.d1.d1GetMaxArticleNo.mockResolvedValueOnce(41);
    mocks.settingsStore.readSiteSetting.mockResolvedValueOnce(50);
    mocks.settingsStore.writeSiteSetting.mockResolvedValueOnce(undefined);
    mocks.d1.d1CreateArticle.mockResolvedValueOnce(undefined);

    const { serverCreateArticle } = await import("@/lib/db-server");

    await expect(serverCreateArticle(article)).resolves.toBe(51);
    expect(mocks.d1.d1GetMaxArticleNo).toHaveBeenCalled();
    expect(mocks.settingsStore.readSiteSetting).toHaveBeenCalledWith("cp-article-counter", 0, { useServiceKey: true });
    expect(mocks.settingsStore.writeSiteSetting).toHaveBeenCalledWith("cp-article-counter", 51);
    expect(mocks.d1.d1CreateArticle).toHaveBeenCalledWith(expect.objectContaining({ id: "51", no: 51 }));
    expect(mocks.supabase.sbGetMaxArticleNo).not.toHaveBeenCalled();
    expect(mocks.supabase.sbGetNextArticleNo).not.toHaveBeenCalled();
    expect(mocks.supabase.sbCreateArticle).not.toHaveBeenCalled();
  });

  it("does not fail article writes on best-effort D1 dual-write errors", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.stubEnv("D1_ARTICLES_DUAL_WRITE_ENABLED", "true");
    vi.stubEnv("CLOUDFLARE_ACCOUNT_ID", "account-id");
    vi.stubEnv("CLOUDFLARE_D1_DATABASE_ID", "database-id");
    vi.stubEnv("CLOUDFLARE_API_TOKEN", "token");
    mocks.supabase.sbUpdateArticle.mockResolvedValueOnce(undefined);
    mocks.d1.d1UpdateArticle.mockRejectedValueOnce(new Error("D1 unavailable"));

    const { serverUpdateArticle } = await import("@/lib/db-server");

    await expect(serverUpdateArticle("a1", { title: "Updated" })).resolves.toBeUndefined();
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it("can make D1 article dual-write strict during migration verification", async () => {
    vi.stubEnv("D1_ARTICLES_DUAL_WRITE_ENABLED", "true");
    vi.stubEnv("D1_ARTICLES_DUAL_WRITE_STRICT", "true");
    vi.stubEnv("CLOUDFLARE_ACCOUNT_ID", "account-id");
    vi.stubEnv("CLOUDFLARE_D1_DATABASE_ID", "database-id");
    vi.stubEnv("CLOUDFLARE_API_TOKEN", "token");
    mocks.supabase.sbUpdateArticle.mockResolvedValueOnce(undefined);
    mocks.d1.d1UpdateArticle.mockRejectedValueOnce(new Error("D1 unavailable"));

    const { serverUpdateArticle } = await import("@/lib/db-server");

    await expect(serverUpdateArticle("a1", { title: "Updated" })).rejects.toThrow("D1 unavailable");
  });

  it("keeps article view increments on Supabase by default", async () => {
    mocks.supabase.sbIncrementViews.mockResolvedValueOnce(undefined);

    const { serverIncrementViews } = await import("@/lib/db-server");

    await expect(serverIncrementViews("a1")).resolves.toBeUndefined();
    expect(mocks.supabase.sbIncrementViews).toHaveBeenCalledWith("a1");
    expect(mocks.d1.d1IncrementViews).not.toHaveBeenCalled();
  });

  it("dual-writes article view increments to D1 with the article dual-write flag", async () => {
    vi.stubEnv("D1_ARTICLES_DUAL_WRITE_ENABLED", "true");
    vi.stubEnv("CLOUDFLARE_ACCOUNT_ID", "account-id");
    vi.stubEnv("CLOUDFLARE_D1_DATABASE_ID", "database-id");
    vi.stubEnv("CLOUDFLARE_API_TOKEN", "token");
    mocks.supabase.sbIncrementViews.mockResolvedValueOnce(undefined);
    mocks.d1.d1IncrementViews.mockResolvedValueOnce(undefined);

    const { serverIncrementViews } = await import("@/lib/db-server");

    await expect(serverIncrementViews("a1")).resolves.toBeUndefined();
    expect(mocks.supabase.sbIncrementViews).toHaveBeenCalledWith("a1");
    expect(mocks.d1.d1IncrementViews).toHaveBeenCalledWith("a1");
  });

  it("increments article views in D1 primary only after DATABASE_PROVIDER=d1 cutover", async () => {
    vi.stubEnv("DATABASE_PROVIDER", "d1");
    enableD1ReadAdapter();
    mocks.d1.d1IncrementViews.mockResolvedValueOnce(undefined);

    const { serverIncrementViews } = await import("@/lib/db-server");

    await expect(serverIncrementViews("a1")).resolves.toBeUndefined();
    expect(mocks.d1.d1IncrementViews).toHaveBeenCalledWith("a1");
    expect(mocks.supabase.sbIncrementViews).not.toHaveBeenCalled();
  });

  it("keeps comments on Supabase by default", async () => {
    const expected = [{ id: "c1" }];
    mocks.supabase.sbGetComments.mockResolvedValueOnce(expected);
    mocks.supabase.sbCreateComment.mockResolvedValueOnce("c1");

    const { serverCreateComment, serverGetComments } = await import("@/lib/db-server");

    await expect(serverGetComments({ articleId: "a1", isAdmin: false })).resolves.toBe(expected);
    await expect(serverCreateComment({
      articleId: "a1",
      author: "Reader",
      content: "Nice",
      status: "pending",
    })).resolves.toBe("c1");
    expect(mocks.supabase.sbGetComments).toHaveBeenCalledWith({ articleId: "a1", isAdmin: false });
    expect(mocks.d1.d1GetComments).not.toHaveBeenCalled();
    expect(mocks.d1.d1CreateComment).not.toHaveBeenCalled();
  });

  it("routes comment reads to D1 only behind the comment read flag", async () => {
    vi.stubEnv("D1_COMMENTS_READ_ADAPTER_ENABLED", "true");
    vi.stubEnv("CLOUDFLARE_ACCOUNT_ID", "account-id");
    vi.stubEnv("CLOUDFLARE_D1_DATABASE_ID", "database-id");
    vi.stubEnv("CLOUDFLARE_API_TOKEN", "token");
    const expected = [{ id: "c1" }];
    mocks.d1.d1GetComments.mockResolvedValueOnce(expected);

    const { serverGetComments } = await import("@/lib/db-server");

    await expect(serverGetComments({ articleId: "a1", isAdmin: true })).resolves.toBe(expected);
    expect(mocks.d1.d1GetComments).toHaveBeenCalledWith({ articleId: "a1", isAdmin: true });
    expect(mocks.supabase.sbGetComments).not.toHaveBeenCalled();
  });

  it("dual-writes comment create/status/delete to D1 only when explicitly enabled and configured", async () => {
    vi.stubEnv("D1_COMMENTS_DUAL_WRITE_ENABLED", "true");
    vi.stubEnv("CLOUDFLARE_ACCOUNT_ID", "account-id");
    vi.stubEnv("CLOUDFLARE_D1_DATABASE_ID", "database-id");
    vi.stubEnv("CLOUDFLARE_API_TOKEN", "token");
    mocks.supabase.sbCreateComment.mockResolvedValueOnce("c1");
    mocks.supabase.sbUpdateCommentStatus.mockResolvedValueOnce(undefined);
    mocks.supabase.sbDeleteComment.mockResolvedValueOnce(undefined);
    mocks.d1.d1CreateComment.mockResolvedValueOnce("c1");
    mocks.d1.d1UpdateCommentStatus.mockResolvedValueOnce(undefined);
    mocks.d1.d1DeleteComment.mockResolvedValueOnce(undefined);

    const {
      serverCreateComment,
      serverDeleteComment,
      serverUpdateCommentStatus,
    } = await import("@/lib/db-server");

    await expect(serverCreateComment({ articleId: "a1", author: "Reader", content: "Nice" })).resolves.toBe("c1");
    await expect(serverUpdateCommentStatus("c1", "approved")).resolves.toBeUndefined();
    await expect(serverDeleteComment("c1")).resolves.toBeUndefined();

    expect(mocks.d1.d1CreateComment).toHaveBeenCalledWith({
      articleId: "a1",
      author: "Reader",
      content: "Nice",
      id: "c1",
    });
    expect(mocks.d1.d1UpdateCommentStatus).toHaveBeenCalledWith("c1", "approved");
    expect(mocks.d1.d1DeleteComment).toHaveBeenCalledWith("c1");
  });

  it("can keep comment dual-write best-effort or strict", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.stubEnv("D1_COMMENTS_DUAL_WRITE_ENABLED", "true");
    vi.stubEnv("CLOUDFLARE_ACCOUNT_ID", "account-id");
    vi.stubEnv("CLOUDFLARE_D1_DATABASE_ID", "database-id");
    vi.stubEnv("CLOUDFLARE_API_TOKEN", "token");
    mocks.supabase.sbUpdateCommentStatus.mockResolvedValueOnce(undefined);
    mocks.d1.d1UpdateCommentStatus.mockRejectedValueOnce(new Error("D1 unavailable"));

    const { serverUpdateCommentStatus } = await import("@/lib/db-server");

    await expect(serverUpdateCommentStatus("c1", "approved")).resolves.toBeUndefined();
    expect(warn).toHaveBeenCalled();

    vi.stubEnv("D1_COMMENTS_DUAL_WRITE_STRICT", "true");
    mocks.supabase.sbUpdateCommentStatus.mockResolvedValueOnce(undefined);
    mocks.d1.d1UpdateCommentStatus.mockRejectedValueOnce(new Error("D1 unavailable"));

    await expect(serverUpdateCommentStatus("c1", "spam")).rejects.toThrow("D1 unavailable");
    warn.mockRestore();
  });

  it("keeps notifications on Supabase by default", async () => {
    const notifications = [{ id: "n1", title: "Saved" }];
    mocks.supabase.sbGetNotifications.mockResolvedValueOnce(notifications);
    mocks.supabase.sbCountUnreadNotifications.mockResolvedValueOnce(2);
    mocks.supabase.sbCreateNotification.mockResolvedValueOnce("n1");
    mocks.supabase.sbMarkNotificationsRead.mockResolvedValueOnce(undefined);
    mocks.supabase.sbDeleteAllNotifications.mockResolvedValueOnce(undefined);

    const {
      serverCountUnreadNotifications,
      serverCreateNotification,
      serverDeleteAllNotifications,
      serverGetNotifications,
      serverMarkNotificationsRead,
    } = await import("@/lib/db-server");

    await expect(serverGetNotifications(10)).resolves.toBe(notifications);
    await expect(serverCountUnreadNotifications()).resolves.toBe(2);
    await expect(serverCreateNotification({ type: "auto_press", title: "Saved" })).resolves.toBe("n1");
    await expect(serverMarkNotificationsRead({ ids: ["n1"] })).resolves.toBeUndefined();
    await expect(serverDeleteAllNotifications()).resolves.toBeUndefined();

    expect(mocks.supabase.sbGetNotifications).toHaveBeenCalledWith(10);
    expect(mocks.supabase.sbCreateNotification).toHaveBeenCalledWith({ type: "auto_press", title: "Saved" });
    expect(mocks.d1.d1GetNotifications).not.toHaveBeenCalled();
    expect(mocks.d1.d1CreateNotification).not.toHaveBeenCalled();
  });

  it("routes notification reads to D1 only behind the notification read flag", async () => {
    vi.stubEnv("D1_NOTIFICATIONS_READ_ADAPTER_ENABLED", "true");
    vi.stubEnv("CLOUDFLARE_ACCOUNT_ID", "account-id");
    vi.stubEnv("CLOUDFLARE_D1_DATABASE_ID", "database-id");
    vi.stubEnv("CLOUDFLARE_API_TOKEN", "token");
    const notifications = [{ id: "n1", title: "Saved" }];
    mocks.d1.d1GetNotifications.mockResolvedValueOnce(notifications);
    mocks.d1.d1CountUnreadNotifications.mockResolvedValueOnce(1);

    const { serverCountUnreadNotifications, serverGetNotifications } = await import("@/lib/db-server");

    await expect(serverGetNotifications(15)).resolves.toBe(notifications);
    await expect(serverCountUnreadNotifications()).resolves.toBe(1);
    expect(mocks.d1.d1GetNotifications).toHaveBeenCalledWith(15);
    expect(mocks.d1.d1CountUnreadNotifications).toHaveBeenCalled();
    expect(mocks.supabase.sbGetNotifications).not.toHaveBeenCalled();
    expect(mocks.supabase.sbCountUnreadNotifications).not.toHaveBeenCalled();
  });

  it("dual-writes notification create/read-state/delete to D1 only when explicitly enabled and configured", async () => {
    vi.stubEnv("D1_NOTIFICATIONS_DUAL_WRITE_ENABLED", "true");
    vi.stubEnv("CLOUDFLARE_ACCOUNT_ID", "account-id");
    vi.stubEnv("CLOUDFLARE_D1_DATABASE_ID", "database-id");
    vi.stubEnv("CLOUDFLARE_API_TOKEN", "token");
    mocks.supabase.sbCreateNotification.mockResolvedValueOnce("n1");
    mocks.supabase.sbMarkNotificationsRead.mockResolvedValueOnce(undefined);
    mocks.supabase.sbDeleteAllNotifications.mockResolvedValueOnce(undefined);
    mocks.d1.d1CreateNotification.mockResolvedValueOnce("n1");
    mocks.d1.d1MarkNotificationsRead.mockResolvedValueOnce(undefined);
    mocks.d1.d1DeleteAllNotifications.mockResolvedValueOnce(undefined);

    const {
      serverCreateNotification,
      serverDeleteAllNotifications,
      serverMarkNotificationsRead,
    } = await import("@/lib/db-server");

    await expect(serverCreateNotification({
      type: "auto_news",
      title: "News",
      message: "Saved",
      metadata: { articleId: "a1" },
    })).resolves.toBe("n1");
    await expect(serverMarkNotificationsRead({ all: true })).resolves.toBeUndefined();
    await expect(serverDeleteAllNotifications()).resolves.toBeUndefined();

    expect(mocks.d1.d1CreateNotification).toHaveBeenCalledWith({
      id: "n1",
      type: "auto_news",
      title: "News",
      message: "Saved",
      metadata: { articleId: "a1" },
    });
    expect(mocks.d1.d1MarkNotificationsRead).toHaveBeenCalledWith({ all: true });
    expect(mocks.d1.d1DeleteAllNotifications).toHaveBeenCalled();
  });

  it("can keep notification dual-write best-effort or strict", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.stubEnv("D1_NOTIFICATIONS_DUAL_WRITE_ENABLED", "true");
    vi.stubEnv("CLOUDFLARE_ACCOUNT_ID", "account-id");
    vi.stubEnv("CLOUDFLARE_D1_DATABASE_ID", "database-id");
    vi.stubEnv("CLOUDFLARE_API_TOKEN", "token");
    mocks.supabase.sbCreateNotification.mockResolvedValueOnce("n1");
    mocks.d1.d1CreateNotification.mockRejectedValueOnce(new Error("D1 unavailable"));

    const { serverCreateNotification } = await import("@/lib/db-server");

    await expect(serverCreateNotification({ type: "auto_press", title: "Saved" })).resolves.toBe("n1");
    expect(warn).toHaveBeenCalled();

    vi.stubEnv("D1_NOTIFICATIONS_DUAL_WRITE_STRICT", "true");
    mocks.supabase.sbCreateNotification.mockResolvedValueOnce("n2");
    mocks.d1.d1CreateNotification.mockRejectedValueOnce(new Error("D1 unavailable"));

    await expect(serverCreateNotification({ type: "auto_press", title: "Saved again" })).rejects.toThrow("D1 unavailable");
    warn.mockRestore();
  });

  it("keeps view and distribute logs on Supabase settings by default", async () => {
    const viewLogs = [{ articleId: "a1", timestamp: "2026-04-29T00:00:00.000Z", path: "/article/a1" }];
    const distributeLogs: DistributeLog[] = [{ id: "d1", articleId: "a1", articleTitle: "Article", portal: "naver", status: "success", timestamp: "2026-04-29T00:00:00.000Z", message: "ok" }];
    mocks.supabase.sbGetSetting
      .mockResolvedValueOnce(viewLogs)
      .mockResolvedValueOnce(distributeLogs);

    const { serverGetDistributeLogs, serverGetViewLogs } = await import("@/lib/db-server");

    await expect(serverGetViewLogs()).resolves.toBe(viewLogs);
    await expect(serverGetDistributeLogs()).resolves.toBe(distributeLogs);
    expect(mocks.supabase.sbGetSetting).toHaveBeenCalledWith("cp-view-logs", []);
    expect(mocks.supabase.sbGetSetting).toHaveBeenCalledWith("cp-distribute-logs", []);
    expect(mocks.d1.d1GetViewLogs).not.toHaveBeenCalled();
    expect(mocks.d1.d1GetDistributeLogs).not.toHaveBeenCalled();
  });

  it("routes view and distribute log reads to D1 only behind the logs read flag", async () => {
    vi.stubEnv("D1_LOGS_READ_ADAPTER_ENABLED", "true");
    vi.stubEnv("CLOUDFLARE_ACCOUNT_ID", "account-id");
    vi.stubEnv("CLOUDFLARE_D1_DATABASE_ID", "database-id");
    vi.stubEnv("CLOUDFLARE_API_TOKEN", "token");
    const viewLogs = [{ articleId: "a1", timestamp: "2026-04-29T00:00:00.000Z", path: "/article/a1" }];
    const distributeLogs: DistributeLog[] = [{ id: "d1", articleId: "a1", articleTitle: "Article", portal: "naver", status: "success", timestamp: "2026-04-29T00:00:00.000Z", message: "ok" }];
    mocks.d1.d1GetViewLogs.mockResolvedValueOnce(viewLogs);
    mocks.d1.d1GetDistributeLogs.mockResolvedValueOnce(distributeLogs);

    const { serverGetDistributeLogs, serverGetViewLogs } = await import("@/lib/db-server");

    await expect(serverGetViewLogs()).resolves.toBe(viewLogs);
    await expect(serverGetDistributeLogs()).resolves.toBe(distributeLogs);
    expect(mocks.d1.d1GetViewLogs).toHaveBeenCalled();
    expect(mocks.d1.d1GetDistributeLogs).toHaveBeenCalled();
    expect(mocks.supabase.sbGetSetting).not.toHaveBeenCalled();
  });

  it("writes view and distribute logs to D1 primary only after DATABASE_PROVIDER=d1 cutover", async () => {
    vi.stubEnv("DATABASE_PROVIDER", "d1");
    vi.stubEnv("D1_LOGS_READ_ADAPTER_ENABLED", "true");
    vi.stubEnv("CLOUDFLARE_ACCOUNT_ID", "account-id");
    vi.stubEnv("CLOUDFLARE_D1_DATABASE_ID", "database-id");
    vi.stubEnv("CLOUDFLARE_API_TOKEN", "token");
    const distributeLogs: DistributeLog[] = [{ id: "d1", articleId: "a1", articleTitle: "Article", portal: "naver", status: "success", timestamp: "2026-04-29T00:00:00.000Z", message: "ok" }];
    mocks.d1.d1GetViewLogs.mockResolvedValueOnce([]);
    mocks.d1.d1AddViewLog.mockResolvedValueOnce(undefined);
    mocks.d1.d1AddDistributeLogs.mockResolvedValueOnce(undefined);
    mocks.d1.d1ClearDistributeLogs.mockResolvedValueOnce(undefined);

    const {
      serverAddDistributeLogs,
      serverAddViewLog,
      serverClearDistributeLogs,
    } = await import("@/lib/db-server");

    await expect(serverAddViewLog({ articleId: "a1", path: "/article/a1", visitorKey: "visitor" })).resolves.toBeUndefined();
    await expect(serverAddDistributeLogs(distributeLogs)).resolves.toBeUndefined();
    await expect(serverClearDistributeLogs()).resolves.toBeUndefined();

    expect(mocks.d1.d1GetViewLogs).toHaveBeenCalled();
    expect(mocks.d1.d1AddViewLog).toHaveBeenCalledWith(expect.objectContaining({
      articleId: "a1",
      path: "/article/a1",
      visitorKey: "visitor",
    }));
    expect(mocks.d1.d1AddDistributeLogs).toHaveBeenCalledWith(distributeLogs);
    expect(mocks.d1.d1ClearDistributeLogs).toHaveBeenCalled();
    expect(mocks.supabase.sbGetSetting).not.toHaveBeenCalled();
    expect(mocks.supabase.sbSaveSetting).not.toHaveBeenCalled();
  });

  it("dual-writes view and distribute logs to D1 only when explicitly enabled and configured", async () => {
    vi.stubEnv("D1_LOGS_DUAL_WRITE_ENABLED", "true");
    vi.stubEnv("CLOUDFLARE_ACCOUNT_ID", "account-id");
    vi.stubEnv("CLOUDFLARE_D1_DATABASE_ID", "database-id");
    vi.stubEnv("CLOUDFLARE_API_TOKEN", "token");
    const distributeLogs: DistributeLog[] = [{ id: "d1", articleId: "a1", articleTitle: "Article", portal: "naver", status: "success", timestamp: "2026-04-29T00:00:00.000Z", message: "ok" }];
    mocks.supabase.sbGetSetting
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);
    mocks.supabase.sbSaveSetting.mockResolvedValue(undefined);
    mocks.d1.d1AddViewLog.mockResolvedValueOnce(undefined);
    mocks.d1.d1AddDistributeLogs.mockResolvedValueOnce(undefined);
    mocks.d1.d1ClearDistributeLogs.mockResolvedValueOnce(undefined);

    const {
      serverAddDistributeLogs,
      serverAddViewLog,
      serverClearDistributeLogs,
    } = await import("@/lib/db-server");

    await expect(serverAddViewLog({ articleId: "a1", path: "/article/a1", visitorKey: "visitor", isAdmin: false })).resolves.toBeUndefined();
    await expect(serverAddDistributeLogs(distributeLogs)).resolves.toBeUndefined();
    await expect(serverClearDistributeLogs()).resolves.toBeUndefined();

    expect(mocks.d1.d1AddViewLog).toHaveBeenCalledWith(expect.objectContaining({
      articleId: "a1",
      path: "/article/a1",
      visitorKey: "visitor",
      isAdmin: false,
    }));
    expect(mocks.d1.d1AddDistributeLogs).toHaveBeenCalledWith(distributeLogs);
    expect(mocks.d1.d1ClearDistributeLogs).toHaveBeenCalled();
  });

  it("can keep log dual-write best-effort or strict", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.stubEnv("D1_LOGS_DUAL_WRITE_ENABLED", "true");
    vi.stubEnv("CLOUDFLARE_ACCOUNT_ID", "account-id");
    vi.stubEnv("CLOUDFLARE_D1_DATABASE_ID", "database-id");
    vi.stubEnv("CLOUDFLARE_API_TOKEN", "token");
    mocks.supabase.sbGetSetting.mockResolvedValueOnce([]);
    mocks.supabase.sbSaveSetting.mockResolvedValue(undefined);
    mocks.d1.d1AddViewLog.mockRejectedValueOnce(new Error("D1 unavailable"));

    const { serverAddViewLog } = await import("@/lib/db-server");

    await expect(serverAddViewLog({ articleId: "a1", path: "/article/a1" })).resolves.toBeUndefined();
    expect(warn).toHaveBeenCalled();

    vi.stubEnv("D1_LOGS_DUAL_WRITE_STRICT", "true");
    mocks.supabase.sbGetSetting.mockResolvedValueOnce([]);
    mocks.d1.d1AddViewLog.mockRejectedValueOnce(new Error("D1 unavailable"));

    await expect(serverAddViewLog({ articleId: "a2", path: "/article/a2" })).rejects.toThrow("D1 unavailable");
    warn.mockRestore();
  });
});
