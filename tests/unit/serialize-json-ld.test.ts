import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { serializeJsonLd } from "@/lib/serialize-json-ld";

describe("public article and category JSON-LD serialization", () => {
  it("prevents user text closing the script while preserving the structured data", () => {
    const data = { headline: '</script><script>alert("title")</script>', name: "문화 < 공연 > & 축제" };
    const serialized = serializeJsonLd(data);
    expect(serialized).not.toContain("<");
    expect(JSON.parse(serialized)).toEqual(data);
  });

  it.each(["src/app/article/[id]/page.tsx", "src/app/category/[slug]/page.tsx"])("%s uses the safe serializer for both theme branches", (file) => {
    const source = readFileSync(file, "utf8");
    expect(source.match(/__html: serializeJsonLd\(/g)).toHaveLength(2);
    expect(source).not.toMatch(/__html: JSON.stringify\(/);
  });
});
