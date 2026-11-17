import { afterEach, describe, expect, it, vi } from "vitest";
import { resolveAiSelection } from "@/lib/ai-selection";
import { callOpenAIText } from "@/lib/openai-text";
import { DEFAULT_OPENAI_TEXT_MODEL } from "@/lib/ai-model-options";
import { loadWorkerAiSettings, workerAiSelection, editWithSelectedAi, readWorkerAiStatus } from "../../cloudflare/auto-press-worker/src/index.js";

afterEach(() => vi.unstubAllGlobals());

describe("AI provider switch", () => {
  const global = { provider: "openai", openaiModel: "gpt-6-luna", openaiApiKey: "test-only-key" };
  const old = { aiProvider: "gemini", aiModel: "gemini-2.5-flash-lite", useGlobalAiSettings: true };

  it("uses the common provider and model despite old automation fields", () => {
    expect(resolveAiSelection(global, old)).toEqual({ provider: "openai", model: "gpt-6-luna" });
    expect(resolveAiSelection(global)).toEqual({ provider: "openai", model: "gpt-6-luna" });
    expect(resolveAiSelection(global, { ...old, useGlobalAiSettings: false })).toEqual({ provider: "gemini", model: "gemini-2.5-flash-lite" });
    expect(resolveAiSelection({ aiProvider: "openai", aiModel: "gpt-5.5" })).toEqual({ provider: "openai", model: "gpt-5.5" });
    expect(resolveAiSelection({ provider: "openai", openaiModel: "gemini-2.5-flash" })).toEqual({ provider: "openai", model: DEFAULT_OPENAI_TEXT_MODEL });
  });

  it("does not accept an unknown provider or silently downgrade it to Gemini", () => {
    expect(() => resolveAiSelection({ provider: "invalid" })).toThrow("Unsupported AI provider");
  });

  it("preserves legacy automation settings until common settings are explicitly enabled", () => {
    const legacy = { aiProvider: "gemini", aiModel: "gemini-2.5-flash" };
    expect(resolveAiSelection(global, legacy)).toEqual({ provider: "gemini", model: "gemini-2.5-flash" });
    expect(resolveAiSelection(global, {})).toMatchObject({ provider: "gemini" });
    expect(workerAiSelection({ AI_PROVIDER: "gemini", GEMINI_MODEL: "gemini-2.5-flash" }, { global, automation: legacy })).toEqual(resolveAiSelection(global, legacy));
    expect(workerAiSelection({}, { global, automation: { ...legacy, useGlobalAiSettings: true } }, legacy)).toEqual({ provider: "openai", model: "gpt-6-luna" });
  });

  it("honors manual model selection when common settings are disabled", () => {
    expect(workerAiSelection({}, { global, automation: { ...old, useGlobalAiSettings: false } }, { aiProvider: "openai", aiModel: "gpt-4.1-mini" })).toEqual({ provider: "openai", model: "gpt-4.1-mini" });
  });

  it("reports AI configuration failures without exposing settings or crashing health diagnostics", async () => {
    const result = await readWorkerAiStatus({ DB: { prepare: () => ({ bind: () => ({ all: async () => { throw new Error("private test-key"); } }) }) } });
    expect(result).toEqual({ settingsReadable: false, keyConfigured: false, error: "AI_SETTINGS_UNAVAILABLE" });
    await expect(loadWorkerAiSettings({})).rejects.toThrow("database");
  });

  it.each(["gpt-6.1-sol", "gpt-6.1-terra", "gpt-6-luna", "gpt-6-astra", "gpt-5.5"])("uses compatible Responses parameters for %s", async (model) => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ status: "completed", output: [{ type: "reasoning" }, { type: "message", content: [{ type: "output_text", text: "result" }] }] })));
    vi.stubGlobal("fetch", fetchMock);
    expect(await callOpenAIText({ apiKey: "test-key", model, systemPrompt: "system", content: "input" })).toBe("result");
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.openai.com/v1/responses");
    const body = JSON.parse(init.body);
    expect(body).toMatchObject({ model, store: false, reasoning: { effort: "low" }, max_output_tokens: 4096 });
    expect(body).not.toHaveProperty("temperature");
    expect(body).not.toHaveProperty("max_tokens");
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it.each([null, {}, { status: "incomplete", output_text: "partial" }, { output_text: "" }])("rejects invalid or truncated response %j", async (data) => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify(data))));
    await expect(callOpenAIText({ apiKey: "test-key", systemPrompt: "system", content: "input" })).rejects.toThrow();
  });

  it("keeps the existing legacy chat endpoint", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ choices: [{ message: { content: "legacy" }, finish_reason: "stop" }] })));
    vi.stubGlobal("fetch", fetchMock);
    expect(await callOpenAIText({ apiKey: "test", model: "gpt-4.1-mini", systemPrompt: "system", content: "input" })).toBe("legacy");
    expect(fetchMock.mock.calls[0][0]).toBe("https://api.openai.com/v1/chat/completions");
  });

  it("takes a new Worker snapshot when settings change, not the queued run provider", async () => {
    let provider = "openai";
    const all = vi.fn(async () => ({ results: [
      { key: "cp-ai-settings", value_json: JSON.stringify({ ...global, provider }) },
      { key: "cp-auto-press-settings", value_json: JSON.stringify(old) },
    ] }));
    const env = { DB: { prepare: () => ({ bind: () => ({ all }) }) } };
    const first = await loadWorkerAiSettings(env);
    expect(workerAiSelection(env, first, old)).toMatchObject({ provider: "openai", model: "gpt-6-luna" });
    provider = "gemini";
    const second = await loadWorkerAiSettings(env);
    expect(workerAiSelection(env, second, old).provider).toBe("gemini");
    expect(workerAiSelection(env, first, old).provider).toBe("openai");
    expect(all).toHaveBeenCalledTimes(2);
  });

  it("does not fall back to Gemini when the OpenAI key is absent", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await expect(editWithSelectedAi({ GEMINI_API_KEY: "existing-gemini" }, {}, {}, { global: { provider: "openai" }, automation: old })).rejects.toThrow("openai API key");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("does not propagate provider messages containing secret fragments into retry logs", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ error: { code: "invalid_api_key", message: "Incorrect API key provided: private-test-key" } }, { status: 401 })));
    await expect(callOpenAIText({ apiKey: "private-test-key", model: "gpt-6-luna", systemPrompt: "system", content: "input" })).rejects.toThrow("invalid_api_key");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ error: { code: "invalid_api_key", message: "Incorrect API key provided: private-test-key" } }, { status: 401 })));
    try { await callOpenAIText({ apiKey: "private-test-key", model: "gpt-6-luna", systemPrompt: "system", content: "input" }); }
    catch (error) { expect(String(error)).not.toContain("private-test-key"); }
  });

  it("fails closed on unreadable Worker settings", async () => {
    const env = { DB: { prepare: () => ({ bind: () => ({ all: async () => { throw new Error("DB unavailable"); } }) }) } };
    await expect(loadWorkerAiSettings(env)).rejects.toThrow("DB unavailable");
  });

  it("edits on Worker using only OpenAI and retains JSON/body validation", async () => {
    const edited = { title: "Title", summary: "Summary", bodyHtml: `<p>${"본문 ".repeat(100)}</p>`, category: "문화", tags: ["문화"] };
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ status: "completed", output_text: JSON.stringify(edited) })));
    vi.stubGlobal("fetch", fetchMock);
    const env = { DB: { prepare: () => ({ bind: () => ({ run: async () => ({ success: true }) }) }) } };
    const result = await editWithSelectedAi(env, { title: "Source", bodyText: "Source facts" }, old, { global, automation: old });
    expect(result).toMatchObject({ title: "Title", category: "문화" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe("https://api.openai.com/v1/responses");
  });
});
