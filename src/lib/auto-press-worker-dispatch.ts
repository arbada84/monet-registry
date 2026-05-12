import "server-only";

interface DispatchAutoPressWorkerInput {
  runId: string;
  limit?: number;
}

function clean(value?: string): string {
  return String(value || "").trim().replace(/^["']|["']$/g, "");
}

export function getAutoPressWorkerDispatchStatus() {
  const enqueueUrl = clean(process.env.AUTO_PRESS_WORKER_ENQUEUE_URL);
  const secret = clean(process.env.AUTO_PRESS_WORKER_SECRET);
  return {
    configured: Boolean(enqueueUrl && secret),
    hasEnqueueUrl: Boolean(enqueueUrl),
    hasSecret: Boolean(secret),
  };
}

export async function dispatchAutoPressWorker(input: DispatchAutoPressWorkerInput): Promise<{
  configured: boolean;
  ok: boolean;
  status?: number;
  enqueued?: number;
  error?: string;
}> {
  const enqueueUrl = clean(process.env.AUTO_PRESS_WORKER_ENQUEUE_URL);
  const secret = clean(process.env.AUTO_PRESS_WORKER_SECRET);
  if (!enqueueUrl || !secret) {
    return {
      configured: false,
      ok: false,
      error: "AUTO_PRESS_WORKER_ENQUEUE_URL 또는 AUTO_PRESS_WORKER_SECRET이 설정되지 않았습니다.",
    };
  }

  try {
    const response = await fetch(enqueueUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${secret}`,
      },
      body: JSON.stringify({
        runId: input.runId,
        limit: input.limit || 100,
      }),
      cache: "no-store",
      signal: AbortSignal.timeout(8000),
    });
    const data = await response.json().catch(() => ({})) as { success?: boolean; enqueued?: number; error?: string };
    return {
      configured: true,
      ok: response.ok && data.success !== false,
      status: response.status,
      enqueued: Number(data.enqueued || 0),
      error: response.ok ? data.error : data.error || `HTTP ${response.status}`,
    };
  } catch (error) {
    return {
      configured: true,
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export async function processAutoPressWorkerQueue(input: { limit?: number } = {}): Promise<{
  configured: boolean;
  ok: boolean;
  status?: number;
  processed?: number;
  error?: string;
}> {
  const enqueueUrl = clean(process.env.AUTO_PRESS_WORKER_ENQUEUE_URL);
  const processUrl = clean(process.env.AUTO_PRESS_WORKER_PROCESS_URL)
    || (enqueueUrl ? enqueueUrl.replace(/\/enqueue\/?$/, "/process") : "");
  const secret = clean(process.env.AUTO_PRESS_WORKER_SECRET);
  if (!processUrl || !secret) {
    return {
      configured: false,
      ok: false,
      error: "AUTO_PRESS_WORKER_PROCESS_URL 또는 AUTO_PRESS_WORKER_SECRET이 설정되지 않았습니다.",
    };
  }

  try {
    const response = await fetch(processUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${secret}`,
      },
      body: JSON.stringify({ limit: input.limit || 3 }),
      cache: "no-store",
      signal: AbortSignal.timeout(30000),
    });
    const data = await response.json().catch(() => ({})) as { success?: boolean; processed?: number; error?: string };
    return {
      configured: true,
      ok: response.ok && data.success !== false,
      status: response.status,
      processed: Number(data.processed || 0),
      error: response.ok ? data.error : data.error || `HTTP ${response.status}`,
    };
  } catch (error) {
    return {
      configured: true,
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
