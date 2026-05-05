import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const d1HttpQueryMock = vi.fn();
const d1HttpFirstMock = vi.fn();
const serverGetArticleByIdMock = vi.fn();
const serverGetArticleByNoMock = vi.fn();
const serverGetSettingMock = vi.fn();
const serverSaveSettingMock = vi.fn();
const serverUpdateArticleMock = vi.fn();
const serverCreateArticleMock = vi.fn();
const serverFindArticleDuplicateMock = vi.fn();
const serverGetAiSettingsMock = vi.fn();
const aiEditArticleMock = vi.fn();
const serverUploadImageUrlMock = vi.fn();

vi.mock("@/lib/d1-http-client", () => ({
  d1HttpQuery: d1HttpQueryMock,
  d1HttpFirst: d1HttpFirstMock,
}));

vi.mock("@/lib/db-server", () => ({
  serverGetArticleById: serverGetArticleByIdMock,
  serverGetArticleByNo: serverGetArticleByNoMock,
  serverGetSetting: serverGetSettingMock,
  serverSaveSetting: serverSaveSettingMock,
  serverUpdateArticle: serverUpdateArticleMock,
  serverCreateArticle: serverCreateArticleMock,
  serverFindArticleDuplicate: serverFindArticleDuplicateMock,
}));

vi.mock("@/lib/ai-settings-server", () => ({
  serverGetAiSettings: serverGetAiSettingsMock,
  resolveAiApiKey: (settings: { openaiApiKey?: string; geminiApiKey?: string }, provider = "gemini") =>
    provider === "openai"
      ? (settings.openaiApiKey || process.env.OPENAI_API_KEY || "")
      : (settings.geminiApiKey || process.env.GEMINI_API_KEY || ""),
}));

vi.mock("@/lib/ai-prompt", () => ({
  VALID_CATEGORIES: ["문화", "엔터", "스포츠", "라이프", "테크·모빌리티", "비즈", "공공"],
  aiEditArticle: aiEditArticleMock,
}));

vi.mock("@/lib/server-upload-image", () => ({
  serverUploadImageUrl: serverUploadImageUrlMock,
}));

