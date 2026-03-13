"use client";

import { useMemo } from "react";
import Link from "next/link";
import Image from "next/image";
import type { Article } from "@/types/article";
import InsightKoreaHeader from "./InsightKoreaHeader";
import InsightKoreaFooter from "./InsightKoreaFooter";
import PopupRenderer from "@/components/ui/PopupRenderer";
import CoupangAutoAd from "@/components/ui/CoupangAutoAd";

interface Props {
  articles: Article[];
  categories?: string[];
  adSlots?: Record<string, React.ReactNode>;
}

const ACCENT = "#d2111a";

function stripHtml(html: string): string {
  return (html || "").replace(/<[^>]*>/g, "").replace(/&nbsp;/g, " ").trim();
}

function ArticleImage({ src, alt }: { src?: string; alt: string }) {
  if (!src) {
    return (
      <div className="absolute inset-0 bg-gray-100 flex items-center justify-center text-gray-400">
        <svg width="40" height="40" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
          <rect x="3" y="3" width="18" height="18" rx="2" />
          <circle cx="8.5" cy="8.5" r="1.5" />
          <path d="m21 15-5-5L5 21" />
        </svg>
      </div>
    );
  }
  return (
    <Image
      src={src}
      alt={alt}
      fill
      className="object-cover"
      sizes="(max-width: 768px) 100vw, 820px"
      unoptimized={!src.includes("supabase")}
    />
  );
}

function SectionHeader({ title, href }: { title: string; href: string }) {
  return (
    <div className="flex items-center justify-between border-b border-gray-200 pb-2 mb-4">
      <Link
        href={href}
        className="flex items-center gap-1 no-underline"
        style={{ fontSize: 18, fontWeight: 700, color: "#111" }}
      >
        {title}
        <span className="text-gray-400">&gt;</span>
      </Link>
    </div>
  );
}

