import { describe, expect, it } from "vitest";
import {
  formatBytes,
  formatDuration,
  formatHashtags,
  normalizeHashtags,
  validateContentChecks,
  validateReviewFile,
  validateReviewMetadata,
} from "@/lib/tiktok-review/validation";

describe("TikTok review validation", () => {
  it("accepts MP4 and MOV only when extension and MIME type agree", () => {
    expect(validateReviewFile({ name: "demo.mp4", size: 1200, type: "video/mp4" }).valid).toBe(true);
    expect(validateReviewFile({ name: "demo.mov", size: 1200, type: "video/quicktime" }).valid).toBe(true);
    expect(validateReviewFile({ name: "demo.mp4", size: 1200, type: "application/octet-stream" }).valid).toBe(false);
    expect(validateReviewFile({ name: "demo.webm", size: 1200, type: "video/webm" }).valid).toBe(false);
    expect(validateReviewFile({ name: "demo.mov", size: 0, type: "video/quicktime" }).valid).toBe(false);
  });

  it("normalizes Korean hashtags, removes invalid characters and deduplicates", () => {
    expect(normalizeHashtags("#문화, 문화 #전시! #K_ART")).toEqual(["문화", "전시", "K_ART"]);
    expect(formatHashtags("문화, #전시! 문화")).toBe("#문화 #전시");
  });

  it("requires title, caption, language and all content confirmations", () => {
    expect(validateReviewMetadata({ title: "", caption: "", hashtags: "", language: "", internalNote: "" }).valid).toBe(false);
    expect(validateReviewMetadata({ title: "제목", caption: "캡션", hashtags: "#문화", language: "ko", internalNote: "" }).valid).toBe(true);
    expect(validateContentChecks({ rightsConfirmed: true, noCopiedWatermark: true, privacyReviewed: true, guidelinesReviewed: true, aiContent: "no", commercialContent: "no" }).valid).toBe(true);
    expect(validateContentChecks({ rightsConfirmed: true, noCopiedWatermark: true, privacyReviewed: true, guidelinesReviewed: false, aiContent: "", commercialContent: "" }).valid).toBe(false);
  });

  it("formats video measurements for the UI", () => {
    expect(formatBytes(1024 * 1024)).toBe("1.0 MB");
    expect(formatDuration(65)).toBe("1:05");
  });
});

