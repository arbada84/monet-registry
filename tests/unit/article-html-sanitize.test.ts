import { describe, expect, it } from "vitest";
import { sanitizeArticleHtml } from "@/lib/article-html-sanitize";

describe("article HTML sanitizer", () => {
  it("removes active markup and dangerous URL attributes before SSR", () => {
    const html = [
      '<p onclick="alert(1)" style="background:url(javascript:alert(1))">Hello</p>',
      "<script>alert(1)</script>",
      '<a href="java&#x73;cript:alert(1)">bad link</a>',
      '<img src="data:text/html;base64,PHNjcmlwdD5iYWQ8L3NjcmlwdD4=" onerror="alert(1)">',
    ].join("");

    const sanitized = sanitizeArticleHtml(html);

    expect(sanitized).toContain("<p>Hello</p>");
    expect(sanitized).not.toContain("<script");
    expect(sanitized).not.toContain("onclick");
    expect(sanitized).not.toContain("style=");
    expect(sanitized).not.toContain("javascript:");
    expect(sanitized).not.toContain("data:text/html");
    expect(sanitized).not.toContain("onerror");
  });

  it("keeps allowed media and map iframes while removing unsafe iframe markup", () => {
    const html = [
      '<iframe src="https://www.youtube.com/embed/video-id" sandbox="allow-top-navigation allow-scripts" srcdoc="bad"></iframe>',
      '<iframe src="https://www.google.com/maps/embed?pb=1" sandbox="allow-top-navigation allow-scripts" srcdoc="bad"></iframe>',
      '<iframe src="javascript:alert(1)"></iframe>',
      '<iframe src="https://evil.example/embed"></iframe>',
    ].join("");

    const sanitized = sanitizeArticleHtml(html, { allowMaps: true, allowScripts: true });

    expect(sanitized.match(/<iframe/g)?.length).toBe(2);
    expect(sanitized).toContain('src="https://www.youtube.com/embed/video-id"');
    expect(sanitized).toContain('src="https://www.google.com/maps/embed?pb=1"');
    expect(sanitized).toContain('sandbox="allow-scripts allow-same-origin allow-popups"');
    expect(sanitized).not.toContain("srcdoc");
    expect(sanitized).not.toContain("javascript:alert");
    expect(sanitized).not.toContain("evil.example");
  });
});
