"use client";

// ============================================================================
// CUSTOMIZATION - 이 섹션의 값들을 수정하여 프로젝트에 맞게 조정하세요
// ============================================================================

const COLORS = {
  light: {
    navBg: "#E8192C",
    navText: "#FFFFFF",
    topBg: "#FFFFFF",
    topText: "#333333",
    topMuted: "#999999",
    border: "#EEEEEE",
    searchBg: "#F5F5F5",
  },
  dark: {
    navBg: "#C41422",
    navText: "#FFFFFF",
    topBg: "#1A1A1A",
    topText: "#F5F5F5",
    topMuted: "#AAAAAA",
    border: "#333333",
    searchBg: "#2A2A2A",
  },
} as const;

const NAV_ITEMS = [
  { label: "뉴스", href: "/category/뉴스" },
  { label: "연예", href: "/category/연예" },
  { label: "스포츠", href: "/category/스포츠" },
  { label: "문화", href: "/category/문화" },
  { label: "라이프", href: "/category/라이프" },
  { label: "포토", href: "/category/포토" },
];

// ============================================================================
// END CUSTOMIZATION
// ============================================================================

import { useState } from "react";
import { Search, Menu, X, Cloud } from "lucide-react";

interface CulturepeopleHeader0Props {
  mode?: "light" | "dark";
}

export default function CulturepeopleHeader0({
  mode = "light",
}: CulturepeopleHeader0Props) {
  const colors = COLORS[mode];
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  const today = new Date();
  const dateStr = `${today.getFullYear()}.${String(today.getMonth() + 1).padStart(2, "0")}.${String(today.getDate()).padStart(2, "0")}`;

  return (
    <header className="sticky top-0 z-50 w-full" style={{ fontFamily: "'Noto Sans KR', sans-serif" }}>
      {/* Top Bar */}
      <div
        className="w-full border-b"
        style={{ backgroundColor: colors.topBg, borderColor: colors.border }}
      >
        <div className="mx-auto flex h-[72px] max-w-[1200px] items-center justify-between px-4">
          {/* Logo */}
          <a href="/" className="flex items-center gap-2">
            <span
              className="text-2xl font-bold tracking-tight"
              style={{ color: "#E8192C" }}
            >
              컬처피플
            </span>
          </a>

          {/* Date + Weather + Search */}
          <div className="hidden items-center gap-4 md:flex">
            <div className="flex items-center gap-2" style={{ color: colors.topMuted }}>
              <Cloud className="h-4 w-4" />
              <span className="text-xs">{dateStr} 서울 맑음 -2°C</span>
            </div>
            <div
              className="flex h-8 items-center overflow-hidden rounded-sm border"
              style={{ borderColor: colors.border, backgroundColor: colors.searchBg }}
            >
              <input
                type="text"
                placeholder="검색어를 입력하세요"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="h-full w-48 border-none bg-transparent px-3 text-xs outline-none"
                style={{ color: colors.topText }}
              />
              <button
                className="flex h-full w-8 items-center justify-center"
                style={{ backgroundColor: "#E8192C" }}
                onClick={() => { if (searchQuery.trim()) window.location.href = `/search?q=${encodeURIComponent(searchQuery)}`; }}
              >
                <Search className="h-3.5 w-3.5 text-white" />
              </button>
            </div>
          </div>

          {/* Mobile Menu Button */}
          <button
            className="md:hidden"
            onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
            style={{ color: colors.topText }}
          >
            {isMobileMenuOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
          </button>
        </div>
      </div>

      {/* Navigation Bar */}
      <nav style={{ backgroundColor: colors.navBg }}>
        <div className="mx-auto hidden max-w-[1200px] md:block">
          <ul className="flex items-center">
            {NAV_ITEMS.map((item) => (
              <li key={item.label}>
                <a
                  href={item.href}
                  className="block px-6 py-3 text-sm font-medium transition-opacity hover:opacity-80"
                  style={{ color: colors.navText }}
                >
                  {item.label}
                </a>
              </li>
            ))}
          </ul>
        </div>
      </nav>

      {/* Mobile Menu */}
      {isMobileMenuOpen && (
        <div
          className="border-b md:hidden"
          style={{ backgroundColor: colors.topBg, borderColor: colors.border }}
        >
          <div className="mx-auto max-w-[1200px] px-4 py-3">
            {/* Mobile Search */}
            <div
              className="mb-3 flex h-9 items-center overflow-hidden rounded-sm border"
              style={{ borderColor: colors.border, backgroundColor: colors.searchBg }}
            >
              <input
                type="text"
                placeholder="검색어를 입력하세요"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="h-full flex-1 border-none bg-transparent px-3 text-sm outline-none"
                style={{ color: colors.topText }}
              />
              <button
                className="flex h-full w-10 items-center justify-center"
                style={{ backgroundColor: "#E8192C" }}
                onClick={() => { if (searchQuery.trim()) window.location.href = `/search?q=${encodeURIComponent(searchQuery)}`; }}
              >
                <Search className="h-4 w-4 text-white" />
              </button>
            </div>
            {/* Mobile Nav */}
            <div className="grid grid-cols-3 gap-1">
              {NAV_ITEMS.map((item) => (
                <a
                  key={item.label}
                  href={item.href}
                  className="rounded px-3 py-2 text-center text-sm font-medium text-white"
                  style={{ backgroundColor: colors.navBg }}
                  onClick={() => setIsMobileMenuOpen(false)}
                >
                  {item.label}
                </a>
              ))}
            </div>
          </div>
        </div>
      )}
    </header>
  );
}
