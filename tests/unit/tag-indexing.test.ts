import { describe, expect, it } from "vitest";
import {
  MIN_INDEXABLE_TAG_ARTICLE_COUNT,
  isIndexableTagArticleCount,
} from "@/lib/tag-indexing";

describe("tag indexing policy", () => {
  it("keeps thin tag archives out of the search index", () => {
    expect(MIN_INDEXABLE_TAG_ARTICLE_COUNT).toBe(3);
    expect(isIndexableTagArticleCount(0)).toBe(false);
    expect(isIndexableTagArticleCount(1)).toBe(false);
    expect(isIndexableTagArticleCount(2)).toBe(false);
    expect(isIndexableTagArticleCount(3)).toBe(true);
  });
});
