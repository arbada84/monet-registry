"use client";

import type { Dispatch, SetStateAction } from "react";
import AiSkillPanel from "@/components/AiSkillPanel";
import type { AiSettings } from "@/types/article";

type ThumbMode = "file" | "url";

interface ArticleAiToolsSectionProps {
  aiSettings: AiSettings | null;
  body: string;
  title: string;
  categories: string[];
  thumbnail: string;
  setBody: Dispatch<SetStateAction<string>>;
  setSummary: Dispatch<SetStateAction<string>>;
  setTitle: Dispatch<SetStateAction<string>>;
  setMetaDescription: Dispatch<SetStateAction<string>>;
  setCategory: Dispatch<SetStateAction<string>>;
  setThumbnail: Dispatch<SetStateAction<string>>;
  setThumbUrl: Dispatch<SetStateAction<string>>;
  setThumbMode: Dispatch<SetStateAction<ThumbMode>>;
}

export function ArticleAiToolsSection({
  aiSettings,
  body,
  title,
  categories,
  thumbnail,
  setBody,
  setSummary,
  setTitle,
  setMetaDescription,
  setCategory,
  setThumbnail,
  setThumbUrl,
  setThumbMode,
}: ArticleAiToolsSectionProps) {
  return (
    <div style={{ background: "#FFF", border: "1px solid #EEE", borderRadius: 10, padding: 24 }}>
      <AiSkillPanel
        aiSettings={aiSettings}
        body={body}
        title={title}
        categories={categories}
        onApply={(target, content) => {
          if (target === "body") setBody(content);
          else if (target === "summary") setSummary(content);
          else if (target === "title") setTitle(content);
          else if (target === "meta") setMetaDescription(content.slice(0, 160));
        }}
        onApplyAll={(data) => {
          if (data.title) setTitle(data.title);
          if (data.summary) setSummary(data.summary);
          if (data.body) setBody(data.body);
          if (data.category && categories.includes(data.category)) setCategory(data.category);

          if (!thumbnail && data.body) {
            const imgMatch = data.body.match(/<img[^>]+src="(https?:\/\/[^"]+)"[^>]*>/i);
            if (imgMatch?.[1]) {
              setThumbnail(imgMatch[1]);
              setThumbUrl(imgMatch[1]);
              setThumbMode("url");
            }
          }
        }}
      />
    </div>
  );
}
