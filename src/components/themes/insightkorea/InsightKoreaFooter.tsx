"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { getSetting } from "@/lib/db";

interface SiteSettings {
  siteName?: string;
  address?: string;
  phone?: string;
  fax?: string;
  email?: string;
  ceo?: string;
  registerNo?: string;
  registerDate?: string;
  publisher?: string;
  editor?: string;
  youthManager?: string;
  internetRegisterNo?: string;
}

interface MenuItem {
  label: string;
  href: string;
  visible?: boolean;
}

const DEFAULT_FOOTER_NAV: MenuItem[] = [
  { label: "매체소개", href: "/about" },
  { label: "기사제보 및 소비자 민원", href: "/contact" },
  { label: "광고문의", href: "/contact" },
  { label: "개인정보처리방침", href: "/terms/privacy" },
  { label: "윤리강령", href: "/terms/ethics" },
  { label: "청소년보호정책", href: "/terms/youth" },
  { label: "저작권보호정책", href: "/terms/copyright" },
  { label: "이메일무단수집거부", href: "/terms/email" },
  { label: "정정·반론보도 요청", href: "/contact" },
  { label: "RSS", href: "/api/rss" },
];

export default function InsightKoreaFooter() {
  const [site, setSite] = useState<SiteSettings>({});
  const [menus, setMenus] = useState<MenuItem[]>(DEFAULT_FOOTER_NAV);

  useEffect(() => {
    getSetting<SiteSettings>("cp-site-settings", {}).then(setSite);
    getSetting<{ footer?: MenuItem[] }>("cp-menus", {}).then((m) => {
      if (m?.footer?.length) setMenus(m.footer.filter((i) => i.visible !== false));
    });
  }, []);

  const siteName = site.siteName || "컬처피플";

  return (
    <footer
      style={{
        borderTop: "2px solid #222",
        padding: "50px 0 20px",
        background: "transparent",
      }}
    >
      <div style={{ maxWidth: 1200, margin: "0 auto", padding: "0 16px" }}>
        {/* 상단 네비게이션 링크 */}
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            alignItems: "center",
            gap: "0",
            paddingBottom: 16,
            borderBottom: "1px solid #e5e5e5",
          }}
        >
          {menus.map((item, i) => (
            <span key={item.label} style={{ display: "inline-flex", alignItems: "center" }}>
              {i > 0 && (
                <span
                  style={{
                    color: "#ccc",
                    margin: "0 8px",
                    fontSize: 13,
                    userSelect: "none",
                  }}
                >
                  |
                </span>
              )}
              <Link
                href={item.href}
                style={{
                  fontSize: 13,
                  color: item.label === "개인정보처리방침" ? "#222" : "#666",
                  fontWeight: item.label === "개인정보처리방침" ? 700 : 400,
                  textDecoration: "none",
                  lineHeight: "1.6",
                }}
              >
                {item.label}
              </Link>
            </span>
          ))}
        </div>

        {/* 법인 정보 + 로고 */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
            paddingTop: 20,
            gap: 24,
            flexWrap: "wrap",
          }}
        >
          {/* 왼쪽: 회사 정보 */}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div
              style={{
                fontSize: 12,
                color: "#888",
                lineHeight: "2",
              }}
            >
              <div style={{ display: "flex", flexWrap: "wrap", gap: "0" }}>
                {site.ceo && (
                  <span>
                    법인명 : {site.ceo}
                    <Separator />
                  </span>
                )}
                {site.address && (
                  <span>
                    주소 : {site.address}
                    <Separator />
                  </span>
                )}
                {site.phone && (
                  <span>
                    대표전화 : {site.phone}
                    <Separator />
                  </span>
                )}
                {site.fax && (
                  <span>
                    팩스 : {site.fax}
                  </span>
                )}
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "0" }}>
                <span>
                  제호 : {siteName}
                  <Separator />
                </span>
                {site.internetRegisterNo && (
                  <span>
                    등록번호 : {site.internetRegisterNo}
                    <Separator />
                  </span>
                )}
                {site.registerDate && (
                  <span>
                    등록일 : {site.registerDate}
                    <Separator />
                  </span>
                )}
                {site.registerDate && (
                  <span>
                    발행일 : {site.registerDate}
                  </span>
                )}
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "0" }}>
                {site.publisher && (
                  <span>
                    발행인 : {site.publisher}
                    <Separator />
                  </span>
                )}
                {site.editor && (
                  <span>
                    편집인 : {site.editor}
                    <Separator />
                  </span>
                )}
                {site.youthManager && (
                  <span>
                    청소년보호책임자 : {site.youthManager}
                  </span>
                )}
              </div>
            </div>

            {/* 저작권 */}
            <div
              style={{
                marginTop: 16,
                fontSize: 12,
                color: "#aaa",
              }}
            >
              Copyright by {siteName} All rights reserved.
            </div>
          </div>

          {/* 오른쪽: 로고 - 컬처피플 자체 브랜딩 */}
          <div style={{ flexShrink: 0, textAlign: "right", paddingTop: 4 }}>
            <Link href="/" style={{ textDecoration: "none", display: "inline-block" }}>
              <div
                style={{
                  fontFamily: "Georgia, 'Times New Roman', serif",
                  fontSize: 28,
                  fontWeight: 900,
                  color: "#d2111a",
                  letterSpacing: "-0.5px",
                  lineHeight: "1.1",
                }}
              >
                {siteName}
              </div>
            </Link>
          </div>
        </div>
      </div>
    </footer>
  );
}

/** 구분자 컴포넌트 */
function Separator() {
  return (
    <span
      style={{
        display: "inline-block",
        margin: "0 8px",
        color: "#ccc",
        userSelect: "none",
      }}
    >
      |
    </span>
  );
}
