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
  url?: string;
  visible?: boolean;
  location?: "header" | "footer" | "both";
}

const DEFAULT_FOOTER_NAV: MenuItem[] = [
  { label: "매체소개", href: "/about" },
  { label: "기사제보 및 소비자 민원", href: "/contact" },
  { label: "광고문의", href: "/contact" },
  { label: "개인정보처리방침", href: "/privacy" },
  { label: "윤리강령", href: "/terms" },
  { label: "청소년보호정책", href: "/terms" },
  { label: "저작권보호정책", href: "/terms" },
  { label: "이메일무단수집거부", href: "/terms" },
  { label: "정정·반론보도 요청", href: "/contact" },
  { label: "RSS", href: "/api/rss" },
];

export default function InsightKoreaFooter() {
  const [site, setSite] = useState<SiteSettings>({});
  const [menus, setMenus] = useState<MenuItem[]>(DEFAULT_FOOTER_NAV);

  useEffect(() => {
    getSetting<SiteSettings>("cp-site-settings", {}).then(setSite);
    getSetting<MenuItem[]>("cp-menus", []).then((m) => {
      const arr = Array.isArray(m) ? m : [];
      const footerItems = arr
        .filter((i) => i.visible !== false && (i.location === "footer" || i.location === "both"))
        .map((i) => ({ ...i, href: i.href || i.url || "/" }));
      if (footerItems.length) setMenus(footerItems);
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
                  color: item.label === "개인정보처리방침" ? "#222" : "#555",
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
                    대표 : {site.ceo}
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

          {/* 오른쪽: 로고 */}
          <div style={{ flexShrink: 0, textAlign: "right", paddingTop: 4 }}>
            <Link href="/" style={{ textDecoration: "none", display: "inline-block" }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/logo-full.svg"
                alt={siteName}
                style={{ height: 36 }}
              />
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
