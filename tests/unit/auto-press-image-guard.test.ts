import { describe, expect, it } from "vitest";

import {
  ensurePressBodyImage,
  getPressImageCandidates,
  hasPressBodyImage,
  promoteFirstPressBodyImage,
} from "@/lib/auto-press-image-guard";

describe("auto press image guard", () => {
  it("detects usable images before the AI edit step", () => {
    const candidates = getPressImageCandidates({
      bodyHtml: "<p>Body</p>",
      images: ["https://file.newswire.co.kr/data/example.jpg"],
      bodyText: "",
      maxImages: 1,
    });

    expect(candidates).toEqual(["https://file.newswire.co.kr/data/example.jpg"]);
  });

  it("restores a source image when AI output drops all images", () => {
    const restored = ensurePressBodyImage({
      bodyHtml: "<p>Lead paragraph.</p><p>Second paragraph.</p>",
      candidateImages: ["https://file.newswire.co.kr/data/example.jpg"],
      altText: "Example title",
    });

    expect(restored.ok).toBe(true);
    expect(restored.insertedImageUrl).toBe("https://file.newswire.co.kr/data/example.jpg");
    expect(hasPressBodyImage(restored.bodyHtml)).toBe(true);
  });

  it("does not remove the only body image when creating a thumbnail", () => {
    const bodyHtml = "<p>Lead paragraph.</p><figure><img src=\"https://file.newswire.co.kr/data/only.jpg\" alt=\"\" /></figure>";
    const promoted = promoteFirstPressBodyImage(bodyHtml);

    expect(promoted.thumbnailUrl).toBe("https://file.newswire.co.kr/data/only.jpg");
    expect(promoted.removedFromBody).toBe(false);
    expect(hasPressBodyImage(promoted.bodyHtml)).toBe(true);
  });

  it("may remove the first image only when another body image remains", () => {
    const bodyHtml = [
      "<figure><img src=\"https://file.newswire.co.kr/data/first.jpg\" /></figure>",
      "<p>Body paragraph.</p>",
      "<figure><img src=\"https://file.newswire.co.kr/data/second.jpg\" /></figure>",
    ].join("");
    const promoted = promoteFirstPressBodyImage(bodyHtml);

    expect(promoted.thumbnailUrl).toBe("https://file.newswire.co.kr/data/first.jpg");
    expect(promoted.removedFromBody).toBe(true);
    expect(promoted.bodyHtml).not.toContain("first.jpg");
    expect(promoted.bodyHtml).toContain("second.jpg");
  });

  it("fails closed when no body or source image exists", () => {
    const restored = ensurePressBodyImage({
      bodyHtml: "<p>Text only.</p>",
      candidateImages: [],
      altText: "No image",
    });

    expect(restored.ok).toBe(false);
    expect(hasPressBodyImage(restored.bodyHtml)).toBe(false);
  });
});
