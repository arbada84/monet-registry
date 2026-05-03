import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const d1HttpQueryMock = vi.fn();
const d1HttpFirstMock = vi.fn();
const serverGetArticleByIdMock = vi.fn();
const serverGetArticleByNoMock = vi.fn();
const serverGetSettingMock = vi.fn();
const serverSaveSettingMock = vi.fn();
const serverUpdateArticleMock = vi.fn();
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
    expect(serverUpdateArticleMock).toHaveBeenCalledWith("7", expect.objectContaining({
      title: "Edited title",
      status: "게시",
      aiGenerated: true,
      reviewNote: "AI 재편집 성공 (1회차)",
      thumbnail: "https://pub.example.r2.dev/a.jpg",
    }));
    expect(d1HttpQueryMock.mock.calls.some((call) => String(call[0]).includes("SET status = 'completed'"))).toBe(true);
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
    expect(d1HttpQueryMock.mock.calls.some((call) => String(call[0]).includes("SET status = ?"))).toBe(true);
  });
});
