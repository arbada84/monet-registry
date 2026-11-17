import { readFileSync } from "node:fs";
import yaml from "js-yaml";
import { afterEach, describe, expect, it, vi } from "vitest";
import scheduler from "../../cloudflare/workers/auto-press-retry-scheduler.js";

const env = { CRON_SECRET: "test-only-secret", SITE_URL: "https://example.test" };

afterEach(() => vi.unstubAllGlobals());

describe("legacy AI retry call policy", () => {
  it("has no automated workflow trigger and requires manual opt-in before calling Vercel", () => {
    const source = readFileSync(".github/workflows/retry-ai-edit.yml", "utf8");
    const workflow = yaml.load(source) as {
      on: { workflow_dispatch: { inputs: { allow_direct_processing: { default: boolean } } } };
      jobs: { retry: { if: string; steps: { run?: string }[] } };
    };
    expect(Object.keys(workflow.on)).toEqual(["workflow_dispatch"]);
    expect(workflow.on.workflow_dispatch.inputs.allow_direct_processing.default).toBe(false);
    expect(workflow.jobs.retry.if).toContain("github.event_name == 'workflow_dispatch'");
    expect(workflow.jobs.retry.if).toContain("inputs.allow_direct_processing == true");
    const run = workflow.jobs.retry.steps[0].run || "";
    expect(run).toContain('"limit":1,"allowDirectProcessing":true');
    expect(run).toContain("--max-time 60");
    expect(run).not.toContain("--retry");
    expect(run).not.toContain("cat /tmp/response");
    expect(run).toContain("exit 1");
  });

  it("reports monitoring-only cron operation without making any upstream call", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const response = await scheduler.fetch(new Request("https://worker.test/"), env);
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      scheduledRetryEnabled: false,
      scheduledUsageMonitoringEnabled: true,
      manualRetryRequiresExplicitOptIn: true,
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects unauthenticated manual requests before any upstream call", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const response = await scheduler.fetch(new Request("https://worker.test/run", { method: "POST" }), env);
    expect(response.status).toBe(401);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([{}, { allowDirectProcessing: false }, { allowDirectProcessing: "true" }])(
    "does not forward manual calls without a boolean emergency approval: %j", async (body) => {
      const fetchMock = vi.fn();
      vi.stubGlobal("fetch", fetchMock);
      const response = await scheduler.fetch(new Request("https://worker.test/run", {
        method: "POST", headers: { authorization: `Bearer ${env.CRON_SECRET}` }, body: JSON.stringify(body),
      }), env);
      expect(response.status).toBe(409);
      expect(fetchMock).not.toHaveBeenCalled();
    },
  );

  it("preserves one bounded manual emergency request with no retry loop", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ success: true, processed: 1 })));
    vi.stubGlobal("fetch", fetchMock);
    const response = await scheduler.fetch(new Request("https://worker.test/run", {
      method: "POST", headers: { authorization: `Bearer ${env.CRON_SECRET}` },
      body: JSON.stringify({ allowDirectProcessing: true, limit: 1 }),
    }), env);
    expect(response.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://example.test/api/cron/retry-ai-edit");
    expect(JSON.parse(init.body)).toMatchObject({ allowDirectProcessing: true, limit: 1 });
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });
});
