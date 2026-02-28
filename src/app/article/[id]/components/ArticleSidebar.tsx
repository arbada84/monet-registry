"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import NewsletterWidget from "./NewsletterWidget";

interface SidebarItem {
  id: string;
  title: string;
  views?: number;
  category?: string;
}

interface SidebarData {
  top10: SidebarItem[];
  related: SidebarItem[];
}

export default function ArticleSidebar({
  articleId,
  category,
}: {
  articleId: string;
  category: string;
}) {
  const [data, setData] = useState<SidebarData | null>(null);

  useEffect(() => {
    const params = new URLSearchParams({ category, excludeId: articleId });
    fetch(`/api/db/articles/sidebar?${params}`)
      .then((r) => r.json())
      .then((json) => {
        if (json.success) setData({ top10: json.top10, related: json.related });
      })
      .catch(() => {});
  }, [articleId, category]);

  if (!data) {
    // Skeleton placeholder while loading
    return (
      <aside className="w-full lg:w-[320px] shrink-0 space-y-4">
        <div className="border border-gray-200 rounded p-4 animate-pulse">
          <div className="h-4 bg-gray-200 rounded w-24 mb-3" />
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex gap-3 py-2.5 border-b border-gray-100 last:border-b-0">
              <div className="h-6 w-6 bg-gray-200 rounded-sm shrink-0" />
              <div className="flex-1 space-y-1">
                <div className="h-3 bg-gray-200 rounded" />
                <div className="h-3 bg-gray-200 rounded w-2/3" />
              </div>
            </div>
          ))}
        </div>
        <NewsletterWidget />
      </aside>
    );
  }

  return (
    <aside className="w-full lg:w-[320px] shrink-0">
      {/* 인기 TOP 10 */}
      {data.top10.length > 0 && (
        <div className="border border-gray-200 rounded p-4 mb-4">
          <div className="flex items-center gap-2 mb-3">
            <span className="inline-block h-5 w-1 rounded-full" style={{ backgroundColor: "#E8192C" }} />
            <h3 className="text-base font-bold text-gray-900">인기 TOP 10</h3>
          </div>
          <div className="space-y-0">
            {data.top10.map((item, idx) => (
              <Link
                key={item.id}
                href={`/article/${item.id}`}
                className="flex items-start gap-3 border-b border-gray-100 py-2.5 last:border-b-0 hover:bg-gray-50 transition-colors"
              >
                <span
                  className="flex h-6 w-6 shrink-0 items-center justify-center rounded-sm text-xs font-bold text-white"
                  style={{ backgroundColor: idx < 3 ? "#E8192C" : "#999" }}
                >
                  {idx + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <span className="block text-sm text-gray-700 leading-snug line-clamp-2 hover:text-[#E8192C]">
                    {item.title}
                  </span>
                  <span className="text-[11px] text-gray-400">{(item.views || 0).toLocaleString()}회</span>
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* 관련 기사 */}
      {data.related.length > 0 && (
        <div className="border border-gray-200 rounded p-4 mb-4">
          <div className="flex items-center gap-2 mb-3">
            <span className="inline-block h-5 w-1 rounded-full" style={{ backgroundColor: "#E8192C" }} />
            <h3 className="text-base font-bold text-gray-900">관련 기사</h3>
          </div>
          <ul className="space-y-2">
            {data.related.map((ra) => (
              <li key={ra.id}>
                <Link
                  href={`/article/${ra.id}`}
                  className="block text-sm text-gray-700 hover:text-[#E8192C] leading-snug py-1 border-b border-gray-100 last:border-b-0"
                >
                  {ra.title}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}

      <NewsletterWidget />
    </aside>
  );
}
