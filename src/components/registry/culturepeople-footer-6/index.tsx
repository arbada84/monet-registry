"use client";

// ============================================================================
// CUSTOMIZATION - 이 섹션의 값들을 수정하여 프로젝트에 맞게 조정하세요
// ============================================================================

const COLORS = {
  light: {
    bg: "#F5F5F5",
    text: "#666666",
    title: "#333333",
    border: "#DDDDDD",
    accent: "#E8192C",
    link: "#888888",
  },
  dark: {
    bg: "#111111",
    text: "#999999",
    title: "#E0E0E0",
    border: "#333333",
    accent: "#E8192C",
    link: "#AAAAAA",
  },
} as const;

const FOOTER_NAV = [
  { label: "회사소개", href: "/about" },
  { label: "광고안내", href: "/about" },
  { label: "기사제보", href: "/about" },
  { label: "개인정보처리방침", href: "/privacy" },
  { label: "이용약관", href: "/terms" },
  { label: "청소년보호정책", href: "/terms" },
  { label: "이메일무단수집거부", href: "/terms" },
];

// ============================================================================
// END CUSTOMIZATION
// ============================================================================

interface CulturepeopleFooter6Props {
  mode?: "light" | "dark";
}

export default function CulturepeopleFooter6({
  mode = "light",
}: CulturepeopleFooter6Props) {
  const colors = COLORS[mode];

  return (
    <footer
      className="w-full"
      style={{ backgroundColor: colors.bg, fontFamily: "'Noto Sans KR', sans-serif" }}
    >
      <div className="mx-auto max-w-[1200px] px-4 py-8">
        {/* Footer Nav */}
        <div
          className="mb-5 flex flex-wrap items-center gap-x-4 gap-y-1 border-b pb-4"
          style={{ borderColor: colors.border }}
        >
          {FOOTER_NAV.map((item) => (
            <a
              key={item.label}
              href={item.href}
              className="text-xs transition-colors hover:text-[#E8192C]"
              style={{
                color: item.label === "개인정보처리방침" ? colors.title : colors.link,
                fontWeight: item.label === "개인정보처리방침" ? 700 : 400,
              }}
            >
              {item.label}
            </a>
          ))}
        </div>

        {/* Company Info */}
        <div className="flex flex-col gap-6 md:flex-row md:items-start md:justify-between">
          <div>
            {/* Logo */}
            <span
              className="mb-3 block text-xl font-bold"
              style={{ color: colors.accent }}
            >
              컬처피플
            </span>

            <div className="space-y-1 text-xs leading-relaxed" style={{ color: colors.text }}>
              <p>
                <span className="font-medium" style={{ color: colors.title }}>
                  (주)컬처피플미디어
                </span>{" "}
                | 대표이사: 홍길동
              </p>
              <p>
                서울특별시 중구 세종대로 110 컬처피플빌딩 12층
              </p>
              <p>
                대표전화: 02-1234-5678 | 팩스: 02-1234-5679 | 이메일: contact@culturepeople.co.kr
              </p>
              <p>
                등록번호: 서울 아 00000 | 등록일: 2024.01.01 | 발행인: 홍길동 | 편집인: 김영수
              </p>
              <p>
                인터넷신문 등록번호: 서울 아 00000 | 청소년보호책임자: 이민수
              </p>
            </div>
          </div>

          {/* Mobile Link */}
          <div className="shrink-0">
            <a
              href="#"
              className="inline-flex items-center gap-2 rounded border px-4 py-2 text-xs transition-colors hover:bg-gray-100"
              style={{ borderColor: colors.border, color: colors.text }}
            >
              모바일 버전으로 보기
            </a>
          </div>
        </div>

        {/* Copyright */}
        <div
          className="mt-6 border-t pt-4 text-center text-[11px]"
          style={{ borderColor: colors.border, color: colors.text }}
        >
          Copyright &copy; {new Date().getFullYear()} 컬처피플미디어. All rights reserved.
        </div>
      </div>
    </footer>
  );
}
