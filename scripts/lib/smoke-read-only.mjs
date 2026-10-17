export async function installReadOnlyGuard(page, baseUrl) {
  const blocked = [];
  const origin = new URL(baseUrl).origin;
  await page.setRequestInterception(true);
  page.on("request", async (request) => {
    if (request.isInterceptResolutionHandled()) return;
    if (["GET", "HEAD", "OPTIONS"].includes(request.method().toUpperCase())) {
      await request.continue();
      return;
    }
    const url = new URL(request.url());
    const telemetry = url.origin === origin && request.method() === "POST" && url.pathname === "/api/db/activity-logs";
    // Never retain request bodies, query parameters, credentials or signed URLs.
    blocked.push({ method: request.method(), path: url.origin === origin ? url.pathname : "external", telemetry });
    await request.respond({ status: telemetry ? 204 : 403, body: "" });
  });
  return blocked;
}
