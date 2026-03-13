/**
 * 보도자료 자동 등록 설정 CRUD
 * GET   /api/db/auto-press-settings            → 현재 설정 조회
 * POST  /api/db/auto-press-settings            → 설정 저장
 * GET   /api/db/auto-press-settings?history=1  → 실행 이력 조회
 */
import { NextRequest, NextResponse } from "next/server";
import { serverGetSetting, serverSaveSetting } from "@/lib/db-server";
import type { AutoPressSettings } from "@/types/article";
import { DEFAULT_AUTO_PRESS_SETTINGS } from "@/lib/auto-defaults";

export async function GET(req: NextRequest) {
  try {
    if (new URL(req.url).searchParams.get("history") === "1") {
      const history = await serverGetSetting("cp-auto-press-history", []);
      return NextResponse.json({ success: true, history });
    }
    const settings = await serverGetSetting<AutoPressSettings>(
      "cp-auto-press-settings",
      DEFAULT_AUTO_PRESS_SETTINGS
    );

    // 새로 추가된 기본 소스를 기존 설정에 자동 병합 (id 기준)
    const existingIds = new Set(settings.sources.map((s) => s.id));
    const newSources = DEFAULT_AUTO_PRESS_SETTINGS.sources.filter((s) => !existingIds.has(s.id));
    if (newSources.length > 0) {
      settings.sources = [...settings.sources, ...newSources];
    }

    return NextResponse.json({ success: true, settings });
  } catch (e) {
    return NextResponse.json({ success: false, error: "서버 오류가 발생했습니다." }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    const current = await serverGetSetting<AutoPressSettings>(
      "cp-auto-press-settings",
      DEFAULT_AUTO_PRESS_SETTINGS
    );

    const updated: AutoPressSettings = {
      ...current,
      ...body,
      sources: Array.isArray(body.sources) ? body.sources : current.sources,
      keywords: Array.isArray(body.keywords)
        ? body.keywords
        : (typeof body.keywords === "string"
            ? body.keywords.split(",").map((k: string) => k.trim()).filter(Boolean)
            : current.keywords),
      count: Math.min(20, Math.max(1, Number(body.count ?? current.count) || 5)),
      dedupeWindowHours: Math.min(168, Math.max(1, Number(body.dedupeWindowHours ?? current.dedupeWindowHours) || 48)),
      requireImage: body.requireImage !== undefined ? Boolean(body.requireImage) : current.requireImage,
    };

    await serverSaveSetting("cp-auto-press-settings", updated);
    return NextResponse.json({ success: true, settings: updated });
  } catch (e) {
    return NextResponse.json({ success: false, error: "서버 오류가 발생했습니다." }, { status: 500 });
  }
}
