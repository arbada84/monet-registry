"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { getSetting } from "@/lib/db";

interface Category {
  name: string;
  order: number;
  visible: boolean;
  parentId?: string | null;
}

interface SiteSettings {
  siteName?: string;
  slogan?: string;
}

interface HeaderProps {
  initialCategories?: Category[];
  initialSiteSettings?: SiteSettings;
}

const ACCENT = "#d2111a";
const FONT_STACK = `-apple-system, "Apple SD Gothic Neo", Inter, "Noto Sans KR", "Malgun Gothic", sans-serif`;

export default function InsightKoreaHeader({ initialCategories, initialSiteSettings }: HeaderProps = {}) {
  const router = useRouter();
  const [categories, setCategories] = useState<Category[]>(
    (initialCategories || []).filter((c) => c.visible !== false && !c.parentId).sort((a, b) => a.order - b.order)
  );
  const [siteSettings, setSiteSettings] = useState<SiteSettings>(initialSiteSettings || {});
  const [searchOpen, setSearchOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    // 서버에서 초기값을 받았으면 클라이언트 fetch 스킵
    if (initialCategories) return;
    getSetting<Category[]>("cp-categories", []).then((cats) => {
      const visible = (cats || []).filter((c) => c.visible !== false && !c.parentId).sort((a, b) => a.order - b.order);
      setCategories(visible);
    });
    if (!initialSiteSettings) {
      getSetting<SiteSettings>("cp-site-settings", {}).then(setSiteSettings);
    }
  }, [initialCategories, initialSiteSettings]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      router.push(`/search?q=${encodeURIComponent(searchQuery.trim())}`);
      setSearchOpen(false);
      setSearchQuery("");
    }
  };

  useEffect(() => {
    if (!searchOpen) return;
    const handleKey = (e: KeyboardEvent) => { if (e.key === "Escape") setSearchOpen(false); };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [searchOpen]);

  const [lastEditStr, setLastEditStr] = useState("");
  useEffect(() => {
    const now = new Date();
    const weekDays = ["일", "월", "화", "수", "목", "금", "토"];
    setLastEditStr(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")} ${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")} (${weekDays[now.getDay()]})`);
  }, []);

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
                <button
                  onClick={() => setMenuOpen(!menuOpen)}
                  className="p-2 hover:opacity-70 text-xs flex items-center gap-0.5"
                  style={{ color: "#888" }}
                  aria-label="전체메뉴"
                  aria-expanded={menuOpen}
                  aria-haspopup="true"
                >
                  <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                    <path d="M3 6h18M3 12h18M3 18h18" />
                  </svg>
                  <span className="hidden sm:inline">전체메뉴</span>
                </button>

                <button
                  onClick={() => { setSearchOpen(!searchOpen); setTimeout(() => searchRef.current?.focus(), 100); }}
                  className="p-2 hover:opacity-70"
                  style={{ color: "#888" }}
                  aria-label="검색"
                  aria-expanded={searchOpen}
                  aria-haspopup="dialog"
                >
                  <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
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
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/logo-full.svg"
                alt={siteName}
                style={{ height: 88 }}
              />
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
                className="flex items-center gap-2 text-sm font-semibold p-1"
                style={{ color: "#222" }}
                aria-expanded={mobileMenuOpen}
                aria-haspopup="true"
                aria-controls="mobile-menu"
                aria-label="카테고리 메뉴"
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
        <div className="fixed inset-0 z-50 bg-black/50" onClick={() => setSearchOpen(false)} role="dialog" aria-label="검색" aria-modal="true">
          <div className="bg-white shadow-lg" onClick={(e) => e.stopPropagation()}>
            <div className="mx-auto max-w-[1200px] px-4 py-5">
              <form onSubmit={handleSearch} className="flex gap-2 max-w-[700px] mx-auto">
                <input
                  ref={searchRef}
                  type="text"
                  name="q"
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
        <div id="mobile-menu" className="md:hidden bg-white shadow-sm" style={{ borderBottom: "1px solid #e5e5e5" }}>
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
                  onPointerEnter={(e) => {
                    e.currentTarget.style.color = ACCENT;
                    e.currentTarget.style.backgroundColor = "#fdf2f2";
                  }}
                  onPointerLeave={(e) => {
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
            {/* 패널 하단 여백 */}
            <div className="py-4" />
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
