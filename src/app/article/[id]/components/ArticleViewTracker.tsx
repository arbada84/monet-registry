"use client";

import { useEffect } from "react";

interface Props {
  articleId: string;
}

declare global {
  interface Window {
    gtag?: (...args: unknown[]) => void;
  }
}

export default function ArticleViewTracker({ articleId }: Props) {
  useEffect(() => {
    const viewedKey = `cp-viewed-${articleId}`;
    if (sessionStorage.getItem(viewedKey)) return;
    sessionStorage.setItem(viewedKey, "1");

    // GA4 이벤트 전송
    if (typeof window !== "undefined" && window.gtag) {
      window.gtag("event", "article_view", { article_id: articleId });
    }

    fetch("/api/db/article-view", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ articleId, path: `/article/${articleId}` }),
      keepalive: true,
    }).catch(() => {});
  }, [articleId]);

  return null;
}
