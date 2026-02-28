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
    <div
      className="text-base text-gray-800 leading-[1.9] mb-8 prose prose-gray max-w-none"
      dangerouslySetInnerHTML={{ __html: clean }}
    />
  );
}
