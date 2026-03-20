import { serverGetSetting } from "@/lib/db-server";

export type SiteType = "netpro" | "insightkorea" | "culturepeople";

interface SiteTypeSettings {
  type: SiteType;
}

export async function getSiteType(): Promise<SiteType> {
  const settings = await serverGetSetting<SiteTypeSettings>("cp-site-type", { type: "netpro" });
  if (settings.type === "insightkorea") return "insightkorea";
  if (settings.type === "culturepeople") return "culturepeople";
  return "netpro";
}
