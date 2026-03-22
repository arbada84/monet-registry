import { serverGetSetting } from "@/lib/db-server";

interface AdsGlobalSettings {
  adsTxtContent?: string;
  adsensePublisherId?: string;
}

export async function GET() {
  const settings = await serverGetSetting<AdsGlobalSettings>("cp-ads-global", {});

  // 수동 입력된 ads.txt가 있으면 그대로 사용
  if (settings.adsTxtContent?.trim()) {
    return new Response(settings.adsTxtContent, {
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }

  // 없으면 Publisher ID로 자동 생성
  const pubId = settings.adsensePublisherId;
  if (pubId) {
    // ca-pub-XXXXX → pub-XXXXX 형식으로 변환
    const cleanId = pubId.replace(/^ca-/, "");
    const content = `google.com, ${cleanId}, DIRECT, f08c47fec0942fa0`;
    return new Response(content, {
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }

  return new Response("", {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}
