import { describe, expect, it, vi } from "vitest";
import { buildContentSecurityPolicy, createCspNonce } from "@/lib/security/csp";

describe("CSP helpers", () => {
  it("builds production script-src with a nonce and without unsafe inline/eval", () => {
    const policy = buildContentSecurityPolicy("abc123", "production");
    const scriptSrc = policy.split("; ").find((part) => part.startsWith("script-src"));

    expect(scriptSrc).toContain("'nonce-abc123'");
    expect(scriptSrc).not.toContain("'unsafe-inline'");
    expect(scriptSrc).not.toContain("'unsafe-eval'");
  });

  it("keeps unsafe-eval only for non-production tooling", () => {
    const policy = buildContentSecurityPolicy("devnonce", "development");

    expect(policy).toContain("'nonce-devnonce'");
    expect(policy).toContain("'unsafe-eval'");
  });

  it("generates a base64 nonce", () => {
    const getRandomValues = vi.spyOn(globalThis.crypto, "getRandomValues");
    const nonce = createCspNonce();

    expect(getRandomValues).toHaveBeenCalled();
    expect(nonce).toMatch(/^[A-Za-z0-9+/]+={0,2}$/);
    expect(nonce.length).toBeGreaterThanOrEqual(20);
  });
});
