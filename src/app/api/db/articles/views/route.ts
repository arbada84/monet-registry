import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { serverIncrementViews } from "@/lib/db-server";

// IP+기사 조합으로 10분 내 중복 조회수 증가 방지
const viewCache = new Map<string, number>(); // "ip:articleId" → timestamp
const RATE_LIMIT_MS = 10 * 60 * 1000; // 10분
const CLEANUP_INTERVAL_MS = 60 * 1000; // 1분마다 만료 항목 정리
let lastCleanup = Date.now();

function getClientIp(req: NextRequest): string {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    "unknown"
  );
}

// POST /api/db/articles/views { id }
export async function POST(request: NextRequest) {
  try {
    const { id } = await request.json();
    if (!id || typeof id !== "string") {
      return NextResponse.json({ success: false, error: "id required" }, { status: 400 });
    }

    const ip = getClientIp(request);
    const cacheKey = `${ip}:${id}`;
    const now = Date.now();
    const lastView = viewCache.get(cacheKey);

    // 동일 IP + 동일 기사 10분 내 재요청은 카운트 무시 (조용히 성공 반환)
    if (lastView && now - lastView < RATE_LIMIT_MS) {
      return NextResponse.json({ success: true });
    }
    viewCache.set(cacheKey, now);

    // 주기적 만료 정리 (1분 간격) + 상한선 방어
    if (now - lastCleanup > CLEANUP_INTERVAL_MS || viewCache.size > 10_000) {
      lastCleanup = now;
      const keys = [...viewCache.keys()];
      for (const k of keys) {
        const v = viewCache.get(k);
        if (v && now - v > RATE_LIMIT_MS) viewCache.delete(k);
      }
      // 정리 후에도 5,000개 초과 시 오래된 항목부터 강제 제거
      if (viewCache.size > 5_000) {
        let removed = 0;
        const target = viewCache.size - 5_000;
        for (const k of viewCache.keys()) {
          viewCache.delete(k);
          if (++removed >= target) break;
        }
      }
    }

    await serverIncrementViews(id);
    return NextResponse.json({ success: true });
  } catch (e) {
    console.error("[DB] POST views error:", e);
    return NextResponse.json({ success: false, error: "서버 오류가 발생했습니다." }, { status: 500 });
  }
}
