import { serverGetSetting } from "@/lib/db-server";

export const dynamic = "force-dynamic";

const DEFAULT_ADS_TXT_CONTENT = "google.com, pub-7637714403564102, DIRECT, f08c47fec0942fa0";

interface AdsGlobalSettings {
  adsTxtContent?: string;
  adsensePublisherId?: string;
}

function textResponse(content: string): Response {
  return new Response(`${content.trim()}\n`, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=600",
    },
  });
}

export async function GET() {
  let settings: AdsGlobalSettings = {};
  try {
    const loaded = await serverGetSetting<AdsGlobalSettings | null>("cp-ads-global", {});
    settings = loaded && typeof loaded === "object" ? loaded : {};
  } catch {
    return textResponse(DEFAULT_ADS_TXT_CONTENT);
  }

  // 수동 입력된 ads.txt가 있으면 그대로 사용
  if (settings.adsTxtContent?.trim()) {
    return textResponse(settings.adsTxtContent);
  }

  // 없으면 Publisher ID로 자동 생성
  const pubId = settings.adsensePublisherId?.trim();
  if (pubId) {
    // ca-pub-XXXXX → pub-XXXXX 형식으로 변환
    const cleanId = pubId.replace(/^ca-/, "");
    return textResponse(`google.com, ${cleanId}, DIRECT, f08c47fec0942fa0`);
  }

  return textResponse(DEFAULT_ADS_TXT_CONTENT);
}
