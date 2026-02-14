"use client";

import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";

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

  useEffect(() => {
    const isLogin = pathname === "/admin/login";
    const auth = localStorage.getItem("cp-admin-auth") === "true";
    if (!auth && !isLogin) {
      router.replace("/admin/login");
    } else {
      setAuthed(auth);
      const user = localStorage.getItem("cp-admin-user");
      if (user) setCurrentUser(user);
    }
  }, [pathname, router]);

  const isLoginPage = pathname === "/admin/login";

  if (isLoginPage) {
    return <>{children}</>;
  }

  if (authed === null) {
    return (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          height: "100vh",
          fontFamily: "'Noto Sans KR', sans-serif",
        }}
      >
        로딩 중...
      </div>
    );
  }

  const handleLogout = () => {
    localStorage.removeItem("cp-admin-auth");
    localStorage.removeItem("cp-admin-user");
    router.replace("/admin/login");
  };

  return (
    <div
      style={{
        display: "flex",
        minHeight: "100vh",
        fontFamily: "'Noto Sans KR', sans-serif",
        background: "#F5F5F5",
      }}
    >
      {/* Sidebar */}
      <aside
        style={{
          width: 220,
          background: "#FFFFFF",
          borderRight: "1px solid #EEEEEE",
          display: "flex",
          flexDirection: "column",
          position: "fixed",
          top: 0,
          left: 0,
          bottom: 0,
          zIndex: 100,
          overflowY: "auto",
        }}
      >
        <div
          style={{
            padding: "24px 20px 16px",
            borderBottom: "1px solid #EEEEEE",
          }}
        >
          <Link
            href="/admin/dashboard"
            style={{ textDecoration: "none", color: "inherit" }}
          >
            <div style={{ fontWeight: 800, fontSize: 20, color: "#E8192C" }}>
              컬처피플
            </div>
            <div style={{ fontSize: 12, color: "#999", marginTop: 2 }}>
              관리자 패널
            </div>
          </Link>
        </div>
        <nav style={{ flex: 1, padding: "8px 0" }}>
          {MENU_GROUPS.map((group) => (
            <div key={group.title} style={{ marginBottom: 4 }}>
              <div
                style={{
                  padding: "8px 20px 4px",
                  fontSize: 11,
                  fontWeight: 600,
                  color: "#AAA",
                  textTransform: "uppercase",
                  letterSpacing: 0.5,
                }}
              >
                {group.title}
              </div>
              {group.items.map((item) => {
                const active = pathname.startsWith(item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      padding: "8px 20px",
                      fontSize: 13,
                      color: active ? "#E8192C" : "#333",
                      background: active ? "#FFF0F0" : "transparent",
                      borderRight: active
                        ? "3px solid #E8192C"
                        : "3px solid transparent",
                      textDecoration: "none",
                      fontWeight: active ? 600 : 400,
                      transition: "all 0.15s",
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
      <div
        style={{
          marginLeft: 220,
          flex: 1,
          display: "flex",
          flexDirection: "column",
        }}
      >
        {/* Header */}
        <header
          style={{
            height: 56,
            background: "#FFFFFF",
            borderBottom: "1px solid #EEEEEE",
            display: "flex",
            alignItems: "center",
            justifyContent: "flex-end",
            padding: "0 24px",
            position: "sticky",
            top: 0,
            zIndex: 50,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <span style={{ fontSize: 14, color: "#666" }}>
              {currentUser}
            </span>
            <button
              onClick={handleLogout}
              style={{
                padding: "6px 14px",
                fontSize: 13,
                background: "#F5F5F5",
                border: "1px solid #DDD",
                borderRadius: 6,
                cursor: "pointer",
                color: "#333",
              }}
            >
              로그아웃
            </button>
          </div>
        </header>

        {/* Page content */}
        <main style={{ padding: 24, flex: 1 }}>{children}</main>
      </div>
    </div>
  );
}
