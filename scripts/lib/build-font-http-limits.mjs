function isGoogleFontRequest(input) {
  try {
    const url = typeof input === "string" || input instanceof URL
      ? new URL(input)
      : new URL(`https://${input.hostname || input.host}`);
    return ["fonts.googleapis.com", "fonts.gstatic.com"].includes(url.hostname);
  } catch {
    return false;
  }
}

export function limitBuildFontRequests(client, timeoutMs = 60_000) {
  client.globalAgent.maxSockets = Math.min(client.globalAgent.maxSockets, 8);
  const original = client.request;
  client.request = function (...args) {
    const request = original.apply(this, args);
    if (!isGoogleFontRequest(args[0])) return request;
    // Include agent queue, DNS, TLS and body stalls in the build-only deadline.
    const timer = setTimeout(() => request.destroy(new Error("Google Fonts build request exceeded 60s deadline")), timeoutMs);
    timer.unref?.();
    const clear = () => clearTimeout(timer);
    request.once("close", clear);
    request.once("error", clear);
    request.once("response", (response) => response.once("end", clear));
    return request;
  };
}
