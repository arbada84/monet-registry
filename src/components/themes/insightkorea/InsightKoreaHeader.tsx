"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { getSetting } from "@/lib/db";

interface Category {
  name: string;
  order: number;
  visible: boolean;
}

interface SiteSettings {
  siteName?: string;
  slogan?: string;
}

const ACCENT = "#d2111a";
const FONT_STACK = `-apple-system, "Apple SD Gothic Neo", Inter, "Noto Sans KR", "Malgun Gothic", sans-serif`;

export default function InsightKoreaHeader() {
  const router = useRouter();
  const [categories, setCategories] = useState<Category[]>([]);
  const [siteSettings, setSiteSettings] = useState<SiteSettings>({});
  const [searchOpen, setSearchOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    getSetting<Category[]>("cp-categories", []).then((cats) => {
      const visible = (cats || []).filter((c) => c.visible !== false).sort((a, b) => a.order - b.order);
      setCategories(visible);
    });
    getSetting<SiteSettings>("cp-site-settings", {}).then(setSiteSettings);
  }, []);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      router.push(`/search?q=${encodeURIComponent(searchQuery.trim())}`);
      setSearchOpen(false);
      setSearchQuery("");
    }
  };

  const now = new Date();
  const weekDays = ["일", "월", "화", "수", "목", "금", "토"];
  const lastEditStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")} ${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")} (${weekDays[now.getDay()]})`;

  const siteName = siteSettings.siteName || "컬처피플";

  return (
    <>
      <header style={{ fontFamily: FONT_STACK }} className="w-full bg-white">
        {/* ── 최상단 바 ── */}
        <div className="border-b" style={{ borderColor: "#e5e5e5" }}>
          <div className="mx-auto max-w-[1200px] px-4">
            <div className="flex items-center justify-between h-[34px] text-xs" style={{ color: "#888" }}>
              {/* 왼쪽: 최종편집 */}
              <span className="hidden sm:inline">최종편집 : {lastEditStr}</span>
              {/* 오른쪽: 소셜 + 로그인 + 전체메뉴 + 검색 */}
              <div className="flex items-center gap-1">
                {/* 소셜 아이콘들 (blog, post, talk, youtube) */}
                <a href="#" className="px-1.5 py-0.5 hover:opacity-70" aria-label="블로그" style={{ color: "#888" }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z"/></svg>
                </a>
                <a href="#" className="px-1.5 py-0.5 hover:opacity-70" aria-label="포스트" style={{ color: "#888" }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 14H6l-2 2V4h16v12z"/></svg>
                </a>
                <a href="#" className="px-1.5 py-0.5 hover:opacity-70" aria-label="톡" style={{ color: "#888" }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M12 3c-4.97 0-9 3.185-9 7.115 0 2.557 1.707 4.8 4.27 6.054l-1.09 3.98L10.47 17.6c.5.07 1.01.115 1.53.115 4.97 0 9-3.186 9-7.115C21 6.185 16.97 3 12 3z"/></svg>
                </a>
                <a href="#" className="px-1.5 py-0.5 hover:opacity-70" aria-label="유튜브" style={{ color: "#888" }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M21.582 7.186a2.506 2.506 0 00-1.768-1.768C18.254 5 12 5 12 5s-6.254 0-7.814.418c-.86.23-1.538.908-1.768 1.768C2 8.746 2 12 2 12s0 3.254.418 4.814c.23.86.908 1.538 1.768 1.768C5.746 19 12 19 12 19s6.254 0 7.814-.418a2.506 2.506 0 001.768-1.768C22 15.254 22 12 22 12s0-3.254-.418-4.814zM10 15V9l5.196 3L10 15z"/></svg>
                </a>

                <span className="mx-1" style={{ color: "#ddd" }}>|</span>

                <Link href="/cam/login" className="px-1.5 py-0.5 hover:opacity-70 text-xs" style={{ color: "#888" }}>
                  로그인
                </Link>

                <span className="mx-1" style={{ color: "#ddd" }}>|</span>

                <button
                  onClick={() => setMenuOpen(!menuOpen)}
                  className="px-1.5 py-0.5 hover:opacity-70 text-xs flex items-center gap-0.5"
                  style={{ color: "#888" }}
                  aria-label="전체메뉴"
                >
                  <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                    <path d="M3 6h18M3 12h18M3 18h18" />
                  </svg>
                  <span className="hidden sm:inline">전체메뉴</span>
                </button>

                <button
                  onClick={() => { setSearchOpen(!searchOpen); setTimeout(() => searchRef.current?.focus(), 100); }}
                  className="px-1.5 py-0.5 hover:opacity-70"
                  style={{ color: "#888" }}
                  aria-label="검색"
                >
                  <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                    <circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" />
                  </svg>
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* ── 로고 영역 ── */}
        <div className="mx-auto max-w-[1200px] px-4 py-5">
          <div className="flex items-center justify-center">
            <Link href="/" className="flex flex-col items-center text-center no-underline">
              {/* 사이트 로고/이름 - 컬처피플 자체 브랜딩 */}
              <span
                className="leading-none"
                style={{
                  fontFamily: "Georgia, 'Times New Roman', serif",
                  fontSize: "36px",
                  fontWeight: 900,
                  color: ACCENT,
                  letterSpacing: "-0.02em",
                }}
              >
                {siteName}
              </span>
              {siteSettings.slogan && (
                <span
                  className="text-[12px] mt-1 tracking-[0.1em]"
                  style={{ color: "#999" }}
                >
                  {siteSettings.slogan}
                </span>
              )}
            </Link>
          </div>
        </div>

        {/* ── 네비게이션 ── */}
        <nav style={{ borderTop: `2px solid ${ACCENT}`, borderBottom: "1px solid #e5e5e5" }}>
          <div className="mx-auto max-w-[1200px] px-4">
            {/* 데스크톱 메뉴 */}
            <ul className="hidden md:flex items-center justify-center gap-0 list-none m-0 p-0">
              <li>
                <Link
                  href="/"
                  className="block transition-colors no-underline"
                  style={{
                    fontSize: "18px",
                    fontWeight: 600,
                    color: ACCENT,
                    padding: "8px 24px",
                    lineHeight: "1.6",
                  }}
                >
                  전체기사
                </Link>
              </li>
              {categories.map((cat) => (
                <li key={cat.name}>
                  <Link
                    href={`/category/${encodeURIComponent(cat.name)}`}
                    className="block transition-colors no-underline"
                    style={{
                      fontSize: "18px",
                      fontWeight: 600,
                      color: "#222",
                      padding: "8px 24px",
                      lineHeight: "1.6",
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.color = ACCENT)}
                    onMouseLeave={(e) => (e.currentTarget.style.color = "#222")}
                  >
                    {cat.name}
                  </Link>
                </li>
              ))}
            </ul>
            {/* 모바일 햄버거 */}
            <div className="md:hidden flex items-center justify-between py-2.5">
              <button
                onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                className="flex items-center gap-2 text-sm font-semibold"
                style={{ color: "#222" }}
              >
                <svg width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <path d="M3 6h18M3 12h18M3 18h18" />
                </svg>
                카테고리
              </button>
            </div>
          </div>
        </nav>
      </header>

      {/* ── 검색 오버레이 ── */}
      {searchOpen && (
        <div className="fixed inset-0 z-50 bg-black/50" onClick={() => setSearchOpen(false)}>
          <div className="bg-white shadow-lg" onClick={(e) => e.stopPropagation()}>
            <div className="mx-auto max-w-[1200px] px-4 py-5">
              <form onSubmit={handleSearch} className="flex gap-2 max-w-[700px] mx-auto">
                <input
                  ref={searchRef}
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="검색어를 입력하세요"
                  className="flex-1 px-4 py-3 text-sm outline-none"
                  style={{
                    border: `1px solid #ccc`,
                    borderRadius: "2px",
                    fontFamily: FONT_STACK,
                  }}
                  onFocus={(e) => (e.currentTarget.style.borderColor = ACCENT)}
                  onBlur={(e) => (e.currentTarget.style.borderColor = "#ccc")}
                />
                <button
                  type="submit"
                  className="px-8 py-3 text-white text-sm font-semibold"
                  style={{ backgroundColor: ACCENT, borderRadius: "2px" }}
                >
                  검색
                </button>
                <button
                  type="button"
                  onClick={() => setSearchOpen(false)}
                  className="px-4 py-3 text-sm text-gray-500 hover:text-gray-700"
                >
                  닫기
                </button>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* ── 모바일 카테고리 그리드 ── */}
      {mobileMenuOpen && (
        <div className="md:hidden bg-white shadow-sm" style={{ borderBottom: "1px solid #e5e5e5" }}>
          <div className="mx-auto max-w-[1200px] px-4 py-3">
            <div className="grid grid-cols-3 gap-0.5">
              <Link
                href="/"
                className="px-3 py-2.5 text-sm text-center font-semibold no-underline"
                style={{ color: ACCENT, backgroundColor: "#fdf2f2", borderRadius: "2px" }}
                onClick={() => setMobileMenuOpen(false)}
              >
                전체기사
              </Link>
              {categories.map((cat) => (
                <Link
                  key={cat.name}
                  href={`/category/${encodeURIComponent(cat.name)}`}
                  className="px-3 py-2.5 text-sm text-center no-underline"
                  style={{ color: "#444", borderRadius: "2px" }}
                  onClick={() => setMobileMenuOpen(false)}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.color = ACCENT;
                    e.currentTarget.style.backgroundColor = "#fdf2f2";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.color = "#444";
                    e.currentTarget.style.backgroundColor = "transparent";
                  }}
                >
                  {cat.name}
                </Link>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── 전체메뉴 사이드 패널 (오른쪽에서 슬라이드) ── */}
      {menuOpen && (
        <div className="fixed inset-0 z-50" onClick={() => setMenuOpen(false)}>
          {/* 배경 오버레이 */}
          <div className="absolute inset-0 bg-black/40" />
          {/* 패널 */}
          <div
            className="absolute right-0 top-0 w-[300px] h-full bg-white shadow-2xl overflow-y-auto"
            style={{ animation: "slideInRight 0.25s ease-out" }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* 패널 헤더 */}
            <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: `2px solid ${ACCENT}` }}>
              <span className="font-bold text-lg" style={{ color: "#222" }}>전체메뉴</span>
              <button onClick={() => setMenuOpen(false)} className="p-1 hover:opacity-70" style={{ color: "#888" }}>
                <svg width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <path d="M18 6L6 18M6 6l12 12" />
                </svg>
              </button>
            </div>
            {/* 패널 카테고리 목록 */}
            <nav className="px-5 py-3">
              <Link
                href="/"
                className="block py-3 font-semibold text-[15px] no-underline"
                style={{ color: ACCENT, borderBottom: "1px solid #f0f0f0" }}
                onClick={() => setMenuOpen(false)}
              >
                전체기사
              </Link>
              {categories.map((cat) => (
                <Link
                  key={cat.name}
                  href={`/category/${encodeURIComponent(cat.name)}`}
                  className="block py-3 text-[15px] no-underline"
                  style={{ color: "#444", borderBottom: "1px solid #f0f0f0" }}
                  onClick={() => setMenuOpen(false)}
                  onMouseEnter={(e) => (e.currentTarget.style.color = ACCENT)}
                  onMouseLeave={(e) => (e.currentTarget.style.color = "#444")}
                >
                  {cat.name}
                </Link>
              ))}
            </nav>
            {/* 패널 하단 */}
            <div className="px-5 py-4 mt-4" style={{ borderTop: "1px solid #e5e5e5" }}>
              <Link
                href="/cam/login"
                className="block text-center py-2.5 text-sm font-semibold text-white no-underline"
                style={{ backgroundColor: ACCENT, borderRadius: "2px" }}
                onClick={() => setMenuOpen(false)}
              >
                로그인
              </Link>
            </div>
          </div>
        </div>
      )}

      {/* 슬라이드 애니메이션 */}
      <style jsx global>{`
        @keyframes slideInRight {
          from { transform: translateX(100%); }
          to { transform: translateX(0); }
        }
      `}</style>
    </>
  );
}
