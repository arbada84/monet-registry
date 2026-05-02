const DEFAULT_SITE_URL = "https://culturepeople.co.kr";
const DEFAULT_RETRY_LIMIT = 2;

function json(data, init = {}) {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: {
      "content-type": "application/json; charset=utf-8",
      ...(init.headers || {}),
    },
  });
}

function getSiteUrl(env) {
  return String(env.SITE_URL || DEFAULT_SITE_URL).replace(/\/+$/, "");
}

function getRetryLimit(env) {
  const parsed = Number(env.RETRY_LIMIT || DEFAULT_RETRY_LIMIT);
  if (!Number.isFinite(parsed)) return DEFAULT_RETRY_LIMIT;
  return Math.max(1, Math.min(Math.trunc(parsed), 5));
}

async function runRetryQueue(env, trigger) {
  if (!env.CRON_SECRET) {
    return {
      ok: false,
      status: 500,
      trigger,
      error: "CRON_SECRET is not configured on the Worker.",
    };
  }

  const endpoint = `${getSiteUrl(env)}/api/cron/retry-ai-edit`;
  const limit = getRetryLimit(env);
  const startedAt = new Date().toISOString();

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "authorization": `Bearer ${env.CRON_SECRET}`,
        "content-type": "application/json; charset=utf-8",
        "user-agent": "CulturePeople-Cloudflare-Retry-Scheduler/1.0",
      },
      body: JSON.stringify({ limit }),
    });
    const text = await response.text();
    let data = null;
    try {
      data = JSON.parse(text);
    } catch {
      data = { raw: text.slice(0, 500) };
    }

    return {
      ok: response.ok && data?.success !== false,
      status: response.status,
      trigger,
      endpoint,
      limit,
      startedAt,
      completedAt: new Date().toISOString(),
      data,
    };
  } catch (error) {
    return {
      ok: false,
      status: 502,
      trigger,
      endpoint,
      limit,
      startedAt,
      completedAt: new Date().toISOString(),
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (request.method === "GET" && url.pathname === "/") {
      return json({
        ok: true,
        service: "culturepeople-auto-press-retry-scheduler",
        schedule: "0 * * * *",
      });
    }

    if (request.method === "POST" && url.pathname === "/run") {
      const auth = request.headers.get("authorization") || "";
      if (!env.CRON_SECRET || auth !== `Bearer ${env.CRON_SECRET}`) {
        return json({ ok: false, error: "Unauthorized" }, { status: 401 });
      }
      const result = await runRetryQueue(env, "manual");
      return json(result, { status: result.ok ? 200 : result.status || 500 });
    }

    return json({ ok: false, error: "Not found" }, { status: 404 });
  },

  async scheduled(event, env, ctx) {
    ctx.waitUntil(runRetryQueue(env, event.cron).then((result) => {
      if (!result.ok) {
        console.warn("[auto-press-retry-scheduler] failed", JSON.stringify(result));
      } else {
        console.log("[auto-press-retry-scheduler] completed", JSON.stringify({
          status: result.status,
          processed: result.data?.processed,
          succeeded: result.data?.succeeded,
          failed: result.data?.failed,
        }));
      }
    }));
  },
};