describe("auto-press retry queue processor", () => {
  const queueRow = {
    id: "press_1_0001_retry",
    run_id: "press_1",
    item_id: "press_1_0001",
    article_id: "7",
    article_no: 7,
    title: "AI failed article",
    source_url: "https://example.com/source",
    source_name: "뉴스와이어",
    status: "pending",
    reason_code: "AI_RETRY_PENDING",
    reason_message: "AI 편집 실패",
    attempts: 0,
    max_attempts: 6,
    next_attempt_at: "2026-05-03T00:00:00.000Z",
    payload_json: "{}",
    result_json: "{}",
  };

  afterEach(() => {
    vi.resetAllMocks();
  });

  it("re-edits a queued article and marks the queue entry completed", async () => {
    d1HttpQueryMock.mockImplementation(async (sql: string) => {
      if (sql.includes("SELECT * FROM auto_press_retry_queue")) {
        return { rows: [queueRow] };
      }
      return { rows: [] };
    });
    d1HttpFirstMock.mockImplementation(async (sql: string) => {
      if (sql.includes("SELECT * FROM auto_press_retry_queue")) {
        return { ...queueRow, status: "running", attempts: 1 };
      }
      return null;
    });
    serverGetSettingMock
      .mockResolvedValueOnce({ aiProvider: "gemini", aiModel: "gemini-2.0-flash" })
      .mockResolvedValueOnce([]);
    serverGetAiSettingsMock.mockResolvedValue({ geminiApiKey: "gemini-key" });
    serverGetArticleByIdMock.mockResolvedValue({
      id: "7",
      no: 7,
      title: "Original title",
      category: "공공",
      date: "2026-05-03",
      status: "임시저장",
      views: 0,
      body: "<p>본문 내용이 충분히 긴 기사입니다. 자동 재편집 테스트를 위해 오십 자를 넘는 본문을 준비합니다.</p><img src=\"https://example.com/a.jpg\" />",
      thumbnail: "https://example.com/a.jpg",
    });
    aiEditArticleMock.mockResolvedValue({
      title: "Edited title",
      body: "<p>편집된 본문입니다. 이미지가 없어 원본 이미지를 복원해야 합니다.</p>",
      summary: "요약",
      tags: "문화",
      category: "문화",
    });
    serverUploadImageUrlMock.mockResolvedValue("https://pub.example.r2.dev/a.jpg");

    const { processAutoPressRetryQueue } = await import("@/lib/auto-press-retry-queue");
    const summary = await processAutoPressRetryQueue({ limit: 1 });

    expect(summary).toMatchObject({ processed: 1, success: 1, failed: 0 });
    expect(aiEditArticleMock).toHaveBeenCalledWith(
      "gemini",
      "gemini-2.0-flash",
      "gemini-key",
      "Original title",
      expect.any(String),
      expect.any(String),
      expect.objectContaining({
        maxAttempts: 1,
        retryDelayMs: 0,
        maxOutputTokens: 3072,
        timeoutMs: expect.any(Number),
      }),
    );
    expect(serverUpdateArticleMock).toHaveBeenCalledWith("7", expect.objectContaining({
      title: "Edited title",
      status: "게시",
      aiGenerated: true,
      reviewNote: "AI 재편집 성공 (1회차)",
      thumbnail: "https://pub.example.r2.dev/a.jpg",
    }));
    expect(d1HttpQueryMock.mock.calls.some((call) => String(call[0]).includes("SET status = 'completed'"))).toBe(true);
  });

  it("creates a new article from an unpublished auto-press retry payload only after AI editing succeeds", async () => {
    const unpublishedQueueRow = {
      ...queueRow,
      id: "press_2_0001_retry",
      run_id: "press_2",
      item_id: "press_2_0001",
      article_id: null,
      article_no: null,
      title: "Unpublished source",
      source_url: "https://example.com/unpublished",
      payload_json: JSON.stringify({
        result: {
          retryReasonCode: "AI_RESPONSE_INVALID",
          retryPayload: {
            type: "auto_press_unpublished",
            title: "Unpublished source",
            sourceUrl: "https://example.com/unpublished",
            wrId: "source-1",
            boTable: "rss",
            sourceName: "Newswire",
            bodyText: "This source body is long enough for AI editing and includes enough context for a safe rewritten article.",
            bodyHtml: "<p>This source body is long enough for AI editing and includes enough context for a safe rewritten article.</p><img src=\"https://example.com/source.jpg\" />",
            images: ["https://example.com/source.jpg"],
            category: "공공",
            publishStatus: "게시",
            author: "박영래",
            aiProvider: "gemini",
            aiModel: "gemini-2.5-flash",
            reasonCode: "AI_RESPONSE_INVALID",
          },
        },
      }),
    };

    d1HttpQueryMock.mockImplementation(async (sql: string) => {
      if (sql.includes("SELECT * FROM auto_press_retry_queue")) {
        return { rows: [unpublishedQueueRow] };
      }
      return { rows: [] };
    });
    d1HttpFirstMock.mockImplementation(async (sql: string) => {
      if (sql.includes("SELECT * FROM auto_press_retry_queue")) {
        return { ...unpublishedQueueRow, status: "running", attempts: 1 };
      }
      return null;
    });
    serverGetSettingMock
      .mockResolvedValueOnce({ aiProvider: "gemini", aiModel: "gemini-2.5-flash", category: "공공", publishStatus: "게시", author: "박영래" })
      .mockResolvedValueOnce([]);
    serverGetAiSettingsMock.mockResolvedValue({ geminiApiKey: "gemini-key" });
    serverFindArticleDuplicateMock.mockResolvedValue(null);
    aiEditArticleMock.mockResolvedValue({
      title: "Edited unpublished title",
      body: "<p>Edited body with a substantially different structure and newsroom tone for publication.</p>",
      summary: "Edited summary",
      tags: "문화,공공",
      category: "공공",
    });
    serverUploadImageUrlMock.mockResolvedValue("https://pub.example.r2.dev/source.jpg");
    serverCreateArticleMock.mockResolvedValue(42);

    const { processAutoPressRetryQueue } = await import("@/lib/auto-press-retry-queue");
    const summary = await processAutoPressRetryQueue({ limit: 1 });

    expect(summary).toMatchObject({ processed: 1, success: 1, failed: 0 });
    expect(serverGetArticleByIdMock).not.toHaveBeenCalled();
    expect(serverFindArticleDuplicateMock).toHaveBeenCalledWith({
      title: "Unpublished source",
      sourceUrl: "https://example.com/unpublished",
    });
    expect(serverCreateArticleMock).toHaveBeenCalledWith(expect.objectContaining({
      title: "Edited unpublished title",
      status: "게시",
      sourceUrl: "https://example.com/unpublished",
      aiGenerated: true,
      thumbnail: "https://pub.example.r2.dev/source.jpg",
    }));
    expect(String(serverCreateArticleMock.mock.calls[0][0].body)).toContain("https://pub.example.r2.dev/source.jpg");
    const completeCall = d1HttpQueryMock.mock.calls.find((call) => String(call[0]).includes("SET status = 'completed'"));
    expect(completeCall?.[1]).toEqual(expect.arrayContaining(["42", 42]));
  });

  it("fails gracefully when the AI API key is missing", async () => {
    const originalGeminiKey = process.env.GEMINI_API_KEY;
    delete process.env.GEMINI_API_KEY;
    d1HttpQueryMock.mockImplementation(async (sql: string) => {
      if (sql.includes("SELECT * FROM auto_press_retry_queue")) {
        return { rows: [queueRow] };
      }
      return { rows: [] };
    });
    d1HttpFirstMock.mockResolvedValue({ ...queueRow, status: "running", attempts: 1 });
    serverGetSettingMock
      .mockResolvedValueOnce({ aiProvider: "gemini", aiModel: "gemini-2.0-flash" })
      .mockResolvedValueOnce([]);
    serverGetAiSettingsMock.mockResolvedValue({});

    const { processAutoPressRetryQueue } = await import("@/lib/auto-press-retry-queue");
    const summary = await processAutoPressRetryQueue({ limit: 1 });
    if (originalGeminiKey) process.env.GEMINI_API_KEY = originalGeminiKey;

    expect(summary).toMatchObject({ processed: 1, success: 0, failed: 1 });
    expect(serverGetArticleByIdMock).not.toHaveBeenCalled();
    const failCall = d1HttpQueryMock.mock.calls.find((call) => String(call[0]).includes("SET status = ?"));
    expect(failCall).toBeTruthy();
    const nextAttemptAt = String(failCall?.[1]?.[2] || "");
    const delayMs = new Date(nextAttemptAt).getTime() - Date.now();
    expect(delayMs).toBeGreaterThan(55 * 60 * 1000);
    expect(delayMs).toBeLessThan(65 * 60 * 1000);
  });
});
