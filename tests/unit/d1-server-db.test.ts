import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const d1HttpQueryMock = vi.fn();
const d1HttpFirstMock = vi.fn();

vi.mock("@/lib/d1-http-client", () => ({
  d1HttpQuery: d1HttpQueryMock,
  d1HttpFirst: d1HttpFirstMock,
}));

describe("D1 read-only server adapter", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("maps D1 article rows to the public Article shape", async () => {
    const { d1RowToArticle } = await import("@/lib/d1-server-db");

    expect(d1RowToArticle({
      id: "a1",
      no: 7,
      title: "Culture",
      category: "\uBB38\uD654",
      date: "2026-04-29T00:00:00.000Z",
      status: "\uAC8C\uC2DC",
      views: 12,
      body: "<p>Hello</p>",
      thumbnail_alt: "alt",
      author_email: "editor@example.com",
      meta_description: "meta",
      scheduled_publish_at: "2026-04-30T00:00:00.000Z",
      source_url: "https://example.com/source",
      parent_article_id: "p1",
      review_note: "ok",
      audit_trail_json: JSON.stringify([{ action: "\uAC8C\uC2DC", by: "admin", at: "2026-04-29T00:00:00.000Z" }]),
      ai_generated: 1,
    })).toMatchObject({
      id: "a1",
      no: 7,
      title: "Culture",
      category: "\uBB38\uD654",
      date: "2026-04-29",
      status: "\uAC8C\uC2DC",
      views: 12,
      body: "<p>Hello</p>",
      thumbnailAlt: "alt",
      authorEmail: "editor@example.com",
      metaDescription: "meta",
      scheduledPublishAt: "2026-04-30T00:00:00.000Z",
      sourceUrl: "https://example.com/source",
      parentArticleId: "p1",
      reviewNote: "ok",
      aiGenerated: true,
    });
  });

  it("reads JSON settings from D1 site_settings", async () => {
    d1HttpFirstMock.mockResolvedValueOnce({ value_json: JSON.stringify({ enabled: true }) });
    const { d1GetSetting } = await import("@/lib/d1-server-db");

    await expect(d1GetSetting("cp-auto-press-settings", { enabled: false })).resolves.toEqual({ enabled: true });
    expect(d1HttpFirstMock).toHaveBeenCalledWith(
      "SELECT value_json FROM site_settings WHERE key = ? LIMIT 1",
      ["cp-auto-press-settings"],
    );
  });

  it("upserts JSON settings into D1 site_settings", async () => {
    d1HttpQueryMock.mockResolvedValueOnce({ rows: [] });
    const { d1SaveSetting } = await import("@/lib/d1-server-db");

    await expect(d1SaveSetting("cp-auto-press-settings", { enabled: true })).resolves.toBeUndefined();
    expect(d1HttpQueryMock.mock.calls[0][0]).toContain("INSERT INTO site_settings");
    expect(d1HttpQueryMock.mock.calls[0][0]).toContain("ON CONFLICT(key) DO UPDATE");
    expect(d1HttpQueryMock.mock.calls[0][1]).toEqual([
      "cp-auto-press-settings",
      JSON.stringify({ enabled: true }),
    ]);
  });

  it("upserts articles and their search index into D1", async () => {
    d1HttpQueryMock.mockResolvedValue({ rows: [] });
    const { d1CreateArticle } = await import("@/lib/d1-server-db");

    await expect(d1CreateArticle({
      id: "a1",
      no: 7,
      title: "D1 article",
      category: "\uB274\uC2A4",
      date: "2026-04-29",
      status: "\uAC8C\uC2DC",
      views: 3,
      body: "<p>Hello <strong>world</strong></p>",
      tags: "culture,news",
      summary: "Summary",
      sourceUrl: "https://www.newswire.co.kr/newsRead.php?no=1033672&sourceType=rss&utm_source=x#top",
      auditTrail: [{ action: "\uAC8C\uC2DC", by: "admin", at: "2026-04-29T00:00:00.000Z" }],
      aiGenerated: true,
    })).resolves.toBeUndefined();

    expect(d1HttpQueryMock).toHaveBeenCalledTimes(2);
    expect(d1HttpQueryMock.mock.calls[0][0]).toContain("INSERT INTO articles");
    expect(d1HttpQueryMock.mock.calls[0][0]).toContain("ON CONFLICT(id) DO UPDATE");
    expect(d1HttpQueryMock.mock.calls[0][1]).toContain("a1");
    expect(d1HttpQueryMock.mock.calls[0][1]).toContain(1);
    expect(d1HttpQueryMock.mock.calls[0][1]).toContain("https://newswire.co.kr/newsRead.php?no=1033672");
    expect(d1HttpQueryMock.mock.calls[1][0]).toContain("INSERT INTO article_search_index");
    expect(d1HttpQueryMock.mock.calls[1][1]).toEqual([
      "a1",
      "D1 article",
      "Summary",
      "culture,news",
      "Hello world",
      expect.any(String),
    ]);
  });

  it("updates D1 article columns and refreshes the search index from the saved row", async () => {
    d1HttpQueryMock
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });
    d1HttpFirstMock.mockResolvedValueOnce({
      id: "a1",
      title: "Updated",
      category: "\uB274\uC2A4",
      date: "2026-04-29",
      status: "\uAC8C\uC2DC",
      views: 0,
      body: "<p>Updated body</p>",
      summary: "Updated summary",
      tags: "tag",
    });
    const { d1UpdateArticle } = await import("@/lib/d1-server-db");

    await expect(d1UpdateArticle("a1", { title: "Updated", thumbnailAlt: "" })).resolves.toBeUndefined();

    expect(d1HttpQueryMock.mock.calls[0][0]).toContain("UPDATE articles SET title = ?, thumbnail_alt = ? WHERE id = ?");
    expect(d1HttpQueryMock.mock.calls[0][1]).toEqual(["Updated", null, "a1"]);
    expect(d1HttpQueryMock.mock.calls[1][0]).toContain("INSERT INTO article_search_index");
    expect(d1HttpQueryMock.mock.calls[1][1][1]).toBe("Updated");
  });

  it("increments D1 article views atomically", async () => {
    d1HttpQueryMock.mockResolvedValueOnce({ rows: [] });
    const { d1IncrementViews } = await import("@/lib/d1-server-db");

    await expect(d1IncrementViews("a1")).resolves.toBeUndefined();

    expect(d1HttpQueryMock).toHaveBeenCalledWith(
      "UPDATE articles SET views = COALESCE(views, 0) + 1 WHERE id = ?",
      ["a1"],
    );
  });

  it("reads the current max article number from D1", async () => {
    d1HttpFirstMock.mockResolvedValueOnce({ max_no: 42 });
    const { d1GetMaxArticleNo } = await import("@/lib/d1-server-db");

    await expect(d1GetMaxArticleNo()).resolves.toBe(42);

    expect(d1HttpFirstMock).toHaveBeenCalledWith(
      "SELECT MAX(no) AS max_no FROM articles",
      [],
    );
  });

  it("soft-deletes and purges D1 articles", async () => {
    d1HttpQueryMock.mockResolvedValue({ rows: [] });
    const { d1DeleteArticle, d1PurgeArticle } = await import("@/lib/d1-server-db");

    await expect(d1DeleteArticle("a1")).resolves.toBeUndefined();
    await expect(d1PurgeArticle("a1")).resolves.toBeUndefined();

    expect(d1HttpQueryMock.mock.calls[0][0]).toContain("UPDATE articles SET deleted_at");
    expect(d1HttpQueryMock.mock.calls[0][1]).toEqual(["a1"]);
    expect(d1HttpQueryMock.mock.calls[1]).toEqual(["DELETE FROM article_search_index WHERE article_id = ?", ["a1"]]);
    expect(d1HttpQueryMock.mock.calls[2]).toEqual(["DELETE FROM articles WHERE id = ?", ["a1"]]);
  });

  it("reads D1 comments with public/admin filters", async () => {
    d1HttpQueryMock.mockResolvedValueOnce({
      rows: [{
        id: "c1",
        article_id: "a1",
        article_title: "Article",
        author: "Reader",
        content: "Nice",
        created_at: "2026-04-29T00:00:00.000Z",
        status: "approved",
        ip: "127.0.0.1",
        parent_id: null,
      }],
    });
    const { d1GetComments } = await import("@/lib/d1-server-db");

    await expect(d1GetComments({ articleId: "a1", isAdmin: false })).resolves.toMatchObject([{
      id: "c1",
      articleId: "a1",
      articleTitle: "Article",
      author: "Reader",
      content: "Nice",
      status: "approved",
      ip: "127.0.0.1",
    }]);
    expect(d1HttpQueryMock.mock.calls[0][0]).toContain("WHERE article_id = ? AND status = ?");
    expect(d1HttpQueryMock.mock.calls[0][1]).toEqual(["a1", "approved"]);
  });

  it("creates, moderates, and deletes D1 comments", async () => {
    d1HttpQueryMock.mockResolvedValue({ rows: [] });
    const { d1CreateComment, d1DeleteComment, d1UpdateCommentStatus } = await import("@/lib/d1-server-db");

    await expect(d1CreateComment({
      id: "c1",
      articleId: "a1",
      articleTitle: "Article",
      author: "Reader",
      content: "Nice",
      status: "pending",
      ip: "127.0.0.1",
    })).resolves.toBe("c1");
    await expect(d1UpdateCommentStatus("c1", "approved")).resolves.toBeUndefined();
    await expect(d1DeleteComment("c1")).resolves.toBeUndefined();

    expect(d1HttpQueryMock.mock.calls[0][0]).toContain("INSERT INTO comments");
    expect(d1HttpQueryMock.mock.calls[0][0]).toContain("ON CONFLICT(id) DO UPDATE");
    expect(d1HttpQueryMock.mock.calls[0][1]).toEqual([
      "c1",
      "a1",
      "Article",
      "Reader",
      "Nice",
      "pending",
      "127.0.0.1",
      null,
    ]);
    expect(d1HttpQueryMock.mock.calls[1]).toEqual(["UPDATE comments SET status = ? WHERE id = ?", ["approved", "c1"]]);
    expect(d1HttpQueryMock.mock.calls[2]).toEqual(["DELETE FROM comments WHERE parent_id = ?", ["c1"]]);
    expect(d1HttpQueryMock.mock.calls[3]).toEqual(["DELETE FROM comments WHERE id = ?", ["c1"]]);
  });

  it("reads, counts, upserts, marks, and clears D1 notifications", async () => {
    d1HttpQueryMock
      .mockResolvedValueOnce({
        rows: [{
          id: "n1",
          type: "auto_press",
          title: "Registered",
          message: "Article saved",
          metadata_json: JSON.stringify({ articleId: "a1" }),
          read: 0,
          created_at: "2026-04-29T00:00:00.000Z",
        }],
      })
      .mockResolvedValue({ rows: [] });
    d1HttpFirstMock.mockResolvedValueOnce({ total: 3 });
    const {
      d1CountUnreadNotifications,
      d1CreateNotification,
      d1DeleteAllNotifications,
      d1GetNotifications,
      d1MarkNotificationsRead,
    } = await import("@/lib/d1-server-db");

    await expect(d1GetNotifications(25)).resolves.toEqual([{
      id: "n1",
      type: "auto_press",
      title: "Registered",
      message: "Article saved",
      metadata: { articleId: "a1" },
      read: false,
      created_at: "2026-04-29T00:00:00.000Z",
    }]);
    await expect(d1CountUnreadNotifications()).resolves.toBe(3);
    await expect(d1CreateNotification({
      id: "n2",
      type: "auto_news",
      title: "News",
      message: "Saved",
      metadata: { articleId: "a2" },
    })).resolves.toBe("n2");
    await expect(d1MarkNotificationsRead({ ids: ["n1", "n2"] })).resolves.toBeUndefined();
    await expect(d1MarkNotificationsRead({ all: true })).resolves.toBeUndefined();
    await expect(d1DeleteAllNotifications()).resolves.toBeUndefined();

    expect(d1HttpQueryMock.mock.calls[0][0]).toContain("FROM notifications");
    expect(d1HttpQueryMock.mock.calls[0][1]).toEqual([25]);
    expect(d1HttpFirstMock.mock.calls[0]).toEqual([
      "SELECT COUNT(*) AS total FROM notifications WHERE read = 0",
      [],
    ]);
    expect(d1HttpQueryMock.mock.calls[1][0]).toContain("INSERT INTO notifications");
    expect(d1HttpQueryMock.mock.calls[1][1]).toEqual([
      "n2",
      "auto_news",
      "News",
      "Saved",
      JSON.stringify({ articleId: "a2" }),
    ]);
    expect(d1HttpQueryMock.mock.calls[2]).toEqual([
      "UPDATE notifications SET read = 1 WHERE id IN (?, ?)",
      ["n1", "n2"],
    ]);
    expect(d1HttpQueryMock.mock.calls[3]).toEqual(["UPDATE notifications SET read = 1 WHERE read = 0", []]);
    expect(d1HttpQueryMock.mock.calls[4]).toEqual(["DELETE FROM notifications", []]);
  });

  it("reads and writes D1 view logs", async () => {
    d1HttpQueryMock
      .mockResolvedValueOnce({
        rows: [{
          article_id: "a1",
          timestamp: "2026-04-29T00:00:00.000Z",
          path: "/article/a1",
          visitor_key: "visitor",
          is_admin: 0,
          is_bot: 1,
          bot_name: "GPTBot",
        }],
      })
      .mockResolvedValueOnce({ rows: [] });
    const { d1AddViewLog, d1GetViewLogs } = await import("@/lib/d1-server-db");

    await expect(d1GetViewLogs()).resolves.toEqual([{
      articleId: "a1",
      timestamp: "2026-04-29T00:00:00.000Z",
      path: "/article/a1",
      visitorKey: "visitor",
      isAdmin: false,
      isBot: true,
      botName: "GPTBot",
    }]);
    await expect(d1AddViewLog({
      articleId: "a1",
      timestamp: "2026-04-29T00:00:00.000Z",
      path: "/article/a1",
      visitorKey: "visitor",
      isAdmin: false,
      isBot: true,
      botName: "GPTBot",
    })).resolves.toBeUndefined();

    expect(d1HttpQueryMock.mock.calls[0][0]).toContain("FROM view_logs");
    expect(d1HttpQueryMock.mock.calls[0][1]).toEqual([2000]);
    expect(d1HttpQueryMock.mock.calls[1][0]).toContain("INSERT INTO view_logs");
    expect(d1HttpQueryMock.mock.calls[1][1]).toEqual([
      "a1",
      "2026-04-29T00:00:00.000Z",
      "/article/a1",
      "visitor",
      0,
      1,
      "GPTBot",
    ]);
  });

  it("reads, upserts, and clears D1 distribute logs", async () => {
    d1HttpQueryMock
      .mockResolvedValueOnce({
        rows: [{
          id: "d1",
          article_id: "a1",
          article_title: "Article",
          portal: "naver",
          status: "success",
          timestamp: "2026-04-29T00:00:00.000Z",
          message: "ok",
        }],
      })
      .mockResolvedValue({ rows: [] });
    const { d1AddDistributeLogs, d1ClearDistributeLogs, d1GetDistributeLogs } = await import("@/lib/d1-server-db");

    await expect(d1GetDistributeLogs()).resolves.toEqual([{
      id: "d1",
      articleId: "a1",
      articleTitle: "Article",
      portal: "naver",
      status: "success",
      timestamp: "2026-04-29T00:00:00.000Z",
      message: "ok",
    }]);
    await expect(d1AddDistributeLogs([{
      id: "d1",
      articleId: "a1",
      articleTitle: "Article",
      portal: "naver",
      status: "success",
      timestamp: "2026-04-29T00:00:00.000Z",
      message: "ok",
    }])).resolves.toBeUndefined();
    await expect(d1ClearDistributeLogs()).resolves.toBeUndefined();

    expect(d1HttpQueryMock.mock.calls[0][0]).toContain("FROM distribute_logs");
    expect(d1HttpQueryMock.mock.calls[1][0]).toContain("INSERT INTO distribute_logs");
    expect(d1HttpQueryMock.mock.calls[1][1]).toEqual([
      "d1",
      "a1",
      "Article",
      "naver",
      "success",
      "2026-04-29T00:00:00.000Z",
      "ok",
    ]);
    expect(d1HttpQueryMock.mock.calls[2]).toEqual(["DELETE FROM distribute_logs", []]);
  });

  it("returns published article lists without body for list views", async () => {
    d1HttpQueryMock.mockResolvedValueOnce({
      rows: [{
        id: "a1",
        title: "Published",
        category: "\uB274\uC2A4",
        date: "2026-04-29",
        status: "\uAC8C\uC2DC",
        views: 3,
        body: "should not leak into list result",
      }],
    });
    const { d1GetPublishedArticles } = await import("@/lib/d1-server-db");

    await expect(d1GetPublishedArticles()).resolves.toMatchObject([
      { id: "a1", title: "Published", body: "" },
    ]);
    expect(d1HttpQueryMock.mock.calls[0][0]).toContain("WHERE status = ? AND deleted_at IS NULL");
    expect(d1HttpQueryMock.mock.calls[0][1]).toEqual(["\uAC8C\uC2DC"]);
  });

  it("reads expanded public article lists from D1", async () => {
    d1HttpQueryMock
      .mockResolvedValueOnce({ rows: [{ id: "category", title: "Category", category: "\uB274\uC2A4", date: "2026-04-29", status: "\uAC8C\uC2DC" }] })
      .mockResolvedValueOnce({ rows: [{ id: "tag", title: "Tag", category: "\uB274\uC2A4", date: "2026-04-29", status: "\uAC8C\uC2DC", tags: "culture,news" }] })
      .mockResolvedValueOnce({ rows: [{ id: "feed", title: "Feed", category: "\uB274\uC2A4", date: "2026-04-29", status: "\uAC8C\uC2DC", body: "<p>Body</p>" }] })
      .mockResolvedValueOnce({ rows: [{ id: "author", title: "Author", category: "\uB274\uC2A4", date: "2026-04-29", status: "\uAC8C\uC2DC", author: "Reporter" }] })
      .mockResolvedValueOnce({ rows: [{ id: "home", title: "Home", category: "\uB274\uC2A4", date: "2026-04-29", status: "\uAC8C\uC2DC" }] })
      .mockResolvedValueOnce({ rows: [{ id: "top", title: "Top", category: "\uB274\uC2A4", date: "2026-04-29", status: "\uAC8C\uC2DC", views: 10 }] })
      .mockResolvedValueOnce({ rows: [{ no: 7, date: "2026-04-29T00:00:00.000Z", tags: "culture", author: "Reporter" }] });
    const {
      d1GetArticleSitemapData,
      d1GetArticlesByAuthor,
      d1GetArticlesByCategory,
      d1GetArticlesByTag,
      d1GetFeedArticles,
      d1GetHomeArticles,
      d1GetTopArticles,
    } = await import("@/lib/d1-server-db");

    await expect(d1GetArticlesByCategory("\uB274\uC2A4")).resolves.toMatchObject([{ id: "category", body: "" }]);
    await expect(d1GetArticlesByTag("culture")).resolves.toMatchObject([{ id: "tag", body: "" }]);
    await expect(d1GetFeedArticles({ limit: 20, includeBody: true })).resolves.toMatchObject([{ id: "feed", body: "<p>Body</p>" }]);
    await expect(d1GetArticlesByAuthor("Reporter", 5)).resolves.toMatchObject([{ id: "author", body: "" }]);
    await expect(d1GetHomeArticles(12)).resolves.toMatchObject([{ id: "home", body: "" }]);
    await expect(d1GetTopArticles(5)).resolves.toMatchObject([{ id: "top", views: 10 }]);
    await expect(d1GetArticleSitemapData()).resolves.toEqual([{ no: 7, date: "2026-04-29", tags: "culture", author: "Reporter" }]);

    expect(d1HttpQueryMock.mock.calls[0][0]).toContain("category = ?");
    expect(d1HttpQueryMock.mock.calls[0][1]).toEqual(["\uAC8C\uC2DC", "\uB274\uC2A4", 500]);
    expect(d1HttpQueryMock.mock.calls[1][0]).toContain("tags LIKE ? ESCAPE");
    expect(d1HttpQueryMock.mock.calls[1][1]).toEqual(["\uAC8C\uC2DC", "%culture%", 500]);
    expect(d1HttpQueryMock.mock.calls[2][0]).toContain("SELECT id");
    expect(d1HttpQueryMock.mock.calls[2][0]).toContain("body");
    expect(d1HttpQueryMock.mock.calls[2][1]).toEqual(["\uAC8C\uC2DC", 20]);
    expect(d1HttpQueryMock.mock.calls[3][1]).toEqual(["\uAC8C\uC2DC", "Reporter", 5]);
    expect(d1HttpQueryMock.mock.calls[4][1]).toEqual(["\uAC8C\uC2DC", 12]);
    expect(d1HttpQueryMock.mock.calls[5][0]).toContain("ORDER BY views DESC");
    expect(d1HttpQueryMock.mock.calls[5][1]).toEqual(["\uAC8C\uC2DC", expect.any(String), 5]);
    expect(d1HttpQueryMock.mock.calls[6][0]).toContain("SELECT no, date, tags, author");
  });

  it("reads operational article lists from D1", async () => {
    d1HttpQueryMock
      .mockResolvedValueOnce({ rows: [{ id: "maint", title: "Maintenance", category: "\uB274\uC2A4", date: "2026-04-29", status: "\uAC8C\uC2DC", body: "<p>Body</p>" }] })
      .mockResolvedValueOnce({ rows: [{ id: "scheduled", title: "Scheduled", category: "\uB274\uC2A4", date: "2026-04-29", status: "\uC608\uC57D", scheduled_publish_at: "2026-04-29T00:00:00.000Z", body: "<p>Body</p>" }] })
      .mockResolvedValueOnce({ rows: [{ title: "Existing", source_url: "https://example.com/source" }] })
      .mockResolvedValueOnce({ rows: [{ id: "deleted", title: "Deleted", category: "\uB274\uC2A4", date: "2026-04-29", status: "\uAC8C\uC2DC", deleted_at: "2026-04-29T00:00:00.000Z" }] });
    const {
      d1GetDeletedArticles,
      d1GetMaintenanceArticles,
      d1GetRecentTitles,
      d1GetScheduledArticles,
    } = await import("@/lib/d1-server-db");

    await expect(d1GetMaintenanceArticles({ page: 2, limit: 50, since: "2026-04-01", includeBody: true })).resolves.toMatchObject([{ id: "maint", body: "<p>Body</p>" }]);
    await expect(d1GetScheduledArticles()).resolves.toMatchObject([{ id: "scheduled", body: "<p>Body</p>", scheduledPublishAt: "2026-04-29T00:00:00.000Z" }]);
    await expect(d1GetRecentTitles(7)).resolves.toEqual([{ title: "Existing", sourceUrl: "https://example.com/source" }]);
    await expect(d1GetDeletedArticles()).resolves.toMatchObject([{ id: "deleted", deletedAt: "2026-04-29T00:00:00.000Z" }]);

    expect(d1HttpQueryMock.mock.calls[0][0]).toContain("updated_at >= ?");
    expect(d1HttpQueryMock.mock.calls[0][1]).toEqual(["2026-04-01", 50, 50]);
    expect(d1HttpQueryMock.mock.calls[1][0]).toContain("scheduled_publish_at <= ?");
    expect(d1HttpQueryMock.mock.calls[1][1]).toEqual(["\uC608\uC57D", expect.any(String)]);
    expect(d1HttpQueryMock.mock.calls[2][0]).toContain("SELECT title, source_url");
    expect(d1HttpQueryMock.mock.calls[2][1]).toEqual(["\uAC8C\uC2DC", expect.any(String), 10000]);
    expect(d1HttpQueryMock.mock.calls[3][0]).toContain("deleted_at IS NOT NULL");
  });

  it("builds filtered article count and page queries with safe LIKE params", async () => {
    d1HttpFirstMock.mockResolvedValueOnce({ total: 1 });
    d1HttpQueryMock.mockResolvedValueOnce({
      rows: [{
        id: "a1",
        title: "Filtered",
        category: "\uB274\uC2A4",
        date: "2026-04-29",
        status: "\uAC8C\uC2DC",
        views: 0,
      }],
    });
    const { d1GetFilteredArticles } = await import("@/lib/d1-server-db");

    const result = await d1GetFilteredArticles({
      q: "100%_match",
      category: "\uB274\uC2A4",
      page: 2,
      limit: 5,
      authed: false,
    });

    expect(result.total).toBe(1);
    expect(result.articles[0]).toMatchObject({ id: "a1", body: "" });
    expect(d1HttpFirstMock.mock.calls[0][0]).toContain("COUNT(*) AS total");
    expect(d1HttpFirstMock.mock.calls[0][1]).toEqual([
      "\uAC8C\uC2DC",
      "\uB274\uC2A4",
      "%100\\%\\_match%",
      "%100\\%\\_match%",
      "%100\\%\\_match%",
    ]);
    expect(d1HttpQueryMock.mock.calls[0][1]).toEqual([
      "\uAC8C\uC2DC",
      "\uB274\uC2A4",
      "%100\\%\\_match%",
      "%100\\%\\_match%",
      "%100\\%\\_match%",
      5,
      5,
    ]);
  });
});
