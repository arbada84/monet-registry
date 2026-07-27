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

const ACCENT = "#5B4B9E";
const ACCENT_LIGHT = "#7B6DAF";
const FONT_STACK = `-apple-system, "Apple SD Gothic Neo", Inter, "Noto Sans KR", "Malgun Gothic", sans-serif`;

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

/** 컬처피플 로고 SVG - 보라색 겹치는 원 4개 (클로버 형태) */
function CulturePeopleLogo({ size = 28 }: { size?: number }) {
  const r = size * 0.22;
  const cx = size / 2;
  const cy = size / 2;
  const offset = size * 0.16;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} fill="none">
      <circle cx={cx - offset} cy={cy - offset} r={r} fill="#5B4B9E" opacity={0.85} />
      <circle cx={cx + offset} cy={cy - offset} r={r} fill="#7B6DAF" opacity={0.85} />
      <circle cx={cx - offset} cy={cy + offset} r={r} fill="#B0A5CC" opacity={0.85} />
      <circle cx={cx + offset} cy={cy + offset} r={r} fill="#D5CFE0" opacity={0.85} />
    </svg>
  );
}

export default function CulturePeopleFooter() {
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
        .filter(
          (i) =>
            i.visible !== false &&
            (i.location === "footer" || i.location === "both")
        )
        .map((i) => ({ ...i, href: i.href || i.url || "/" }));
      if (footerItems.length) setMenus(footerItems);
    });
  }, []);

  const siteName = site.siteName || "컬처피플";

  return (
    <footer
      style={{
        fontFamily: FONT_STACK,
        borderTop: `3px solid ${ACCENT}`,
        background: "#fafafa",
      }}
    >
      <div
        style={{
          maxWidth: 1200,
          margin: "0 auto",
          padding: "40px 16px 20px",
        }}
      >
        {/* ── 상단 네비게이션 링크 ── */}
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
            <span
              key={item.label}
              style={{ display: "inline-flex", alignItems: "center" }}
            >
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
                  color:
                    item.label === "개인정보처리방침" ? ACCENT : "#555",
                  fontWeight:
                    item.label === "개인정보처리방침" ? 700 : 400,
                  textDecoration: "none",
                  lineHeight: "1.6",
                }}
              >
                {item.label}
              </Link>
            </span>
          ))}
        </div>

        {/* ── 중단: 회사 정보 + 로고 ── */}
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
          {/* 왼쪽: 법인 정보 */}
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
              Copyright &copy; {siteName} All rights reserved.
            </div>
          </div>

          {/* 오른쪽: 로고 */}
          <div
            style={{ flexShrink: 0, textAlign: "right", paddingTop: 4 }}
          >
            <Link
              href="/"
              style={{
                textDecoration: "none",
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
              }}
            >
              <CulturePeopleLogo size={28} />
              <span
                style={{
                  fontSize: 16,
                  fontWeight: 700,
                  color: ACCENT,
                  letterSpacing: "-0.02em",
                }}
              >
                {siteName}
              </span>
            </Link>
          </div>
        </div>

        {/* ── 하단: 파트너 제휴 안내 ── */}
        <div
          style={{
            marginTop: 24,
            paddingTop: 16,
            borderTop: "1px solid #e5e5e5",
            textAlign: "center",
          }}
        >
          <p
            style={{
              fontSize: 12,
              color: "#999",
              lineHeight: "1.8",
              margin: 0,
            }}
          >
            컬처피플은 함께할 파트너를 기다리고 있습니다.
            <br />
            함께 하시려면, 언제든 컬피 담당자를 찾아주세요.
          </p>
          <p
            style={{
              fontSize: 12,
              color: ACCENT_LIGHT,
              marginTop: 8,
              fontWeight: 500,
            }}
          >
            제휴 문의 담당자 :{" "}
            <a
              href="mailto:colorful@culturepeople.co.kr"
              style={{
                color: ACCENT,
                textDecoration: "none",
                fontWeight: 600,
              }}
            >
              colorful@culturepeople.co.kr
            </a>
          </p>
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
