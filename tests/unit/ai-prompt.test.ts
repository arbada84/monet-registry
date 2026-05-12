import { afterEach, describe, expect, it, vi } from "vitest";

import { callGemini } from "@/lib/ai-prompt";

describe("AI prompt provider calls", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("asks Gemini for JSON output to reduce auto-press parsing retries", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        candidates: [
          {
            content: {
              parts: [{ text: "{\"title\":\"테스트\",\"body\":\"<p>본문</p>\"}" }],
            },
          },
        ],
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await callGemini("gemini-key", "gemini-2.0-flash", "system", "content");

    expect(result).toContain("\"title\"");
    const requestBody = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(requestBody.generationConfig).toMatchObject({
      responseMimeType: "application/json",
      temperature: 0.5,
      maxOutputTokens: 4096,
    });
  });
});
