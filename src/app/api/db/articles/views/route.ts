import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { serverIncrementViews } from "@/lib/db-server";

// IP+기사 조합으로 10분 내 중복 조회수 증가 방지
const viewCache = new Map<string, number>(); // "ip:articleId" → timestamp
const RATE_LIMIT_MS = 10 * 60 * 1000; // 10분

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

    // 캐시 크기 관리: 1,000개 초과 시 만료된 항목 정리 (메모리 누수 방지)
    if (viewCache.size > 1_000) {
      for (const [k, v] of viewCache.entries()) {
        if (now - v > RATE_LIMIT_MS) viewCache.delete(k);
      }
      // 정리 후에도 500개 초과 시 오래된 항목부터 강제 제거
      if (viewCache.size > 500) {
        const sorted = [...viewCache.entries()].sort((a, b) => a[1] - b[1]);
        for (const [k] of sorted.slice(0, viewCache.size - 500)) {
          viewCache.delete(k);
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
