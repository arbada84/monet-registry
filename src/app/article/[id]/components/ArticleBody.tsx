"use client";

import { useMemo } from "react";
import DOMPurify from "dompurify";

interface Props {
  html: string;
}

const ALLOWED_IFRAME_ORIGINS = [
  "https://www.youtube.com/",
  "https://www.youtube-nocookie.com/",
  "https://player.vimeo.com/",
  "https://www.google.com/maps/",
  "https://maps.google.com/",
];

export default function ArticleBody({ html }: Props) {
  const clean = useMemo(() => {
    if (typeof window === "undefined") return html;
    // iframe src를 허용 도메인으로 제한하는 훅
    DOMPurify.addHook("afterSanitizeAttributes", (node) => {
      if (node.nodeName === "IFRAME") {
        const src = node.getAttribute("src") ?? "";
        if (!ALLOWED_IFRAME_ORIGINS.some((o) => src.startsWith(o))) {
          node.removeAttribute("src");
        }
      }
    });
    const result = DOMPurify.sanitize(html, {
      ADD_TAGS: ["iframe"],
      ADD_ATTR: ["allow", "allowfullscreen", "frameborder", "scrolling", "src"],
    });
    DOMPurify.removeAllHooks();
    return result;
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
