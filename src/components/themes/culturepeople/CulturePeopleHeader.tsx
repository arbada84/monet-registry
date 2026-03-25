"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
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

const ACCENT = "#5B4B9E";
const ACCENT_LIGHT = "#7B6DAF";
const ACCENT_BG = "#F3F0FA";
const FONT_STACK = `-apple-system, "Apple SD Gothic Neo", Inter, "Noto Sans KR", "Malgun Gothic", sans-serif`;

/** 컬처피플 로고 SVG - 보라색 겹치는 원 4개 (클로버 형태) */
function CulturePeopleLogo({ size = 36 }: { size?: number }) {
  const r = size * 0.22;
  const cx = size / 2;
  const cy = size / 2;
  const offset = size * 0.16;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} fill="none">
      <circle cx={cx - offset} cy={cy - offset} r={r} fill="#5B4B9E" opacity={0.85} />
      <circle cx={cx + offset} cy={cy - offset} r={r} fill="#7B6DAF" opacity={0.85} />
      <circle cx={cx - offset} cy={cy + offset} r={r} fill="#B0A5CC" opacity={0.85} />
      <circle cx={cx + offset} cy={cy + offset} r={r} fill="#D5CFE0" opacity={0.85} />
    </svg>
  );
}

export default function CulturePeopleHeader({
  initialCategories,
  initialSiteSettings,
}: HeaderProps = {}) {
  const router = useRouter();
  const pathname = usePathname();
  const [categories, setCategories] = useState<Category[]>(
    (initialCategories || [])
      .filter((c) => c.visible !== false && !c.parentId)
      .sort((a, b) => a.order - b.order)
  );
  const [siteSettings, setSiteSettings] = useState<SiteSettings>(
    initialSiteSettings || {}
  );
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (initialCategories) return;
    getSetting<Category[]>("cp-categories", []).then((cats) => {
      const visible = (cats || [])
        .filter((c) => c.visible !== false && !c.parentId)
        .sort((a, b) => a.order - b.order);
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
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setSearchOpen(false);
    };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [searchOpen]);

  // 모바일 메뉴 열릴 때 body 스크롤 잠금
  useEffect(() => {
    if (mobileMenuOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [mobileMenuOpen]);

  const [lastEditStr, setLastEditStr] = useState("");
  useEffect(() => {
    const now = new Date();
    const weekDays = ["일", "월", "화", "수", "목", "금", "토"];
    setLastEditStr(
      `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")} ${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")} (${weekDays[now.getDay()]})`
    );
  }, []);

  const siteName = siteSettings.siteName || "컬처피플";

  return (
    <>
      <header style={{ fontFamily: FONT_STACK }} className="w-full bg-white">
        {/* ── 최상단 바 (PC only) ── */}
        <div
          className="hidden md:block border-b"
          style={{ borderColor: "#e5e5e5" }}
        >
          <div className="mx-auto max-w-[1200px] px-4">
            <div
              className="flex items-center justify-between h-[34px] text-xs"
              style={{ color: "#888" }}
            >
              <span>최종편집 : {lastEditStr}</span>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => {
                    setSearchOpen(!searchOpen);
                    setTimeout(() => searchRef.current?.focus(), 100);
                  }}
                  className="p-2 hover:opacity-70"
                  style={{ color: "#888" }}
                  aria-label="검색"
                  aria-expanded={searchOpen}
                >
                  <svg
                    width="16"
                    height="16"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    viewBox="0 0 24 24"
                  >
                    <circle cx="11" cy="11" r="7" />
                    <path d="m20 20-3.5-3.5" />
                  </svg>
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* ── 로고 영역 ── */}
        {/* PC: 가운데 정렬, 로고 2배 크기 */}
        <div className="hidden md:block mx-auto max-w-[1200px] px-4 py-6">
          <div className="flex items-center justify-center">
            <Link
              href="/"
              className="flex items-center gap-3 no-underline"
            >
              <CulturePeopleLogo size={88} />
              <div className="flex flex-col">
                <span
                  className="text-[36px] font-bold tracking-tight"
                  style={{ color: ACCENT }}
                >
                  {siteName}
                </span>
                <span
                  className="text-[13px] tracking-[0.15em] uppercase"
                  style={{ color: ACCENT_LIGHT }}
                >
                  THE CULTURE PEOPLE
                </span>
              </div>
            </Link>
          </div>
          {siteSettings.slogan && (
            <p
              className="text-center text-[12px] mt-1.5 tracking-[0.06em]"
              style={{ color: "#999" }}
            >
              {siteSettings.slogan}
            </p>
          )}
        </div>

        {/* 모바일: 햄버거(왼) + 로고(가운데) + 검색(오른) */}
        <div className="md:hidden flex items-center justify-between px-4 py-3">
          <button
            onClick={() => setMobileMenuOpen(true)}
            className="p-1"
            style={{ color: "#333" }}
            aria-label="메뉴 열기/닫기"
            aria-expanded={mobileMenuOpen}
          >
            <svg
              width="24"
              height="24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              viewBox="0 0 24 24"
            >
              <path d="M3 6h18M3 12h18M3 18h18" />
            </svg>
          </button>
          <Link href="/" className="flex items-center gap-1.5 no-underline">
            <CulturePeopleLogo size={30} />
            <span
              className="text-[17px] font-bold tracking-tight"
              style={{ color: ACCENT }}
            >
              {siteName}
            </span>
          </Link>
          <button
            onClick={() => {
              setSearchOpen(!searchOpen);
              setTimeout(() => searchRef.current?.focus(), 100);
            }}
            className="p-1"
            style={{ color: "#333" }}
            aria-label="검색"
          >
            <svg
              width="22"
              height="22"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              viewBox="0 0 24 24"
            >
              <circle cx="11" cy="11" r="7" />
              <path d="m20 20-3.5-3.5" />
            </svg>
          </button>
        </div>

        {/* ── 네비게이션 바 ── */}
        <nav
          style={{
            borderTop: `3px solid ${ACCENT}`,
            borderBottom: "1px solid #e5e5e5",
          }}
        >
          <div className="mx-auto max-w-[1200px] px-4">
            {/* 데스크톱 메뉴 */}
            <ul className="hidden md:flex items-center justify-center gap-0 list-none m-0 p-0">
              <li>
                <Link
                  href="/"
                  className="block transition-colors no-underline"
                  style={{
                    fontSize: "16px",
                    fontWeight: 600,
                    color: ACCENT,
                    padding: "10px 22px",
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
                      fontSize: "16px",
                      fontWeight: 600,
                      color: "#333",
                      padding: "10px 22px",
                      lineHeight: "1.6",
                    }}
                    onMouseEnter={(e) =>
                      (e.currentTarget.style.color = ACCENT)
                    }
                    onMouseLeave={(e) =>
                      (e.currentTarget.style.color = "#333")
                    }
                  >
                    {cat.name}
                  </Link>
                </li>
              ))}
            </ul>

            {/* 모바일 카테고리는 스티키 탭으로 분리 (아래 참조) */}
          </div>
        </nav>
      </header>

      {/* ── 모바일 스티키 카테고리 탭 ── */}
      <div
        className="md:hidden sticky top-0 z-40 bg-white border-b overflow-x-auto scrollbar-hide"
        style={{ borderColor: "#e5e5e5" }}
      >
        <div className="flex items-center gap-0 whitespace-nowrap">
          <Link
            href="/"
            className="inline-block px-4 py-3 text-[14px] font-semibold no-underline relative"
            style={{
              color: pathname === "/" ? ACCENT : "#555",
              minHeight: "44px",
              lineHeight: "20px",
            }}
          >
            전체기사
            {pathname === "/" && (
              <span
                className="absolute bottom-0 left-4 right-4 h-[2px] rounded-full"
                style={{ backgroundColor: ACCENT }}
              />
            )}
          </Link>
          {categories.map((cat) => {
            const catPath = `/category/${encodeURIComponent(cat.name)}`;
            const isActive = decodeURIComponent(pathname) === `/category/${cat.name}`;
            return (
              <Link
                key={cat.name}
                href={catPath}
                className="inline-block px-4 py-3 text-[14px] font-medium no-underline relative"
                style={{
                  color: isActive ? ACCENT : "#555",
                  minHeight: "44px",
                  lineHeight: "20px",
                }}
              >
                {cat.name}
                {isActive && (
                  <span
                    className="absolute bottom-0 left-4 right-4 h-[2px] rounded-full"
                    style={{ backgroundColor: ACCENT }}
                  />
                )}
              </Link>
            );
          })}
        </div>
      </div>

      {/* ── 검색 오버레이 ── */}
      {searchOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/50"
          onClick={() => setSearchOpen(false)}
          role="dialog"
          aria-label="검색"
          aria-modal="true"
        >
          <div
            className="bg-white shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mx-auto max-w-[1200px] px-4 py-5">
              <form
                onSubmit={handleSearch}
                className="flex gap-2 max-w-[700px] mx-auto"
              >
                <input
                  ref={searchRef}
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="검색어를 입력하세요"
                  aria-label="사이트 내 검색"
                  className="flex-1 px-4 py-3 text-sm outline-none"
                  style={{
                    border: "1px solid #ccc",
                    borderRadius: "4px",
                    fontFamily: FONT_STACK,
                  }}
                  onFocus={(e) =>
                    (e.currentTarget.style.borderColor = ACCENT)
                  }
                  onBlur={(e) =>
                    (e.currentTarget.style.borderColor = "#ccc")
                  }
                />
                <button
                  type="submit"
                  className="px-8 py-3 text-white text-sm font-semibold transition-opacity hover:opacity-90"
                  style={{
                    backgroundColor: ACCENT,
                    borderRadius: "4px",
                  }}
                  aria-label="검색"
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

      {/* ── 모바일 사이드 메뉴 (오른쪽에서 슬라이드) ── */}
      {mobileMenuOpen && (
        <div
          className="fixed inset-0 z-50"
          onClick={() => setMobileMenuOpen(false)}
        >
          {/* 배경 오버레이 */}
          <div className="absolute inset-0 bg-black/40" />
          {/* 패널 */}
          <div
            role="dialog"
            aria-modal="true"
            aria-label="메뉴"
            className="absolute right-0 top-0 w-[280px] h-full bg-white shadow-2xl overflow-y-auto"
            style={{ animation: "cpSlideIn 0.25s ease-out", maxWidth: "80vw" }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* 패널 헤더 */}
            <div
              className="flex items-center justify-between px-5 py-4"
              style={{ borderBottom: `3px solid ${ACCENT}` }}
            >
              <div className="flex items-center gap-2">
                <CulturePeopleLogo size={28} />
                <span
                  className="font-bold text-[16px]"
                  style={{ color: ACCENT }}
                >
                  {siteName}
                </span>
              </div>
              <button
                onClick={() => setMobileMenuOpen(false)}
                className="p-1 hover:opacity-70"
                style={{ color: "#888" }}
                aria-label="메뉴 닫기"
              >
                <svg
                  width="22"
                  height="22"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  viewBox="0 0 24 24"
                >
                  <path d="M18 6L6 18M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* 패널 카테고리 목록 */}
            <nav className="px-5 py-3" aria-label="모바일 메뉴">
              <Link
                href="/"
                className="block py-3 font-semibold text-[15px] no-underline"
                style={{
                  color: ACCENT,
                  borderBottom: "1px solid #f0f0f0",
                }}
                onClick={() => setMobileMenuOpen(false)}
              >
                전체기사
              </Link>
              {categories.map((cat) => (
                <Link
                  key={cat.name}
                  href={`/category/${encodeURIComponent(cat.name)}`}
                  className="block py-3 text-[15px] no-underline"
                  style={{
                    color: "#444",
                    borderBottom: "1px solid #f0f0f0",
                  }}
                  onClick={() => setMobileMenuOpen(false)}
                  onMouseEnter={(e) =>
                    (e.currentTarget.style.color = ACCENT)
                  }
                  onMouseLeave={(e) =>
                    (e.currentTarget.style.color = "#444")
                  }
                >
                  {cat.name}
                </Link>
              ))}
            </nav>

            {/* 하단 슬로건 */}
            {siteSettings.slogan && (
              <div
                className="px-5 py-4 mt-4"
                style={{
                  borderTop: "1px solid #f0f0f0",
                }}
              >
                <p
                  className="text-[11px] tracking-wide"
                  style={{ color: "#aaa" }}
                >
                  {siteSettings.slogan}
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* 슬라이드 애니메이션 + 스크롤바 숨김 */}
      <style jsx global>{`
        @keyframes cpSlideIn {
          from {
            transform: translateX(100%);
          }
          to {
            transform: translateX(0);
          }
        }
        .scrollbar-hide::-webkit-scrollbar {
          display: none;
        }
        .scrollbar-hide {
          -ms-overflow-style: none;
          scrollbar-width: none;
        }
      `}</style>
    </>
  );
}
