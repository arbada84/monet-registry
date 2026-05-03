import { describe, expect, it } from "vitest";
import { normalizeAutoPressCount } from "@/lib/auto-press-count";

describe("auto-press count normalization", () => {
  it("keeps counts above the old 100 article UI cap", () => {
    expect(normalizeAutoPressCount(250)).toBe(250);
    expect(normalizeAutoPressCount("3000")).toBe(3000);
  });

  it("normalizes invalid or unsafe counts without an upper cap", () => {
    expect(normalizeAutoPressCount(0)).toBe(1);
    expect(normalizeAutoPressCount(-10)).toBe(1);
    expect(normalizeAutoPressCount(12.8)).toBe(12);
    expect(normalizeAutoPressCount("not-a-number", 25)).toBe(25);
  });
});
