"use client";

import { useEffect } from "react";

interface Props {
  articleId: string;
}

export default function ArticleViewTracker({ articleId }: Props) {
  useEffect(() => {
    const viewedKey = `cp-viewed-${articleId}`;
    if (sessionStorage.getItem(viewedKey)) return;
    sessionStorage.setItem(viewedKey, "1");

    Promise.all([
      fetch("/api/db/view-logs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ articleId, path: `/article/${articleId}` }),
      }),
      fetch("/api/db/articles/views", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: articleId }),
      }),
    ]).catch(() => {});
  }, [articleId]);

  return null;
}
