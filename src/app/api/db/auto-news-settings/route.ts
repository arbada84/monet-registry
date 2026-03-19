/**
 * 자동 뉴스 설정 CRUD
 * GET   /api/db/auto-news-settings            → 현재 설정 조회
 * POST  /api/db/auto-news-settings            → 설정 저장
 * GET   /api/db/auto-news-settings?history=1  → 실행 이력 조회
 */
import { NextRequest, NextResponse } from "next/server";
import { serverGetSetting, serverSaveSetting } from "@/lib/db-server";
import { isAuthenticated } from "@/lib/cookie-auth";
import type { AutoNewsSettings } from "@/types/article";
import { DEFAULT_AUTO_NEWS_SETTINGS } from "@/lib/auto-defaults";

export async function GET(req: NextRequest) {
  if (!(await isAuthenticated(req))) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }
  try {
    const url = new URL(req.url);
    if (url.searchParams.get("history") === "1") {
      const history = await serverGetSetting("cp-auto-news-history", []);
      return NextResponse.json({ success: true, history });
    }
    if (url.searchParams.get("settings-history") === "1") {
      const settingsHistory = await serverGetSetting("cp-auto-news-settings-history", []);
      return NextResponse.json({ success: true, settingsHistory });
    }
    const settings = await serverGetSetting<AutoNewsSettings>(
      "cp-auto-news-settings",
      DEFAULT_AUTO_NEWS_SETTINGS
    );
    return NextResponse.json({ success: true, settings });
  } catch (e) {
    return NextResponse.json({ success: false, error: "서버 오류가 발생했습니다." }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  if (!(await isAuthenticated(req))) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }
  try {
    const body = await req.json();

    const current = await serverGetSetting<AutoNewsSettings>(
      "cp-auto-news-settings",
      DEFAULT_AUTO_NEWS_SETTINGS
    );

    const updated: AutoNewsSettings = {
      ...current,
      ...body,
      sources: Array.isArray(body.sources) ? body.sources : current.sources,
      keywords: Array.isArray(body.keywords)
        ? body.keywords
        : (typeof body.keywords === "string"
            ? body.keywords.split(",").map((k: string) => k.trim()).filter(Boolean)
            : current.keywords),
      count: Math.min(100, Math.max(1, Number(body.count ?? current.count) || 5)),
      dedupeWindowHours: Math.min(168, Math.max(1, Number(body.dedupeWindowHours ?? current.dedupeWindowHours) || 48)),
    };

    await serverSaveSetting("cp-auto-news-settings", updated);

    // 설정 변경 이력 저장
    const changes: string[] = [];
    if (current.enabled !== updated.enabled) changes.push(`활성화: ${updated.enabled ? "ON" : "OFF"}`);
    if (current.count !== updated.count) changes.push(`기사 수: ${current.count} → ${updated.count}`);
    if (current.publishStatus !== updated.publishStatus) changes.push(`발행 상태: ${current.publishStatus} → ${updated.publishStatus}`);
    if (current.author !== updated.author) changes.push(`기자명: ${current.author} → ${updated.author}`);
    if (current.category !== updated.category) changes.push(`카테고리: ${current.category} → ${updated.category}`);
    if (current.aiProvider !== updated.aiProvider) changes.push(`AI 제공사: ${current.aiProvider} → ${updated.aiProvider}`);
    if (current.aiModel !== updated.aiModel) changes.push(`AI 모델: ${current.aiModel} → ${updated.aiModel}`);
    if (current.dedupeWindowHours !== updated.dedupeWindowHours) changes.push(`중복방지: ${current.dedupeWindowHours}h → ${updated.dedupeWindowHours}h`);
    const prevSrcIds = (current.sources || []).filter((s) => s.enabled).map((s) => s.id).sort().join(",");
    const newSrcIds = (updated.sources || []).filter((s) => s.enabled).map((s) => s.id).sort().join(",");
    if (prevSrcIds !== newSrcIds) changes.push("소스 변경");
    const prevKw = (current.keywords || []).join(",");
    const newKw = (updated.keywords || []).join(",");
    if (prevKw !== newKw) changes.push(`키워드: ${newKw || "(없음)"}`);

    if (changes.length > 0) {
      const settingsHistory = await serverGetSetting<{ at: string; changes: string[] }[]>("cp-auto-news-settings-history", []);
      settingsHistory.unshift({ at: new Date().toISOString(), changes });
      // 최근 50건만 유지
      await serverSaveSetting("cp-auto-news-settings-history", settingsHistory.slice(0, 50));
    }

    return NextResponse.json({ success: true, settings: updated });
  } catch (e) {
    return NextResponse.json({ success: false, error: "서버 오류가 발생했습니다." }, { status: 500 });
  }
}
