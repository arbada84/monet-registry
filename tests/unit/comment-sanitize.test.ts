import { describe, expect, it } from "vitest";
import { sanitizeCommentText } from "@/lib/comment-sanitize";

describe("comment sanitizer", () => {
  it("removes HTML tags and strips entity-encoded tags before escaping text", () => {
    const input = `<img src=x onerror=alert(1)>Hello &lt;b onclick=evil()&gt;safe&lt;/b&gt; "quote" &`;

    expect(sanitizeCommentText(input)).toBe("Hello safe &quot;quote&quot; &amp;");
  });

  it("trims and escapes apostrophes and angle brackets left as plain text", () => {
    expect(sanitizeCommentText("  5 < 7 and user's note  ")).toBe("5 &lt; 7 and user&#x27;s note");
  });
});
