import { NextRequest, NextResponse } from "next/server";
import { serverGetSetting, serverSaveSetting } from "@/lib/db-server";
import { isAuthenticated } from "@/lib/cookie-auth";

// DB의 canonicalUrl에 저장된 개행 문자를 제거하는 일회성 수정 엔드포인트
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  if (!(await isAuthenticated(req))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const seoSettings = await serverGetSetting<Record<string, unknown>>("cp-seo-settings", {});
    const raw = (seoSettings.canonicalUrl as string) ?? "";

    if (!raw) {
      return NextResponse.json({ success: true, message: "canonicalUrl이 비어있습니다. 수정 불필요." });
    }

    // 개행 문자 제거 및 정리
    const clean = raw.replace(/[\s\r\n]/g, "").replace(/\/$/, "");
    const isValid = /^https?:\/\/[a-zA-Z0-9]/.test(clean);
    const fixed = isValid ? clean : "";

    if (raw === fixed) {
      return NextResponse.json({ success: true, message: "canonicalUrl이 이미 정상입니다.", value: fixed });
    }

    const updated = { ...seoSettings, canonicalUrl: fixed };
    await serverSaveSetting("cp-seo-settings", updated);

    return NextResponse.json({
      success: true,
      message: `canonicalUrl 수정 완료: "${raw.replace(/\n/g, "\\n")}" → "${fixed}"`,
      before: raw,
      after: fixed,
    });
  } catch (e) {
    return NextResponse.json({ success: false, error: "서버 오류가 발생했습니다." }, { status: 500 });
  }
}
