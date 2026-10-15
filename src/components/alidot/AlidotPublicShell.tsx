import Image from "next/image";
import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";
import CulturepeopleHeader0 from "@/components/registry/culturepeople-header-0";
import CulturepeopleFooter6 from "@/components/registry/culturepeople-footer-6";
import { CulturePeopleFooter, CulturePeopleHeader } from "@/components/themes/culturepeople";
import { InsightKoreaFooter, InsightKoreaHeader } from "@/components/themes/insightkorea";
import { ALIDOT_PATHS } from "@/lib/alidot-legal";
import { getSiteTypeOption, type SiteType } from "@/lib/site-type-options";

const NAV_ITEMS = [
  { label: "서비스 소개", href: ALIDOT_PATHS.home },
  { label: "이용약관", href: ALIDOT_PATHS.terms },
  { label: "개인정보처리방침", href: ALIDOT_PATHS.privacy },
] as const;

function siteChrome(siteType: SiteType) {
  if (siteType === "culturepeople") return { Header: CulturePeopleHeader, Footer: CulturePeopleFooter };
  if (siteType === "insightkorea") return { Header: InsightKoreaHeader, Footer: InsightKoreaFooter };
  return { Header: CulturepeopleHeader0, Footer: CulturepeopleFooter6 };
}

export default function AlidotPublicShell({
  siteType,
  currentPath,
  children,
}: {
  siteType: SiteType;
  currentPath: string;
  children: ReactNode;
}) {
  const { Header, Footer } = siteChrome(siteType);
  const accent = getSiteTypeOption(siteType).accent;

  return (
    <div
      data-alidot-site-type={siteType}
      className="min-h-screen bg-white text-[#17191f]"
      style={{ "--site-accent": accent } as CSSProperties}
    >
      <Header />
      <div className="border-b border-[#dfe3ea] bg-white">
        <div className="mx-auto flex min-h-16 max-w-[1180px] flex-wrap items-center justify-between gap-3 px-4 py-3">
          <Link href={ALIDOT_PATHS.home} className="inline-flex items-center gap-2 text-[#17191f] no-underline">
            <Image src="/alidot/alidot-symbol.png" alt="" width={36} height={36} className="h-9 w-9 object-contain" />
            <span className="text-lg font-bold">알리닷</span>
            <span className="hidden text-xs text-[#667085] sm:inline">컬피 운영</span>
          </Link>
          <nav aria-label="알리닷 정책 메뉴" className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
            {NAV_ITEMS.map((item) => {
              const active = currentPath === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className="border-b-2 py-1 font-medium text-[#4b5565] no-underline transition-colors hover:text-[#17191f] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4"
                  style={{ borderColor: active ? accent : "transparent", outlineColor: accent }}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </div>
      </div>
      <main>{children}</main>
      <Footer />
    </div>
  );
}
