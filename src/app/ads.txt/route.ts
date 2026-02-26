import { serverGetSetting } from "@/lib/db-server";

interface AdsGlobalSettings {
  adsTxtContent?: string;
}

export async function GET() {
  const settings = await serverGetSetting<AdsGlobalSettings>("cp-ads-global", {});
  const content = settings.adsTxtContent ?? "";
  return new Response(content, {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}
