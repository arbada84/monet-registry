import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("public policy page metadata", () => {
  for (const route of ["about", "privacy", "terms", "contact", "advertising", "youth-policy"]) {
    it(`keeps ${route} title, description, and self canonical`, () => {
      const source = readFileSync(`src/app/${route}/page.tsx`, "utf8");
      expect(source).toMatch(/title:\s*["']/);
      expect(source).toMatch(/description:\s*["']/);
      expect(source).toContain(`canonical: \`${"${getBaseUrl()}"}/${route}\``);
      expect(source).not.toMatch(/noindex|index:\s*false/i);
    });
  }
});
