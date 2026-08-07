import { describe, expect, it } from "vitest";
import { formatArticlePublishedAt, resolveArticlePublishedAt } from "@/lib/article-publication-date";

describe("article publication date", () => {
  it("uses the precise creation timestamp for an immediately published article on the same KST date", () => {
    const article = {
      date: "2026-08-06",
      createdAt: "2026-08-06T09:52:57.553Z",
    };

    expect(resolveArticlePublishedAt(article)).toBe("2026-08-06T09:52:57.553Z");
    expect(formatArticlePublishedAt(article)).toBe("2026-08-06 18:52");
  });

  it("prefers a scheduled publication timestamp on the editorial date", () => {
    expect(resolveArticlePublishedAt({
      date: "2026-08-06",
      createdAt: "2026-08-05T01:00:00.000Z",
      scheduledPublishAt: "2026-08-06T02:30:00.000Z",
    })).toBe("2026-08-06T02:30:00.000Z");
  });

  it("does not treat a later migration timestamp as an old article's publication time", () => {
    expect(resolveArticlePublishedAt({
      date: "2020-08-28",
      createdAt: "2026-03-14T08:00:00.000Z",
    })).toBe("2020-08-28T00:00:00+09:00");
  });

  it("preserves an explicit publication timestamp", () => {
    expect(resolveArticlePublishedAt({
      date: "2026-08-06T11:15:00+09:00",
      createdAt: "2026-08-06T09:52:57.553Z",
    })).toBe("2026-08-06T11:15:00+09:00");
  });
});
