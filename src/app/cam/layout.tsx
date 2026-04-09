"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import { checkAuth, logout } from "@/lib/auth";
import { logActivity } from "@/lib/log-activity";

interface MenuGroup {
  title: string;
  items: { href: string; label: string; icon: string }[];
}

const MENU_GROUPS: MenuGroup[] = [
  {
    title: "메인",
    items: [
      { href: "/cam/dashboard", label: "대시보드", icon: "📊" },
    ],
  },
  {
    title: "콘텐츠 관리",
    items: [
      { href: "/cam/articles", label: "기사 관리", icon: "📰" },
      { href: "/cam/articles?status=임시저장", label: "임시저장 기사", icon: "📝" },
      { href: "/cam/headlines", label: "헤드라인 관리", icon: "🔥" },
      { href: "/cam/press-import", label: "보도자료 수집", icon: "📥" },
      { href: "/cam/auto-press", label: "보도자료 자동등록", icon: "📰" },
      { href: "/cam/auto-news", label: "자동 뉴스 발행", icon: "🤖" },
      { href: "/cam/mail-press", label: "메일 보도자료", icon: "📧" },
      { href: "/cam/categories", label: "카테고리 관리", icon: "📂" },
      { href: "/cam/comments", label: "댓글 관리", icon: "💬" },
    ],
  },
  {
    title: "배포 / SEO",
    items: [
      { href: "/cam/distribute", label: "포털 배포", icon: "🚀" },
      { href: "/cam/seo", label: "SEO / 검색엔진", icon: "🔍" },
      { href: "/cam/rss", label: "RSS / 피드", icon: "📡" },
    ],
  },
  {
    title: "광고 / 수익",
    items: [
      { href: "/cam/ads", label: "광고 관리", icon: "📢" },
      { href: "/cam/popups", label: "팝업 / 배너", icon: "🪟" },
    ],
  },
  {
    title: "독자 소통",
    items: [
      { href: "/cam/newsletter", label: "뉴스레터", icon: "✉️" },
      { href: "/cam/sns", label: "SNS / 소셜", icon: "🔗" },
    ],
  },
  {
    title: "사이트 설정",
    items: [
      { href: "/cam/site-type", label: "사이트 타입", icon: "🎨" },
      { href: "/cam/settings", label: "사이트 설정", icon: "⚙️" },
      { href: "/cam/about", label: "회사 소개", icon: "🏢" },
      { href: "/cam/terms", label: "약관 관리", icon: "📋" },
      { href: "/cam/menus", label: "메뉴 관리", icon: "☰" },
    ],
  },
  {
    title: "시스템",
    items: [
      { href: "/cam/accounts", label: "계정 관리", icon: "👤" },
      { href: "/cam/analytics", label: "방문자 통계", icon: "📈" },
      { href: "/cam/ai-settings", label: "AI 설정", icon: "🤖" },
      { href: "/cam/api-keys", label: "API 키 관리", icon: "🔑" },
      { href: "/cam/logs", label: "로그 관리", icon: "📋" },
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
  const [currentUser, setCurrentUser] = useState("");
  const [currentRole, setCurrentRole] = useState("");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);

  /**
   * authedRef: 현재 인증 상태를 ref로 추적
   * - 이미 인증된 상태(true)에서 페이지 이동 시 checkAuth() 재호출 스킵
   * - 미들웨어가 서버사이드에서 모든 요청의 인증을 담당하므로 클라이언트 재확인 불필요
   * - 세션 만료는 apiFetch() 401 핸들러가 별도로 처리 (window.location.href 이동)
   */
  const authedRef = useRef<boolean | null>(null);
  const checkingRef = useRef(false);

  useEffect(() => {
    const isLogin = pathname === "/cam/login";

    // 이미 인증 확인 완료 + 로그인 페이지가 아닌 경우 → 재확인 스킵
    // (페이지 이동마다 checkAuth를 재호출하면 네트워크 지연/오류로 오로그아웃 발생)
    if (authedRef.current === true && !isLogin) return;

    // 중복 호출 방지 (Race Condition 방어)
    if (checkingRef.current) return;
    checkingRef.current = true;

    checkAuth().then((result) => {
      if (!result.authed && !isLogin) {
        router.replace("/cam/login");
      } else if (result.authed && isLogin) {
        router.replace("/cam/dashboard");
      } else {
        authedRef.current = result.authed;
        setAuthed(result.authed);
        // 서버 토큰 정보 우선, 없으면 localStorage 폴백
        const savedUser = localStorage.getItem("cp-admin-user");
        const displayName = result.user || savedUser || "관리자";
        setCurrentUser(displayName);
        setCurrentRole(result.role || "");
        // localStorage 최신화
        if (result.user) localStorage.setItem("cp-admin-user", result.user);
      }
    }).finally(() => {
      checkingRef.current = false;
    });
  }, [pathname, router]);

  // Close sidebar on route change (mobile) + 메뉴 접근 로그
  useEffect(() => {
    setSidebarOpen(false);
    // 메뉴 접근 활동 로그 (로그인/대시보드 제외)
    if (pathname && pathname !== "/cam/login" && pathname !== "/cam/dashboard" && authedRef.current) {
      const menuItem = MENU_GROUPS.flatMap((g) => g.items).find((i) => pathname.startsWith(i.href));
      if (menuItem) {
        logActivity({ action: "메뉴 접근", target: menuItem.label });
      }
    }
  }, [pathname]);

  // 알림 배지 폴링 (60초 간격)
  useEffect(() => {
    if (!authed) return;
    const poll = async () => {
      try {
        const res = await fetch("/api/db/notifications?unread=1");
        if (res.ok) {
          const data = await res.json();
          setUnreadCount(typeof data.count === "number" ? data.count : 0);
        }
      } catch { /* 폴링 실패 무시 */ }
    };
    poll();
    const interval = setInterval(poll, 60000);
    return () => clearInterval(interval);
  }, [authed]);

  const isLoginPage = pathname === "/cam/login";

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
    authedRef.current = null; // 인증 상태 초기화 → 로그인 페이지 이동 후 재확인 허용
    await logout();
    router.replace("/cam/login");
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
        className={`flex flex-col fixed top-0 bottom-0 z-[100] overflow-y-auto bg-white border-r border-gray-100 transition-[left] duration-200 ease-in-out md:left-0 ${sidebarOpen ? "left-0" : "-left-[220px]"}`}
        style={{ width: 220 }}
      >
        <div style={{ padding: "24px 20px 16px", borderBottom: "1px solid #EEEEEE", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <Link href="/cam/dashboard" style={{ textDecoration: "none", color: "inherit" }}>
            <div style={{ fontWeight: 800, fontSize: 20, color: "#4A3A8E", display: "flex", alignItems: "center", gap: 8 }}>
              <svg viewBox="0 0 100 100" width="24" height="24" aria-hidden="true">
                <circle cx="36" cy="62" r="27" fill="#C8BDE4" />
                <circle cx="64" cy="62" r="27" fill="#8B7BBE" />
                <circle cx="36" cy="38" r="27" fill="#6B5BAE" />
                <circle cx="64" cy="38" r="27" fill="#4A3A8E" />
              </svg>
              컬처피플
            </div>
            <div style={{ fontSize: 12, color: "#999", marginTop: 2, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span>관리자 패널</span>
              <span style={{ fontSize: 9, color: "#CCC", marginLeft: 8 }}>v.260407:1310</span>
            </div>
          </Link>
          <button
            onClick={() => setSidebarOpen(false)}
            aria-label="메뉴 닫기"
            className="md:hidden"
            style={{ background: "none", border: "none", fontSize: 20, cursor: "pointer", color: "#999", padding: 4, lineHeight: 1 }}
          >
            ✕
          </button>
        </div>
        <nav style={{ flex: 1, padding: "8px 0" }}>
          {MENU_GROUPS.filter((group) => {
            // 기자는 메인 + 콘텐츠 관리(기사 관련)만 표시
            if (currentRole === "reporter") return group.title === "메인" || group.title === "콘텐츠 관리";
            return true;
          }).map((group) => {
            // 기자는 콘텐츠 관리 중 기사 관리만 표시
            const items = currentRole === "reporter"
              ? group.items.filter((i) => i.href === "/cam/dashboard" || i.href.startsWith("/cam/articles"))
              : group.items;
            return { ...group, items };
          }).filter((g) => g.items.length > 0).map((group) => (
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
            <Link
              href="/cam/dashboard"
              style={{ position: "relative", display: "inline-block", textDecoration: "none" }}
              title="알림"
            >
              <span style={{ fontSize: 18, cursor: "pointer" }}>🔔</span>
              {unreadCount > 0 && (
                <span style={{
                  position: "absolute",
                  top: -4,
                  right: -4,
                  background: "#E8192C",
                  color: "#FFF",
                  borderRadius: "50%",
                  fontSize: 12,
                  fontWeight: 700,
                  minWidth: 16,
                  height: 16,
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  padding: "0 4px",
                }}>
                  {unreadCount > 99 ? "99+" : unreadCount}
                </span>
              )}
            </Link>
            <div className="flex flex-col items-end">
              <span className="text-sm text-gray-700 font-medium leading-tight">{currentUser}</span>
              {currentRole && (
                <span className="text-xs text-gray-400 leading-tight">
                  {currentRole === "superadmin" ? "최고 관리자" : currentRole === "admin" ? "관리자" : currentRole === "reporter" ? "기자" : currentRole}
                </span>
              )}
            </div>
            <button
              onClick={handleLogout}
              className="px-3.5 py-1.5 text-sm bg-gray-100 border border-gray-200 rounded-md cursor-pointer text-gray-700 hover:bg-gray-200 transition-colors"
            >
              로그아웃
            </button>
          </div>
        </header>

        {/* Page content */}
        <main className="p-4 md:p-6 flex-1">{children}</main>
      </div>
    </div>
  );
}
