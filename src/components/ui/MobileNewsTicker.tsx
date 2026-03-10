"use client";

import { useState, useEffect, useCallback } from "react";
import type { Article } from "@/types/article";

const ACCENT = "#E8192C";

interface Props {
  articles: Article[];
}

export default function MobileNewsTicker({ articles }: Props) {
  const [tickerArticles, setTickerArticles] = useState<{ id: string; no?: number; title: string }[]>([]);
  const [currentIdx, setCurrentIdx] = useState(0);

  useEffect(() => {
    const published = articles
      .filter((a) => a.status === "게시")
      .sort((a, b) => b.date.localeCompare(a.date))
      .slice(0, 10);
    setTickerArticles(published.map((a) => ({ id: a.id, no: a.no, title: a.title })));
  }, [articles]);

  const advance = useCallback(() => {
    setCurrentIdx((prev) => (prev + 1) % Math.max(tickerArticles.length, 1));
  }, [tickerArticles.length]);

  useEffect(() => {
    if (tickerArticles.length <= 1) return;
    const timer = setInterval(advance, 3000);
    return () => clearInterval(timer);
  }, [advance, tickerArticles.length]);

  if (tickerArticles.length === 0) return null;

  const current = tickerArticles[currentIdx];

  return (
    <div
      className="md:hidden mx-4 my-4 flex items-center overflow-hidden"
      style={{ height: 40, fontFamily: "'Noto Sans KR', sans-serif" }}
    >
      <span
        className="shrink-0 flex items-center justify-center text-sm font-medium text-white px-3"
        style={{ backgroundColor: ACCENT, height: 40, minWidth: 100 }}
      >
        실시간 뉴스 &gt;
      </span>
      <a
        href={`/article/${current?.no ?? current?.id}`}
        className="flex-1 min-w-0 px-3 text-[13px] text-gray-700 truncate leading-[40px]"
        style={{ backgroundColor: "#F8F8F8" }}
      >
        {current?.title}
      </a>
    </div>
  );
}
