import { describe, expect, it } from "vitest";
import { isAllowedIframeSrc, sanitizeIframeHtml } from "@/lib/html-embed-safety";

describe("HTML iframe embed safety", () => {
  it("allows only HTTPS media iframe hosts by default", () => {
    expect(isAllowedIframeSrc("https://www.youtube.com/embed/video-id")).toBe(true);
    expect(isAllowedIframeSrc("https://player.vimeo.com/video/123")).toBe(true);
    expect(isAllowedIframeSrc("https://www.google.com/maps/embed?pb=1")).toBe(false);
    expect(isAllowedIframeSrc("http://www.youtube.com/embed/video-id")).toBe(false);
    expect(isAllowedIframeSrc("javascript:alert(1)")).toBe(false);
    expect(isAllowedIframeSrc("https://www.youtube.com.evil.test/embed/video-id")).toBe(false);
    expect(isAllowedIframeSrc("https://user:pass@www.youtube.com/embed/video-id")).toBe(false);
  });

  it("allows Google Maps only when map embeds are explicitly enabled", () => {
    const src = "https://www.google.com/maps/embed?pb=1";

    expect(isAllowedIframeSrc(src)).toBe(false);
    expect(isAllowedIframeSrc(src, { allowMaps: true })).toBe(true);
  });

  it("removes disallowed iframe tags and preserves surrounding content", () => {
    const html = `<p>before</p><iframe src="https://evil.test/embed"></iframe><p>after</p>`;

    expect(sanitizeIframeHtml(html, { allowScripts: true })).toBe("<p>before</p><p>after</p>");
  });

  it("overwrites risky iframe attributes with the approved sandbox", () => {
    const html = `<iframe src="https://www.youtube.com/embed/video-id" sandbox="allow-top-navigation allow-scripts" srcdoc="bad"></iframe>`;
    const sanitized = sanitizeIframeHtml(html, { allowScripts: true });

    expect(sanitized).toContain(`sandbox="allow-scripts allow-same-origin allow-popups"`);
    expect(sanitized).not.toContain("allow-top-navigation");
    expect(sanitized).not.toContain("srcdoc");
  });

  it("handles quoted iframe attributes that contain angle brackets", () => {
    const html = `<iframe src="https://www.youtube.com/embed/video-id" sandbox="allow-top-navigation allow-scripts" srcdoc="<p>bad</p>"></iframe>`;
    const sanitized = sanitizeIframeHtml(html, { allowScripts: true });

    expect(sanitized).toBe(
      `<iframe src="https://www.youtube.com/embed/video-id" sandbox="allow-scripts allow-same-origin allow-popups"></iframe>`,
    );
  });

  it("keeps map iframes without script permission when maps are enabled without scripts", () => {
    const html = `<iframe src="https://www.google.com/maps/embed?pb=1"></iframe>`;

    expect(sanitizeIframeHtml(html, { allowMaps: true })).toBe(
      `<iframe src="https://www.google.com/maps/embed?pb=1" sandbox="allow-same-origin allow-popups"></iframe>`,
    );
  });
});
