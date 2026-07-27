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

interface AboutInfo {
  companyName?: string;
  ceo?: string;
  publisher?: string;
  editor?: string;
  bizNumber?: string;
  address?: string;
  phone?: string;
  fax?: string;
  email?: string;
}

interface MenuItem {
  label: string;
  href: string;
  url?: string;
  visible?: boolean;
  location?: "header" | "footer" | "both";
}

/** cp-site-settings 값이 비어 있으면 cp-about 값으로 보완한다. */
function mergeSiteWithAbout(site: SiteSettings | null | undefined, about: AboutInfo | null | undefined): SiteSettings {
  const safeSite = site || {};
  const safeAbout = about || {};
  return {
    ...safeSite,
    siteName: safeSite.siteName || safeAbout.companyName,
    ceo: safeSite.ceo || safeAbout.ceo,
    publisher: safeSite.publisher || safeAbout.publisher,
    editor: safeSite.editor || safeAbout.editor,
    registerNo: safeSite.registerNo || safeAbout.bizNumber,
    address: safeSite.address || safeAbout.address,
    phone: safeSite.phone || safeAbout.phone,
    fax: safeSite.fax || safeAbout.fax,
    email: safeSite.email || safeAbout.email,
  };
}

const DEFAULT_FOOTER_NAV: MenuItem[] = [
  { label: "매체소개", href: "/about" },
  { label: "기사제보 및 소비자 민원", href: "/contact" },
  { label: "광고문의", href: "/advertising" },
  { label: "개인정보처리방침", href: "/privacy" },
  { label: "윤리강령", href: "/terms" },
  { label: "청소년보호정책", href: "/youth-policy" },
  { label: "저작권보호정책", href: "/terms" },
  { label: "이메일무단수집거부", href: "/terms" },
  { label: "정정·반론보도 요청", href: "/contact" },
  { label: "RSS", href: "/rss.xml" },
];

export default function InsightKoreaFooter() {
  const [site, setSite] = useState<SiteSettings>({});
  const [menus, setMenus] = useState<MenuItem[]>(DEFAULT_FOOTER_NAV);

  useEffect(() => {
    Promise.all([
      getSetting<SiteSettings>("cp-site-settings", {}),
      getSetting<AboutInfo>("cp-about", {}),
    ]).then(([siteSettings, about]) => {
      setSite(mergeSiteWithAbout(siteSettings, about));
    });
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
              <FooterInfoRow
                items={[
                  { label: "대표", value: site.ceo },
                  { label: "주소", value: site.address },
                  { label: "대표전화", value: site.phone },
                  { label: "팩스", value: site.fax },
                ]}
              />
              <FooterInfoRow
                items={[
                  { label: "제호", value: siteName },
                  { label: "사업자등록번호", value: site.registerNo },
                  { label: "등록번호", value: site.internetRegisterNo },
                  { label: "등록일", value: site.registerDate },
                  { label: "발행일", value: site.registerDate },
                ]}
              />
              <FooterInfoRow
                items={[
                  { label: "발행인", value: site.publisher },
                  { label: "편집인", value: site.editor },
                  { label: "청소년보호책임자", value: site.youthManager },
                  { label: "이메일", value: site.email },
                ]}
              />
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

/** 값이 있는 항목만 구분자로 이어 붙여 렌더링한다. 빈 값 뒤에 구분자가 남지 않는다. */
function FooterInfoRow({ items }: { items: { label: string; value?: string }[] }) {
  const visible = items.filter((item) => item.value);
  if (visible.length === 0) return null;
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: "0" }}>
      {visible.map((item, i) => (
        <span key={item.label}>
          {i > 0 && <Separator />}
          {item.label} : {item.value}
        </span>
      ))}
    </div>
  );
}
