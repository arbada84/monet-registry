import { describe, expect, it } from "vitest";
import {
  DEFAULT_GEMINI_TEXT_MODEL,
  DEFAULT_OPENAI_AUTOMATION_MODEL,
  DEFAULT_OPENAI_TEXT_MODEL,
  GEMINI_TEXT_MODELS,
  getDefaultModelForProvider,
  OPENAI_TEXT_MODELS,
  usesOpenAIResponsesApi,
} from "@/lib/ai-model-options";

describe("ai model options", () => {
  it("uses currently recommended stable defaults for automation", () => {
    expect(DEFAULT_GEMINI_TEXT_MODEL).toBe("gemini-2.5-flash");
    expect(DEFAULT_OPENAI_AUTOMATION_MODEL).toBe("gpt-4.1-mini");
    expect(getDefaultModelForProvider("gemini", "automation")).toBe("gemini-2.5-flash");
    expect(getDefaultModelForProvider("openai", "automation")).toBe("gpt-4.1-mini");
  });

  it("lists modern Gemini text models and keeps deprecated 2.0 only as compatibility", () => {
    const values = GEMINI_TEXT_MODELS.map((model) => model.value);
    expect(values).toContain("gemini-2.5-flash");
    expect(values).toContain("gemini-3.1-pro-preview");
    expect(values).not.toContain("gemini-1.5-flash");
    expect(values).not.toContain("gemini-3-pro-preview");
    expect(values.every((value) => !/image|tts|computer-use|customtools/.test(value))).toBe(true);
    expect(GEMINI_TEXT_MODELS.find((model) => model.value === "gemini-2.0-flash")?.label).toContain("지원 종료 예정");
  });

  it("lists GPT-5 defaults without losing Chat Completions-compatible automation models", () => {
    const values = OPENAI_TEXT_MODELS.map((model) => model.value);
    expect(DEFAULT_OPENAI_TEXT_MODEL).toBe("gpt-5.5");
    expect(values[0]).toBe("gpt-5.5");
    expect(values).toContain("gpt-4.1-mini");
    expect(values).not.toContain("o1-preview");
    expect(values).not.toContain("gpt-4-turbo");
  });

  it("routes GPT-5 and o-series models through the Responses API", () => {
    expect(usesOpenAIResponsesApi("gpt-5.5")).toBe(true);
    expect(usesOpenAIResponsesApi("gpt-5.4-mini")).toBe(true);
    expect(usesOpenAIResponsesApi("o3-mini")).toBe(true);
    expect(usesOpenAIResponsesApi("gpt-4.1-mini")).toBe(false);
  });
});
