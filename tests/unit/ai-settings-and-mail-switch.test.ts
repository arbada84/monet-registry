import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("server-only", () => ({}));
const mocks = vi.hoisted(() => ({ read: vi.fn(), save: vi.fn(), create: vi.fn(), edit: vi.fn(), publish: vi.fn() }));
vi.mock("@/lib/db-server", () => ({ serverGetSetting: mocks.read, serverSaveSetting: mocks.save, serverCreateArticle: mocks.create }));
vi.mock("next/cache", () => ({ revalidateTag: vi.fn(), revalidatePath: vi.fn() }));
vi.mock("@/lib/cookie-auth", () => ({ verifyAuthToken: async () => ({ valid: true }), timingSafeEqual: (a: string, b: string) => a === b }));
vi.mock("@/lib/server-upload-image", () => ({ serverMigrateBodyImages: async (s: string) => s, serverUploadImageUrl: async (s: string) => s }));
vi.mock("@/lib/portal-publication", () => ({ publishArticleToPortals: mocks.publish }));
vi.mock("@/lib/ai-prompt", () => ({ aiEditArticle: mocks.edit, VALID_CATEGORIES: ["문화"] }));

import { GET, PUT } from "@/app/api/db/settings/route";
import { POST } from "@/app/api/mail/register/route";

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("OPENAI_API_KEY", "");
  vi.stubEnv("GEMINI_API_KEY", "");
  mocks.create.mockResolvedValue(123);
  mocks.publish.mockResolvedValue({ submitted: true });
});
afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); });

describe("AI settings switch validation", () => {
  it("does not send API keys to the automation provider picker", async () => {
    mocks.read.mockResolvedValue({ provider: "openai", openaiModel: "gpt-6-luna", openaiApiKey: "private-test-key", geminiApiKey: "private-other-key" });
    const response = await GET(new NextRequest("https://example.test/api/db/settings?key=cp-ai-settings&selectionOnly=1"));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ success: true, value: { provider: "openai", openaiModel: "gpt-6-luna" } });
  });
  it("does not save an OpenAI switch without a configured key", async () => {
    mocks.read.mockResolvedValue({ provider: "gemini", geminiApiKey: "test-gemini" });
    const response = await PUT(new NextRequest("https://example.test/api/db/settings", {
      method: "PUT", body: JSON.stringify({ key: "cp-ai-settings", value: { provider: "openai" } }),
    }));
    expect(response.status).toBe(400);
    expect(mocks.save).not.toHaveBeenCalled();
  });

  it("retains the stored key when a masked form value is submitted", async () => {
    mocks.read.mockResolvedValue({ provider: "openai", openaiApiKey: "test-original-key" });
    const response = await PUT(new NextRequest("https://example.test/api/db/settings", {
      method: "PUT", body: JSON.stringify({ key: "cp-ai-settings", value: { openaiApiKey: "tes****-key", openaiModel: "gpt-6-luna" } }),
    }));
    expect(response.status).toBe(200);
    expect(mocks.save).toHaveBeenCalledWith("cp-ai-settings", expect.objectContaining({ provider: "openai", openaiApiKey: "test-original-key", openaiModel: "gpt-6-luna" }));
  });
});

describe("mail provider switch and publication gate", () => {
  const request = () => new NextRequest("https://example.test/api/mail/register", {
    method: "POST", body: JSON.stringify({ mode: "ai", items: [{ subject: "제목", bodyHtml: "<p>원문</p>", bodyText: "원문", images: [], attachmentContents: [], from: "test@example.test" }] }),
  });

  it("keeps missing-key AI mail as a draft and does not submit it to portals", async () => {
    mocks.read.mockResolvedValue({ provider: "openai", openaiModel: "gpt-6-luna" });
    const response = await POST(request());
    const data = await response.json();
    expect(data).toMatchObject({ registered: 1, published: 0, drafts: 1 });
    expect(mocks.create).toHaveBeenCalledWith(expect.objectContaining({ status: "임시저장", aiGenerated: false }));
    expect(mocks.edit).not.toHaveBeenCalled();
    expect(mocks.publish).not.toHaveBeenCalled();
  });

  it("uses common provider/model fields and only publishes a successful edit", async () => {
    mocks.read.mockResolvedValue({ provider: "openai", openaiModel: "gpt-6-luna", openaiApiKey: "test-key" });
    mocks.edit.mockResolvedValue({ title: "편집 제목", body: "<p>편집 본문</p>", summary: "요약", tags: "문화", category: "문화" });
    const data = await (await POST(request())).json();
    expect(data).toMatchObject({ published: 1, drafts: 0 });
    expect(mocks.edit).toHaveBeenCalledWith("openai", "gpt-6-luna", "test-key", expect.any(String), expect.any(String), expect.any(String));
    expect(mocks.publish).toHaveBeenCalledTimes(1);
  });

  it("keeps provider failures as drafts without publishing the raw source", async () => {
    mocks.read.mockResolvedValue({ provider: "openai", openaiModel: "gpt-6-luna", openaiApiKey: "test-key" });
    mocks.edit.mockRejectedValue(new Error("test quota failure"));
    vi.spyOn(console, "error").mockImplementation(() => {});
    const data = await (await POST(request())).json();
    expect(data).toMatchObject({ published: 0, drafts: 1 });
    expect(mocks.publish).not.toHaveBeenCalled();
  });
});
