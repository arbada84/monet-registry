import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const mocks = vi.hoisted(() => ({
  serverAddDistributeLogs: vi.fn(),
  serverGetSetting: vi.fn(),
  serverSaveSetting: vi.fn(),
  notifyIndexNow: vi.fn(),
}));

vi.mock("@/lib/db-server", () => ({
  serverAddDistributeLogs: mocks.serverAddDistributeLogs,
  serverGetSetting: mocks.serverGetSetting,
  serverSaveSetting: mocks.serverSaveSetting,
}));

vi.mock("@/lib/notify-search", () => ({
  notifyIndexNow: mocks.notifyIndexNow,
}));

describe("portal publication pipeline", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("skips non-published article updates", async () => {
    const { publishArticleToPortals } = await import("@/lib/portal-publication");

    const result = await publishArticleToPortals({
      articleId: "draft-1",
      articleNo: 101,
      title: "임시저장 기사",
      status: "임시저장",
      source: "auto-news",
    });

    expect(result).toMatchObject({ submitted: false, skipped: true, debounced: false });
    expect(mocks.notifyIndexNow).not.toHaveBeenCalled();
    expect(mocks.serverAddDistributeLogs).not.toHaveBeenCalled();
  });

  it("submits published articles to IndexNow and stores a distribution log", async () => {
    mocks.serverGetSetting.mockResolvedValue({ recent: {} });
    mocks.notifyIndexNow.mockResolvedValue({ submitted: true, skipped: false, status: 202 });
    const { publishArticleToPortals } = await import("@/lib/portal-publication");

    const result = await publishArticleToPortals({
      articleId: "article-101",
      articleNo: 101,
      title: "게시 기사",
      status: "게시",
      source: "manual",
    });

    expect(result).toMatchObject({ submitted: true, skipped: false, debounced: false });
    expect(mocks.notifyIndexNow).toHaveBeenCalledWith("101", "URL_UPDATED");
    expect(mocks.serverSaveSetting).toHaveBeenCalledWith(
      "cp-portal-publication-state",
      expect.objectContaining({
        recent: expect.objectContaining({ "URL_UPDATED:101": expect.any(String) }),
      }),
    );
    expect(mocks.serverAddDistributeLogs).toHaveBeenCalledWith([
      expect.objectContaining({
        articleId: "article-101",
        articleTitle: "게시 기사",
        portal: "IndexNow",
        status: "success",
        message: expect.stringContaining("[manual]"),
      }),
    ]);
  });

  it("debounces duplicate submissions for the same URL within five minutes", async () => {
    const recentAt = new Date(Date.now() - 60 * 1000).toISOString();
    mocks.serverGetSetting.mockResolvedValue({ recent: { "URL_UPDATED:101": recentAt } });
    const { publishArticleToPortals } = await import("@/lib/portal-publication");

    const result = await publishArticleToPortals({
      articleNo: 101,
      title: "중복 게시 기사",
      status: "게시",
      source: "manual-edit",
    });

    expect(result).toMatchObject({ submitted: false, skipped: true, debounced: true });
    expect(mocks.notifyIndexNow).not.toHaveBeenCalled();
    expect(mocks.serverAddDistributeLogs).toHaveBeenCalledWith([
      expect.objectContaining({
        portal: "IndexNow",
        status: "pending",
        message: expect.stringContaining("중복 요청을 생략"),
      }),
    ]);
  });

  it("allows delete notifications with the article number URL key", async () => {
    mocks.serverGetSetting.mockResolvedValue({ recent: {} });
    mocks.notifyIndexNow.mockResolvedValue({ submitted: true, skipped: false, status: 200 });
    const { publishArticleToPortals } = await import("@/lib/portal-publication");

    await publishArticleToPortals({
      articleId: "uuid-article",
      articleNo: 777,
      title: "삭제 기사",
      action: "URL_DELETED",
      source: "delete",
      force: true,
    });

    expect(mocks.notifyIndexNow).toHaveBeenCalledWith("777", "URL_DELETED");
  });
});
