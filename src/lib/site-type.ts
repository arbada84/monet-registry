import { serverGetSetting } from "@/lib/db-server";

export type SiteType = "netpro" | "insightkorea" | "culturepeople";

interface SiteTypeSettings {
  type: SiteType;
}

export async function getSiteType(): Promise<SiteType> {
  const settings = await serverGetSetting<SiteTypeSettings>("cp-site-type", { type: "culturepeople" });
  if (settings.type === "insightkorea") return "insightkorea";
  if (settings.type === "culturepeople") return "culturepeople";
  return "netpro";
}

/** siteType별 브랜드 포인트 컬러. 테마 전용이 아닌 공유 페이지/컴포넌트에서 하드코딩 대신 사용한다. */
export function getSiteAccentColor(siteType: SiteType): string {
  if (siteType === "culturepeople") return "#5B4B9E";
  if (siteType === "insightkorea") return "#d2111a";
  return "#E8192C";
}
