export const MIN_INDEXABLE_TAG_ARTICLE_COUNT = 3;

export function isIndexableTagArticleCount(count: number): boolean {
  return Number.isFinite(count) && count >= MIN_INDEXABLE_TAG_ARTICLE_COUNT;
}
