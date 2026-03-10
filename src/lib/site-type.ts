import { serverGetSetting } from "@/lib/db-server";

export type SiteType = "netpro" | "insightkorea";

interface SiteTypeSettings {
  type: SiteType;
}

export async function getSiteType(): Promise<SiteType> {
  const settings = await serverGetSetting<SiteTypeSettings>("cp-site-type", { type: "netpro" });
  return settings.type === "insightkorea" ? "insightkorea" : "netpro";
}
