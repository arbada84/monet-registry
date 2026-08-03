import { serverGetSetting } from "@/lib/db-server";
import {
  DEFAULT_SITE_TYPE,
  getSiteTypeOption,
  resolveSiteType,
  type SiteType,
} from "@/lib/site-type-options";

export type { SiteType } from "@/lib/site-type-options";

interface SiteTypeSettings {
  type: SiteType;
}

export async function getSiteType(): Promise<SiteType> {
  const settings = await serverGetSetting<SiteTypeSettings | null>("cp-site-type", { type: DEFAULT_SITE_TYPE });
  return resolveSiteType(settings?.type);
}

/** siteType별 브랜드 포인트 컬러. 테마 전용이 아닌 공유 페이지/컴포넌트에서 하드코딩 대신 사용한다. */
export function getSiteAccentColor(siteType: SiteType): string {
  return getSiteTypeOption(siteType).accent;
}
