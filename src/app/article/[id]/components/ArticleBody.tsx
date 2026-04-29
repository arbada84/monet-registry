"use client";

import { useMemo } from "react";
import DOMPurify from "dompurify";
import { sanitizeArticleHtml } from "@/lib/article-html-sanitize";
import { isAllowedIframeSrc } from "@/lib/html-embed-safety";

interface Props {
  html: string;
}

export default function ArticleBody({ html }: Props) {
  const clean = useMemo(() => {
    if (typeof window === "undefined") {
      return sanitizeArticleHtml(html, { allowMaps: true, allowScripts: true });
    }
    // Restrict iframe sources before hardening sandbox attributes.
    DOMPurify.addHook("afterSanitizeAttributes", (node) => {
      if (node.nodeName === "IFRAME") {
        const src = node.getAttribute("src") ?? "";
        if (!isAllowedIframeSrc(src, { allowMaps: true })) {
          node.removeAttribute("src");
        }
      }
    });
    const result = DOMPurify.sanitize(html, {
      ADD_TAGS: ["iframe"],
      ADD_ATTR: ["allow", "allowfullscreen", "frameborder", "scrolling", "src"],
    });
    DOMPurify.removeHooks("afterSanitizeAttributes");
    return sanitizeArticleHtml(result, { allowMaps: true, allowScripts: true });
  }, [html]);

  return (
    <>
      <style>{`
        .article-body p { margin-bottom: 1.25em; }
        .article-body p:last-child { margin-bottom: 0; }
        .article-body img { max-width: 100% !important; height: auto !important; display: block; margin: 1.5em 0; }
        .article-body iframe { max-width: 100%; }
        .article-body table { max-width: 100%; overflow-x: auto; display: block; }
        .article-body figure { margin: 1.5em 0; }
      `}</style>
      <div
        className="article-body text-base text-gray-800 leading-[1.9] mb-8 prose prose-gray max-w-none"
        dangerouslySetInnerHTML={{ __html: clean }}
      />
    </>
  );
}
