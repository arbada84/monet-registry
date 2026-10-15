import type { Article } from "@/types/article";
import { stripHtmlToPlainText } from "@/lib/article-dedupe";

// Home cards need previews, not editorial history, source metadata or full bodies.
export function toPublicArticlePreview(article: Article): Article {
  return {
    id: article.id,
    no: article.no,
    title: article.title,
    category: article.category,
    date: article.date,
    status: article.status,
    views: article.views,
    body: stripHtmlToPlainText(article.body).slice(0, 240),
    summary: article.summary,
    thumbnail: article.thumbnail,
    thumbnailAlt: article.thumbnailAlt,
    author: article.author,
    tags: article.tags,
  };
}
