import { afterEach, describe, expect, it, vi } from "vitest";
import { OPENAI_TEXT_MODELS } from "@/lib/ai-model-options";
import { callOpenAIText } from "@/lib/openai-text";

afterEach(() => vi.unstubAllGlobals());

describe("current OpenAI model selection compatibility", () => {
  it.each(["gpt-6.1-sol", "gpt-6.1-terra", "gpt-6-luna", "gpt-6-astra"])("lists and routes %s through Responses without incompatible sampling", async (model) => {
    expect(OPENAI_TEXT_MODELS.some((option) => option.value === model)).toBe(true);
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ output_text: "fixture output" })));
    vi.stubGlobal("fetch", fetchMock);
    expect(await callOpenAIText({ apiKey: "fixture-not-a-real-key", model, systemPrompt: "fixture", content: "fixture" })).toBe("fixture output");
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.openai.com/v1/responses");
    const payload = JSON.parse(init.body);
    expect(payload).toMatchObject({ model, reasoning: { effort: "low" } });
    expect(payload).not.toHaveProperty("temperature");
    expect(payload).not.toHaveProperty("max_tokens");
  });

  it("does not invent a GPT-6.1 Luna identifier", () => {
    expect(OPENAI_TEXT_MODELS.map((option) => option.value)).not.toContain("gpt-6.1-luna");
  });
});
