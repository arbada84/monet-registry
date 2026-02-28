"use client";

import { useMemo } from "react";
import DOMPurify from "dompurify";

interface Props {
  html: string;
}

export default function ArticleBody({ html }: Props) {
  const clean = useMemo(() => {
    if (typeof window === "undefined") return html;
    return DOMPurify.sanitize(html, {
      ADD_TAGS: ["iframe"],
      ADD_ATTR: ["allow", "allowfullscreen", "frameborder", "scrolling", "src"],
    });
  }, [html]);

  return (
    <>
      <style>{`
        .article-body img { max-width: 100% !important; height: auto !important; display: block; }
        .article-body iframe { max-width: 100%; }
        .article-body table { max-width: 100%; overflow-x: auto; display: block; }
      `}</style>
      <div
        className="article-body text-base text-gray-800 leading-[1.9] mb-8 prose prose-gray max-w-none"
        dangerouslySetInnerHTML={{ __html: clean }}
      />
    </>
  );
}
