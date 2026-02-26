"use client";

import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import { checkAuth, logout } from "@/lib/auth";

interface MenuGroup {
  title: string;
  items: { href: string; label: string; icon: string }[];
}

const MENU_GROUPS: MenuGroup[] = [
  {
    title: "메인",
    items: [
      { href: "/admin/dashboard", label: "대시보드", icon: "📊" },
    ],
  },
  {
    title: "콘텐츠 관리",
    items: [
      { href: "/admin/articles", label: "기사 관리", icon: "📰" },
      { href: "/admin/headlines", label: "헤드라인 관리", icon: "🔥" },
      { href: "/admin/press-import", label: "보도자료 수집", icon: "📥" },
      { href: "/admin/categories", label: "카테고리 관리", icon: "📂" },
      { href: "/admin/reporters", label: "기자 관리", icon: "✍️" },
      { href: "/admin/comments", label: "댓글 관리", icon: "💬" },
    ],
  },
  {
    title: "배포 / SEO",
    items: [
      { href: "/admin/distribute", label: "포털 배포", icon: "🚀" },
      { href: "/admin/seo", label: "SEO / 검색엔진", icon: "🔍" },
      { href: "/admin/rss", label: "RSS / 피드", icon: "📡" },
    ],
  },
  {
    title: "광고 / 수익",
    items: [
      { href: "/admin/ads", label: "광고 관리", icon: "📢" },
      { href: "/admin/popups", label: "팝업 / 배너", icon: "🪟" },
    ],
  },
  {
    title: "독자 소통",
    items: [
      { href: "/admin/newsletter", label: "뉴스레터", icon: "✉️" },
      { href: "/admin/sns", label: "SNS / 소셜", icon: "🔗" },
    ],
  },
  {
    title: "사이트 설정",
    items: [
      { href: "/admin/settings", label: "사이트 설정", icon: "⚙️" },
      { href: "/admin/about", label: "회사 소개", icon: "🏢" },
      { href: "/admin/terms", label: "약관 관리", icon: "📋" },
      { href: "/admin/menus", label: "메뉴 관리", icon: "☰" },
    ],
  },
  {
    title: "시스템",
    items: [
      { href: "/admin/accounts", label: "관리자 계정", icon: "👤" },
      { href: "/admin/analytics", label: "방문자 통계", icon: "📈" },
      { href: "/admin/ai-settings", label: "AI 설정", icon: "🤖" },
    ],
  },
];

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [currentUser, setCurrentUser] = useState("admin");
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    const isLogin = pathname === "/admin/login";
    checkAuth().then((result) => {
      if (!result.authed && !isLogin) {
        router.replace("/admin/login");
      } else if (result.authed && isLogin) {
        router.replace("/admin/dashboard");
      } else {
        setAuthed(result.authed);
        // 로컬스토리지에 저장된 표시명 우선 사용
        const savedUser = localStorage.getItem("cp-admin-user");
        setCurrentUser(result.user || savedUser || "admin");
      }
    });
  }, [pathname, router]);

  // Close sidebar on route change (mobile)
  useEffect(() => {
    setSidebarOpen(false);
  }, [pathname]);

  const isLoginPage = pathname === "/admin/login";

  if (isLoginPage) {
    return <>{children}</>;
  }

  if (authed === null) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh", fontFamily: "'Noto Sans KR', sans-serif" }}>
        로딩 중...
      </div>
    );
  }

  const handleLogout = async () => {
    await logout();
    router.replace("/admin/login");
  };

  return (
    <div style={{ display: "flex", minHeight: "100vh", fontFamily: "'Noto Sans KR', sans-serif", background: "#F5F5F5" }}>
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          onClick={() => setSidebarOpen(false)}
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", zIndex: 99 }}
        />
      )}

      {/* Sidebar */}
      <aside
        className="flex flex-col fixed top-0 bottom-0 z-[100] overflow-y-auto bg-white border-r border-gray-100 transition-[left] duration-200 ease-in-out md:left-0"
        style={{ width: 220, left: sidebarOpen ? 0 : -220 }}
      >
        <div style={{ padding: "24px 20px 16px", borderBottom: "1px solid #EEEEEE", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <Link href="/admin/dashboard" style={{ textDecoration: "none", color: "inherit" }}>
            <div style={{ fontWeight: 800, fontSize: 20, color: "#E8192C" }}>컬처피플</div>
            <div style={{ fontSize: 12, color: "#999", marginTop: 2 }}>관리자 패널</div>
          </Link>
          <button
            onClick={() => setSidebarOpen(false)}
            aria-label="메뉴 닫기"
            className="sidebar-close-btn"
            style={{ background: "none", border: "none", fontSize: 20, cursor: "pointer", color: "#999", padding: 4 }}
          >
            x
          </button>
        </div>
        <nav style={{ flex: 1, padding: "8px 0" }}>
          {MENU_GROUPS.map((group) => (
            <div key={group.title} style={{ marginBottom: 4 }}>
              <div style={{ padding: "8px 20px 4px", fontSize: 11, fontWeight: 600, color: "#AAA", textTransform: "uppercase", letterSpacing: 0.5 }}>
                {group.title}
              </div>
              {group.items.map((item) => {
                const active = pathname.startsWith(item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    style={{
                      display: "flex", alignItems: "center", gap: 8, padding: "8px 20px", fontSize: 13,
                      color: active ? "#E8192C" : "#333",
                      background: active ? "#FFF0F0" : "transparent",
                      borderRight: active ? "3px solid #E8192C" : "3px solid transparent",
                      textDecoration: "none", fontWeight: active ? 600 : 400, transition: "all 0.15s",
                    }}
                  >
                    <span style={{ fontSize: 14 }}>{item.icon}</span>
                    <span>{item.label}</span>
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>
      </aside>

      {/* Main content */}
      <div className="flex flex-col flex-1 md:ml-[220px]">
        {/* Header */}
        <header className="h-14 bg-white border-b border-gray-100 flex items-center justify-between px-6 sticky top-0 z-50">
          <button
            onClick={() => setSidebarOpen(true)}
            aria-label="메뉴 열기"
            className="md:hidden text-2xl text-gray-700 px-2 py-1 bg-transparent border-0 cursor-pointer"
          >
            ☰
          </button>
          <div className="flex items-center gap-3">
            <span className="text-sm text-gray-500">{currentUser}</span>
            <button
              onClick={handleLogout}
              className="px-3.5 py-1.5 text-sm bg-gray-100 border border-gray-200 rounded-md cursor-pointer text-gray-700 hover:bg-gray-200 transition-colors"
            >
              로그아웃
            </button>
          </div>
        </header>

        {/* Page content */}
        <main className="p-6 md:p-6 flex-1 p-4">{children}</main>
      </div>
    </div>
  );
}
