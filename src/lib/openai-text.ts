import { DEFAULT_OPENAI_TEXT_MODEL, usesOpenAIResponsesApi } from "@/lib/ai-model-options";

export class OpenAITextError extends Error {
  status: number;
  providerMessage?: string;

  constructor(status: number, providerMessage?: string) {
    super(`OpenAI ${status}${providerMessage ? `: ${providerMessage}` : ""}`);
    this.name = "OpenAITextError";
    this.status = status;
    this.providerMessage = providerMessage;
  }
}

type CallOpenAITextOptions = {
  apiKey: string;
  model?: string;
  systemPrompt: string;
  content: string;
  temperature?: number;
  maxOutputTokens?: number;
  timeoutMs?: number;
};

function extractResponseText(data: unknown): string {
  const record = data as {
    output_text?: unknown;
    output?: Array<{ content?: Array<{ type?: string; text?: string }> }>;
    choices?: Array<{ message?: { content?: string } }>;
  };

  if (typeof record.output_text === "string") return record.output_text;

  const chunks: string[] = [];
  for (const item of record.output ?? []) {
    for (const content of item.content ?? []) {
      if ((content.type === "output_text" || content.type === "text") && content.text) {
        chunks.push(content.text);
      }
    }
  }
  if (chunks.length > 0) return chunks.join("");

  return record.choices?.[0]?.message?.content ?? "";
}

async function callResponsesApi(options: Required<CallOpenAITextOptions>): Promise<string> {
  const body: Record<string, unknown> = {
    model: options.model,
    instructions: options.systemPrompt,
    input: options.content,
    max_output_tokens: options.maxOutputTokens,
  };

  // 반복 편집 작업은 낮은 추론 강도로 시작해 비용과 지연 시간을 줄인다.
  body.reasoning = { effort: "low" };

  const resp = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${options.apiKey}` },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(options.timeoutMs),
  });
  const data = await resp.json().catch(() => ({ error: { message: "" } }));
  if (!resp.ok || (data as { error?: { message?: string } }).error) {
    throw new OpenAITextError(resp.status, (data as { error?: { message?: string } }).error?.message);
  }
  return extractResponseText(data);
}

async function callChatCompletionsApi(options: Required<CallOpenAITextOptions>): Promise<string> {
  const resp = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${options.apiKey}` },
    body: JSON.stringify({
      model: options.model,
      messages: [{ role: "system", content: options.systemPrompt }, { role: "user", content: options.content }],
      temperature: options.temperature,
      max_tokens: options.maxOutputTokens,
    }),
    signal: AbortSignal.timeout(options.timeoutMs),
  });
  const data = await resp.json().catch(() => ({ error: { message: "" } }));
  if (!resp.ok || (data as { error?: { message?: string } }).error) {
    throw new OpenAITextError(resp.status, (data as { error?: { message?: string } }).error?.message);
  }
  return extractResponseText(data);
}

export async function callOpenAIText(options: CallOpenAITextOptions): Promise<string> {
  const normalized: Required<CallOpenAITextOptions> = {
    ...options,
    model: options.model || DEFAULT_OPENAI_TEXT_MODEL,
    temperature: options.temperature ?? 0.5,
    maxOutputTokens: options.maxOutputTokens ?? 4096,
    timeoutMs: options.timeoutMs ?? 45_000,
  };

  if (usesOpenAIResponsesApi(normalized.model)) {
    return callResponsesApi(normalized);
  }
  return callChatCompletionsApi(normalized);
}
