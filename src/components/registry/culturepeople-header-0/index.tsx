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

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Search, Menu, X } from "lucide-react";

interface Category {
  id: string;
  name: string;
  slug: string;
  order: number;
  visible: boolean;
  parentId: string | null;
}

interface AutocompleteResult {
  id: string;
  title: string;
}

interface CulturepeopleHeader0Props {
  mode?: "light" | "dark";
}

export default function CulturepeopleHeader0({
  mode = "light",
}: CulturepeopleHeader0Props) {
  const colors = COLORS[mode];
  const router = useRouter();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isMobileSearchOpen, setIsMobileSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [navItems, setNavItems] = useState(NAV_ITEMS);

  // Autocomplete state
  const [acResults, setAcResults] = useState<AutocompleteResult[]>([]);
  const [acOpen, setAcOpen] = useState(false);
  const acContainerRef = useRef<HTMLDivElement>(null);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    fetch("/api/db/settings?key=cp-categories&fallback=%5B%5D", { cache: "no-store" })
      .then((r) => r.json())
      .then((data) => {
        const cats: Category[] = data.value ?? [];
        const visible = cats
          .filter((c) => c.visible !== false && !c.parentId)
          .sort((a, b) => a.order - b.order);
        if (visible.length > 0) {
          setNavItems(visible.map((c) => ({ label: c.name, href: `/category/${encodeURIComponent(c.name)}` })));
        }
      })
      .catch(() => { /* fallback to NAV_ITEMS */ });
  }, []);

  const today = new Date();
  const dateStr = `${today.getFullYear()}.${String(today.getMonth() + 1).padStart(2, "0")}.${String(today.getDate()).padStart(2, "0")}`;

  // 외부 클릭 시 자동완성 닫기
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (acContainerRef.current && !acContainerRef.current.contains(e.target as Node)) {
        setAcOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // debounced 자동완성 검색
  const fetchAutocomplete = useCallback((q: string) => {
    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    if (q.trim().length < 2) {
      setAcResults([]);
      setAcOpen(false);
      return;
    }
    debounceTimerRef.current = setTimeout(async () => {
      try {
        const res = await fetch(
          `/api/db/articles?q=${encodeURIComponent(q)}&limit=5&status=게시`,
          { cache: "no-store" }
        );
        const data = await res.json();
        if (data.success && Array.isArray(data.articles)) {
          const results: AutocompleteResult[] = data.articles.slice(0, 5).map(
            (a: { id: string; title: string }) => ({ id: a.id, title: a.title })
          );
          setAcResults(results);
          setAcOpen(results.length > 0);
        }
      } catch {
        // 검색 실패 시 무시
      }
    }, 300);
  }, []);

  const handleSearch = () => {
    setAcOpen(false);
    if (searchQuery.trim()) router.push(`/search?q=${encodeURIComponent(searchQuery)}`);
  };

  const handleSearchKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") handleSearch();
    if (e.key === "Escape") setAcOpen(false);
  };

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setSearchQuery(val);
    fetchAutocomplete(val);
  };

  const dropdownStyle: React.CSSProperties = {
    position: "absolute",
    top: "100%",
    left: 0,
    right: 0,
    background: "#FFF",
    border: "1px solid #DDD",
    borderTop: "none",
    borderRadius: "0 0 4px 4px",
    zIndex: 100,
    maxHeight: 240,
    overflowY: "auto",
  };

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

          {/* Date + Search (desktop) */}
          <div className="hidden items-center gap-4 md:flex">
            <span className="text-xs" style={{ color: colors.topMuted }}>{dateStr}</span>
            <div ref={acContainerRef} style={{ position: "relative" }}>
              <div
                className="flex h-8 items-center overflow-hidden rounded-sm border"
                style={{ borderColor: colors.border, backgroundColor: colors.searchBg }}
              >
                <input
                  type="text"
                  placeholder="검색어를 입력하세요"
                  value={searchQuery}
                  onChange={handleSearchChange}
                  onKeyDown={handleSearchKeyDown}
                  className="h-full w-48 border-none bg-transparent px-3 text-xs outline-none"
                  style={{ color: colors.topText }}
                />
                <button
                  className="flex h-full w-8 items-center justify-center"
                  style={{ backgroundColor: "#E8192C" }}
                  onClick={handleSearch}
                  aria-label="검색"
                >
                  <Search className="h-3.5 w-3.5 text-white" />
                </button>
              </div>
              {acOpen && acResults.length > 0 && (
                <div style={dropdownStyle}>
                  {acResults.map((item) => (
                    <div
                      key={item.id}
                      onMouseDown={() => {
                        setAcOpen(false);
                        router.push(`/article/${item.id}`);
                      }}
                      style={{
                        padding: "8px 12px",
                        fontSize: 13,
                        cursor: "pointer",
                        borderBottom: "1px solid #F5F5F5",
                        color: "#333",
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                      }}
                      onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.background = "#F5F5F5"; }}
                      onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.background = "#FFF"; }}
                    >
                      {item.title}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Mobile Right Buttons */}
          <div className="flex items-center gap-1 md:hidden">
            <button
              onClick={() => {
                setIsMobileSearchOpen((prev) => !prev);
                setIsMobileMenuOpen(false);
              }}
              className="flex h-9 w-9 items-center justify-center rounded"
              style={{ color: colors.topText }}
              aria-label="검색"
            >
              <Search className="h-5 w-5" />
            </button>
            <button
              className="flex h-9 w-9 items-center justify-center rounded"
              onClick={() => {
                setIsMobileMenuOpen((prev) => !prev);
                setIsMobileSearchOpen(false);
              }}
              style={{ color: colors.topText }}
              aria-label="메뉴"
            >
              {isMobileMenuOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
            </button>
          </div>
        </div>
      </div>

      {/* Navigation Bar */}
      <nav style={{ backgroundColor: colors.navBg }}>
        <div className="mx-auto hidden max-w-[1200px] md:block">
          <ul className="flex items-center">
            {navItems.map((item) => (
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

      {/* Mobile Search Bar */}
      {isMobileSearchOpen && (
        <div
          className="border-b md:hidden"
          style={{ backgroundColor: colors.topBg, borderColor: colors.border }}
        >
          <div className="mx-auto max-w-[1200px] px-4 py-3">
            <div
              className="flex h-9 items-center overflow-hidden rounded-sm border"
              style={{ borderColor: colors.border, backgroundColor: colors.searchBg }}
            >
              <input
                type="text"
                placeholder="검색어를 입력하세요"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={handleSearchKeyDown}
                className="h-full flex-1 border-none bg-transparent px-3 text-sm outline-none"
                style={{ color: colors.topText }}
                autoFocus
              />
              <button
                className="flex h-full w-10 items-center justify-center"
                style={{ backgroundColor: "#E8192C" }}
                onClick={handleSearch}
                aria-label="검색"
              >
                <Search className="h-4 w-4 text-white" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Mobile Menu */}
      {isMobileMenuOpen && (
        <div
          className="border-b md:hidden"
          style={{ backgroundColor: colors.topBg, borderColor: colors.border }}
        >
          <div className="mx-auto max-w-[1200px] px-4 py-3">
            <div className="grid grid-cols-3 gap-1">
              {navItems.map((item) => (
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
