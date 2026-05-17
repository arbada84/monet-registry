import { afterEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";

describe("netpro origin proxy auth", () => {
  const previousSecret = process.env.AUTO_PRESS_WORKER_SECRET;

  afterEach(() => {
    if (previousSecret === undefined) delete process.env.AUTO_PRESS_WORKER_SECRET;
    else process.env.AUTO_PRESS_WORKER_SECRET = previousSecret;
  });

  it("fails closed when the Worker secret is not configured", async () => {
    delete process.env.AUTO_PRESS_WORKER_SECRET;
    const { GET } = await import("@/app/api/netpro/origin/route");

    const response = await GET(new NextRequest("https://culturepeople.co.kr/api/netpro/origin?url=https://example.com"));
    const json = await response.json();

    expect(response.status).toBe(503);
    expect(json.success).toBe(false);
  });

  it("requires a valid Worker bearer token before proxying", async () => {
    process.env.AUTO_PRESS_WORKER_SECRET = "worker-secret";
    const { GET } = await import("@/app/api/netpro/origin/route");

    const response = await GET(new NextRequest("https://culturepeople.co.kr/api/netpro/origin?url=https://example.com"));
    const json = await response.json();

    expect(response.status).toBe(401);
    expect(json.success).toBe(false);
  });

  it("continues to reject unsafe URLs after valid Worker auth", async () => {
    process.env.AUTO_PRESS_WORKER_SECRET = "worker-secret";
    const { GET } = await import("@/app/api/netpro/origin/route");

    const response = await GET(new NextRequest("https://culturepeople.co.kr/api/netpro/origin?url=http://127.0.0.1:3000", {
      headers: { authorization: "Bearer worker-secret" },
    }));
    const json = await response.json();

    expect(response.status).toBe(400);
    expect(json.success).toBe(false);
  });
});