/* ── HERO SECTION ── */
function HeroSection({ articles }: { articles: Article[] }) {
  const main = articles[0];
  const sides = articles.slice(1, 3);
  if (!main) return null;

  return (
    <section className="max-w-[1200px] mx-auto mt-4 px-4 lg:px-0">
      <div
        className="overflow-hidden flex flex-col md:flex-row"
        style={{ border: "1px solid #d5d5d5", boxShadow: "rgba(0,0,0,0.05) 0 1px 2px" }}
      >
        {/* Main article */}
        <Link
          href={`/article/${main.no ?? main.id}`}
          className="relative block w-full md:flex-[2.15] overflow-hidden"
          style={{ minHeight: 260 }}
        >
          <div className="absolute inset-0">
            <ArticleImage src={main.thumbnail} alt={main.title} />
            <div className="absolute inset-0" style={{ background: "linear-gradient(to top, rgba(0,0,0,0.75) 0%, rgba(0,0,0,0.25) 40%, transparent 70%)" }} />
          </div>
          <div className="absolute bottom-0 left-0 right-0 p-5 md:p-7">
            <h2 className="text-lg md:text-2xl font-bold text-white leading-snug line-clamp-2 m-0">
              {main.title}
            </h2>
            {main.summary && (
              <p className="text-sm text-white/80 leading-relaxed mt-2 line-clamp-2 hidden md:block">
                {main.summary}
              </p>
            )}
          </div>
        </Link>

        {/* Side articles */}
        <div className="flex flex-row md:flex-col md:w-[320px] lg:w-[380px] shrink-0">
          {sides.map((a, i) => (
            <Link
              key={a.id}
              href={`/article/${a.no ?? a.id}`}
              className="relative flex-1 block overflow-hidden"
              style={{
                minHeight: 130,
                borderTop: i > 0 ? "1px solid #d5d5d5" : undefined,
                borderLeft: i === 0 ? "1px solid #d5d5d5" : undefined,
              }}
            >
              <div className="absolute inset-0">
                <ArticleImage src={a.thumbnail} alt={a.title} />
                <div className="absolute inset-0" style={{ background: "linear-gradient(to top, rgba(0,0,0,0.7) 0%, rgba(0,0,0,0.2) 40%, transparent 65%)" }} />
              </div>
              <div className="absolute bottom-0 left-0 right-0 p-3 md:p-4">
                <h3 className="text-sm md:text-base font-bold text-white leading-snug line-clamp-2 m-0">
                  {a.title}
                </h3>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ── CEO& Section: 3-column cards ── */
function CeoSection({ title, articles }: { title: string; articles: Article[] }) {
  const items = articles.slice(0, 3);
  if (!items.length) return null;

  return (
    <div>
      <SectionHeader title={title} href={`/category/${encodeURIComponent(title)}`} />
      <div className="grid grid-cols-3 gap-4 md:gap-[30px]">
        {items.map((a) => (
          <Link key={a.id} href={`/article/${a.no ?? a.id}`} className="no-underline text-inherit block">
            <div className="relative w-full overflow-hidden bg-gray-100" style={{ paddingBottom: "80%" }}>
              <ArticleImage src={a.thumbnail} alt={a.title} />
            </div>
            <h4 className="text-sm md:text-[19px] font-bold leading-snug mt-2 md:mt-3 line-clamp-2" style={{ color: "#111" }}>
              {a.title}
            </h4>
            <p className="text-xs md:text-sm leading-relaxed mt-1 line-clamp-2 md:line-clamp-3 hidden sm:block" style={{ color: "#666" }}>
              {stripHtml(a.body).slice(0, 150)}
            </p>
          </Link>
        ))}
      </div>
    </div>
  );
}

/* ── Dual-column section (Industry/Finance style) ── */
function DualColumnSection({ leftTitle, leftArticles, rightTitle, rightArticles }: {
  leftTitle: string;
  leftArticles: Article[];
  rightTitle: string;
  rightArticles: Article[];
}) {
  const renderColumn = (title: string, items: Article[]) => (
    <div className="flex-1 min-w-0">
      <SectionHeader title={title} href={`/category/${encodeURIComponent(title)}`} />
      <div>
        {items.slice(0, 4).map((a, i) => (
          <Link
            key={a.id}
            href={`/article/${a.no ?? a.id}`}
            className="flex gap-3 md:gap-6 no-underline text-inherit"
            style={{
              borderTop: i > 0 ? "1px solid #eee" : undefined,
              paddingTop: i > 0 ? "1rem" : undefined,
              marginTop: i > 0 ? "1rem" : undefined,
            }}
          >
            <div className="relative w-[100px] md:w-[140px] shrink-0 overflow-hidden bg-gray-100" style={{ paddingBottom: "calc(min(100px, 140px) * 0.7)", minHeight: 65 }}>
              <ArticleImage src={a.thumbnail} alt={a.title} />
            </div>
            <div className="flex-1 min-w-0">
              <h4 className="text-sm md:text-lg font-semibold leading-snug line-clamp-2 m-0" style={{ color: "#111" }}>
                {a.title}
              </h4>
              <p className="text-xs leading-relaxed mt-1 line-clamp-2 hidden md:block" style={{ color: "#888" }}>
                {stripHtml(a.body).slice(0, 100)}
              </p>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );

  if (!leftTitle && !rightTitle) return null;

  return (
    <div className="flex flex-col md:flex-row gap-6 md:gap-[30px]">
      {leftTitle && renderColumn(leftTitle, leftArticles)}
      {rightTitle && renderColumn(rightTitle, rightArticles)}
    </div>
  );
}

/* ── Sidebar ── */
function ColumnSidebar({ articles, columnArticles, managementArticles }: {
  articles: Article[];
  columnArticles: Article[];
  managementArticles: Article[];
}) {
  const top10 = useMemo(
    () => [...articles].sort((a, b) => (b.views || 0) - (a.views || 0)).slice(0, 10),
    [articles]
  );

  return (
    <div className="w-full lg:w-[300px] shrink-0">
      {/* COLUMN */}
      {columnArticles.length > 0 && (
        <div className="mb-8">
          <SectionHeader title="COLUMN" href={`/category/${encodeURIComponent("COLUMN")}`} />
          <div>
            {columnArticles.slice(0, 5).map((a, i) => (
              <Link
                key={a.id}
                href={`/article/${a.no ?? a.id}`}
                className="block no-underline text-inherit"
                style={{
                  borderTop: i > 0 ? "1px solid #eee" : undefined,
                  paddingTop: i > 0 ? 12 : undefined,
                  marginTop: i > 0 ? 12 : undefined,
                }}
              >
                <h4 className="text-[15px] font-semibold leading-snug line-clamp-2 m-0" style={{ color: "#111" }}>
                  {a.title}
                </h4>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Most viewed */}
      <div className="mb-8">
        <div className="border-b-2 border-gray-900 pb-2 mb-3.5">
          <h3 className="text-lg font-bold m-0" style={{ color: "#111" }}>많이 본 뉴스</h3>
        </div>
        <div>
          {top10.map((a, i) => (
            <Link
              key={a.id}
              href={`/article/${a.no ?? a.id}`}
              className="flex items-start gap-2.5 no-underline text-inherit"
              style={{
                minHeight: 44,
                paddingTop: i > 0 ? 10 : undefined,
                marginTop: i > 0 ? 10 : undefined,
                borderTop: i > 0 ? "1px solid #f2f2f2" : undefined,
              }}
            >
              <span
                className="text-lg font-bold shrink-0 w-6 text-center"
                style={{ color: i < 3 ? ACCENT : "#999", lineHeight: "1.3" }}
              >
                {i + 1}
              </span>
              <span className="text-sm leading-snug line-clamp-2" style={{ color: "#333" }}>
                {a.title}
              </span>
            </Link>
          ))}
        </div>
      </div>

      {/* MANAGEMENT */}
      {managementArticles.length > 0 && (
        <div>
          <SectionHeader title="MANAGEMENT" href={`/category/${encodeURIComponent("MANAGEMENT")}`} />
          <div>
            {managementArticles.slice(0, 4).map((a, i) => (
              <Link
                key={a.id}
                href={`/article/${a.no ?? a.id}`}
                className="flex gap-3 no-underline text-inherit"
                style={{
                  borderTop: i > 0 ? "1px solid #eee" : undefined,
                  paddingTop: i > 0 ? 12 : undefined,
                  marginTop: i > 0 ? 12 : undefined,
                }}
              >
                <div className="relative w-[100px] shrink-0 overflow-hidden bg-gray-100" style={{ paddingBottom: 70 }}>
                  <ArticleImage src={a.thumbnail} alt={a.title} />
                </div>
                <div className="flex-1 min-w-0">
                  <h4 className="text-[15px] font-semibold leading-snug line-clamp-2 m-0" style={{ color: "#111" }}>
                    {a.title}
                  </h4>
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/* ══════════════════════════════════════════════
   MAIN LANDING PAGE
   ══════════════════════════════════════════════ */
export default function InsightKoreaLanding({ articles, adSlots }: Props) {
  const published = useMemo(
    () => articles.filter((a) => a.status === "게시").sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()),
    [articles]
  );

  const categoryMap = useMemo(() => {
    const map: Record<string, Article[]> = {};
    for (const a of published) {
      if (!map[a.category]) map[a.category] = [];
      map[a.category].push(a);
    }
    return map;
  }, [published]);

  const allCategories = useMemo(() => {
    return Object.entries(categoryMap)
      .sort((a, b) => b[1].length - a[1].length)
      .map(([name]) => name);
  }, [categoryMap]);

  const findCategory = (names: string[]) => {
    for (const n of names) {
      const found = allCategories.find((c) => c.includes(n) || n.includes(c));
      if (found) return found;
    }
    return null;
  };

  const ceoCat = findCategory(["CEO", "CEO&"]) || allCategories[0];
  const industryCat = findCategory(["산업", "Industry"]) || allCategories[1];
  const financeCat = findCategory(["금융", "Finance"]) || allCategories[2];
  const columnCat = findCategory(["COLUMN", "칼럼", "Column"]) || allCategories[3];
  const managementCat = findCategory(["MANAGEMENT", "경영", "Management"]) || allCategories[4];

  const usedCats = new Set([ceoCat, industryCat, financeCat, columnCat, managementCat]);
  const remaining = allCategories.filter((c) => !usedCats.has(c));
  const leftDualCat = industryCat || remaining[0] || allCategories[1];
  const rightDualCat = financeCat || remaining[1] || allCategories[2];

  return (
    <div className="w-full min-h-screen bg-white" style={{ fontFamily: `-apple-system, "Apple SD Gothic Neo", Inter, "Noto Sans KR", "Malgun Gothic", sans-serif` }}>
      <PopupRenderer />
      <InsightKoreaHeader />

      <HeroSection articles={published.slice(0, 3)} />

      {/* Main content */}
      <div className="max-w-[1200px] mx-auto px-4 pt-8">
        {/* 상단 광고 (히어로 바로 아래) */}
        {adSlots?.["top"]}

        {adSlots?.["home-mid-1"]}

        <div className="flex flex-col lg:flex-row gap-6 lg:gap-10 mt-4">
          {/* Left content */}
          <div className="flex-1 min-w-0">
            {ceoCat && <CeoSection title={ceoCat} articles={categoryMap[ceoCat] || []} />}

            <div className="mt-8 md:mt-9">
              <DualColumnSection
                leftTitle={leftDualCat || ""}
                leftArticles={categoryMap[leftDualCat] || []}
                rightTitle={rightDualCat || ""}
                rightArticles={categoryMap[rightDualCat] || []}
              />
            </div>

            {adSlots?.["home-mid-2"]}

            {remaining.length >= 2 && (
              <div className="mt-8 md:mt-9">
                <DualColumnSection
                  leftTitle={remaining[0] || ""}
                  leftArticles={categoryMap[remaining[0]] || []}
                  rightTitle={remaining[1] || ""}
                  rightArticles={categoryMap[remaining[1]] || []}
                />
              </div>
            )}
          </div>

          {/* Right sidebar */}
          <div className="hidden lg:block">
            <ColumnSidebar
              articles={published}
              columnArticles={categoryMap[columnCat] || []}
              managementArticles={categoryMap[managementCat] || []}
            />
          </div>
        </div>

        {/* 쿠팡 자동 추천 상품 */}
        <CoupangAutoAd
          keyword="베스트셀러"
          limit={4}
          layout="grid"
          className="my-8"
        />

        {/* Mobile: Most viewed (hidden on desktop, sidebar shows it) */}
        <div className="lg:hidden mt-8">
          <MostViewedMobile articles={published} />
        </div>

        {adSlots?.bottom}
      </div>

      <InsightKoreaFooter />
    </div>
  );
}

/* ── Mobile most viewed (shown only on mobile) ── */
function MostViewedMobile({ articles }: { articles: Article[] }) {
  const top10 = useMemo(
    () => [...articles].sort((a, b) => (b.views || 0) - (a.views || 0)).slice(0, 10),
    [articles]
  );

  return (
    <div>
      <div className="border-b-2 border-gray-900 pb-2 mb-3.5">
        <h3 className="text-lg font-bold m-0" style={{ color: "#111" }}>많이 본 뉴스</h3>
      </div>
      <div>
        {top10.map((a, i) => (
          <Link
            key={a.id}
            href={`/article/${a.no ?? a.id}`}
            className="flex items-start gap-2.5 no-underline text-inherit"
            style={{
              minHeight: 44,
              paddingTop: i > 0 ? 10 : undefined,
              marginTop: i > 0 ? 10 : undefined,
              borderTop: i > 0 ? "1px solid #f2f2f2" : undefined,
            }}
          >
            <span
              className="text-lg font-bold shrink-0 w-6 text-center"
              style={{ color: i < 3 ? ACCENT : "#999", lineHeight: "1.3" }}
            >
              {i + 1}
            </span>
            <span className="text-sm leading-snug line-clamp-2" style={{ color: "#333" }}>
              {a.title}
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}
