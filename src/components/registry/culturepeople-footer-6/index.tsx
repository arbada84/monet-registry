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

interface SiteInfo {
  companyName: string;
  ceo: string;
  address: string;
  phone: string;
  fax: string;
  email: string;
  registerNo: string;
  registerDate: string;
  publisher: string;
  editor: string;
  internetRegisterNo: string;
  youthManager: string;
}

interface SnsSettings {
  facebook: string;
  instagram: string;
  twitter: string;
  youtube: string;
  naverBlog: string;
  naverPost: string;
  kakaoChannel: string;
  tiktok: string;
}

const DEFAULT_SITE_INFO: SiteInfo = {
  companyName: "(주)컬처피플미디어",
  ceo: "홍길동",
  address: "서울특별시 중구 세종대로 110 컬처피플빌딩 12층",
  phone: "02-1234-5678",
  fax: "02-1234-5679",
  email: "contact@culturepeople.co.kr",
  registerNo: "서울 아 00000",
  registerDate: "2024.01.01",
  publisher: "홍길동",
  editor: "김영수",
  internetRegisterNo: "서울 아 00000",
  youthManager: "이민수",
};

const DEFAULT_SNS: SnsSettings = {
  facebook: "",
  instagram: "",
  twitter: "",
  youtube: "",
  naverBlog: "",
  naverPost: "",
  kakaoChannel: "",
  tiktok: "",
};

// ============================================================================
// END CUSTOMIZATION
// ============================================================================

import { useEffect, useState } from "react";
import { getSetting } from "@/lib/db";

interface CulturepeopleFooter6Props {
  mode?: "light" | "dark";
}

const SNS_ITEMS: { key: keyof SnsSettings; label: string; icon: string }[] = [
  { key: "facebook", label: "Facebook", icon: "f" },
  { key: "twitter", label: "X", icon: "𝕏" },
  { key: "instagram", label: "Instagram", icon: "ig" },
  { key: "youtube", label: "YouTube", icon: "▶" },
  { key: "naverBlog", label: "블로그", icon: "N" },
  { key: "naverPost", label: "포스트", icon: "N+" },
  { key: "kakaoChannel", label: "카카오", icon: "k" },
  { key: "tiktok", label: "TikTok", icon: "tt" },
];

const SNS_COLORS: Record<string, string> = {
  facebook: "#1877F2",
  twitter: "#000000",
  instagram: "#E4405F",
  youtube: "#FF0000",
  naverBlog: "#03C75A",
  naverPost: "#03C75A",
  kakaoChannel: "#FEE500",
  tiktok: "#000000",
};

export default function CulturepeopleFooter6({
  mode = "light",
}: CulturepeopleFooter6Props) {
  const colors = COLORS[mode];
  const [siteInfo, setSiteInfo] = useState<SiteInfo>(DEFAULT_SITE_INFO);
  const [snsSettings, setSnsSettings] = useState<SnsSettings>(DEFAULT_SNS);

  useEffect(() => {
    Promise.all([
      getSetting<SiteInfo>("cp-site-info", DEFAULT_SITE_INFO),
      getSetting<SnsSettings>("cp-sns-settings", DEFAULT_SNS),
    ]).then(([site, sns]) => {
      setSiteInfo(site);
      setSnsSettings(sns);
    }).catch(() => {});
  }, []);

  const activeSns = SNS_ITEMS.filter(
    (item) => snsSettings[item.key] && snsSettings[item.key].trim() !== ""
  );

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
            <span
              className="mb-3 block text-xl font-bold"
              style={{ color: colors.accent }}
            >
              컬처피플
            </span>

            <div className="space-y-1 text-xs leading-relaxed" style={{ color: colors.text }}>
              <p>
                <span className="font-medium" style={{ color: colors.title }}>
                  {siteInfo.companyName}
                </span>{" "}
                | 대표이사: {siteInfo.ceo}
              </p>
              <p>{siteInfo.address}</p>
              <p>
                대표전화: {siteInfo.phone} | 팩스: {siteInfo.fax} | 이메일: {siteInfo.email}
              </p>
              <p>
                등록번호: {siteInfo.registerNo} | 등록일: {siteInfo.registerDate} | 발행인: {siteInfo.publisher} | 편집인: {siteInfo.editor}
              </p>
              <p>
                인터넷신문 등록번호: {siteInfo.internetRegisterNo} | 청소년보호책임자: {siteInfo.youthManager}
              </p>
            </div>
          </div>

          {/* Right side: SNS + Mobile */}
          <div className="shrink-0 flex flex-col items-end gap-4">
            {activeSns.length > 0 && (
              <div className="flex flex-wrap gap-2 justify-end">
                {activeSns.map((item) => (
                  <a
                    key={item.key}
                    href={snsSettings[item.key]}
                    target="_blank"
                    rel="noopener noreferrer nofollow"
                    title={item.label}
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                      width: 32,
                      height: 32,
                      borderRadius: "50%",
                      background: item.key === "kakaoChannel"
                        ? SNS_COLORS[item.key]
                        : "#FFF",
                      border: `1px solid ${colors.border}`,
                      color: item.key === "kakaoChannel"
                        ? "#3C1E1E"
                        : SNS_COLORS[item.key] || colors.text,
                      fontSize: 12,
                      fontWeight: 700,
                      textDecoration: "none",
                      transition: "opacity 0.15s",
                    }}
                    className="hover:opacity-70"
                  >
                    {item.icon}
                  </a>
                ))}
              </div>
            )}

            <a
              href="/"
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
