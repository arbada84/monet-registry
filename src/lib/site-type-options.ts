export type SiteType = "netpro" | "insightkorea" | "culturepeople";

export const DEFAULT_SITE_TYPE: SiteType = "culturepeople";
export const CORRUPT_SITE_TYPE_FALLBACK: SiteType = "netpro";

export const SITE_TYPE_OPTIONS = [
  {
    id: "netpro",
    name: "넷프로 (오리지널)",
    description: "빨간색 내비게이션과 카테고리 중심 뉴스 그리드 디자인",
    accent: "#E8192C",
  },
  {
    id: "insightkorea",
    name: "인사이트코리아",
    description: "대형 기사와 사이드 목록을 결합한 신문형 디자인",
    accent: "#d2111a",
  },
  {
    id: "culturepeople",
    name: "컬처피플",
    description: "보라색 브랜드와 가독성을 중심으로 한 매거진 디자인",
    accent: "#5B4B9E",
  },
] as const satisfies ReadonlyArray<{
  id: SiteType;
  name: string;
  description: string;
  accent: string;
}>;

export function isSiteType(value: unknown): value is SiteType {
  return value === "netpro" || value === "insightkorea" || value === "culturepeople";
}

/** Missing settings use the product default; malformed stored values fail over to netpro. */
export function resolveSiteType(value: unknown): SiteType {
  if (value === undefined || value === null) return DEFAULT_SITE_TYPE;
  return isSiteType(value) ? value : CORRUPT_SITE_TYPE_FALLBACK;
}

export function getSiteTypeOption(siteType: SiteType) {
  return SITE_TYPE_OPTIONS.find((item) => item.id === siteType) ?? SITE_TYPE_OPTIONS[0];
}

