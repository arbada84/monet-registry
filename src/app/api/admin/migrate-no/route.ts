import { NextResponse } from "next/server";

const BASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

function getHeaders(): Record<string, string> {
  return {
    "Content-Type": "application/json",
    apikey: SERVICE_KEY ?? "",
    Authorization: `Bearer ${SERVICE_KEY ?? ""}`,
    Prefer: "return=minimal",
  };
}

/**
 * POST /api/admin/migrate-no
 * no가 없는 기존 기사 전체에 순서 번호 할당 (created_at ASC 기준)
 * 미들웨어에서 어드민 인증 필수 (middleware.ts의 /api/db... 보호 범위 밖이므로 직접 확인)
 */
export async function POST() {
  if (!BASE_URL || !SERVICE_KEY) {
    return NextResponse.json({ success: false, error: "Supabase 환경변수가 설정되지 않았습니다." }, { status: 500 });
  }

  try {
    // 1. no가 없는 기사 목록 조회 (created_at ASC 정렬)
    const nullRes = await fetch(
      `${BASE_URL}/rest/v1/articles?no=is.null&select=id,created_at&order=created_at.asc,id.asc&limit=2000`,
      { headers: { ...getHeaders(), Prefer: "return=representation" }, cache: "no-store" }
    );
    if (!nullRes.ok) {
      return NextResponse.json({ success: false, error: `기사 조회 실패: ${nullRes.status}` }, { status: 500 });
    }
    const nullArticles: { id: string; created_at: string }[] = await nullRes.json();

    if (nullArticles.length === 0) {
      return NextResponse.json({ success: true, updated: 0, message: "모든 기사에 이미 번호가 있습니다." });
    }

    // 2. 현재 최대 no 조회
    const maxRes = await fetch(
      `${BASE_URL}/rest/v1/articles?no=not.is.null&select=no&order=no.desc&limit=1`,
      { headers: { ...getHeaders(), Prefer: "return=representation" }, cache: "no-store" }
    );
    const maxRows: { no: number }[] = maxRes.ok ? await maxRes.json() : [];
    const maxNo = maxRows[0]?.no ?? 0;

    // 3. 병렬 배치 업데이트 (20개씩)
    const BATCH = 20;
    let updated = 0;
    let failed = 0;

    for (let i = 0; i < nullArticles.length; i += BATCH) {
      const batch = nullArticles.slice(i, i + BATCH);
      await Promise.all(
        batch.map((article, idx) => {
          const newNo = maxNo + i + idx + 1;
          return fetch(
            `${BASE_URL}/rest/v1/articles?id=eq.${encodeURIComponent(article.id)}`,
            {
              method: "PATCH",
              headers: getHeaders(),
              body: JSON.stringify({ no: newNo }),
              cache: "no-store",
            }
          ).then((r) => {
            if (r.ok) updated++;
            else failed++;
          }).catch(() => { failed++; });
        })
      );
    }

    return NextResponse.json({
      success: true,
      updated,
      failed,
      message: `${updated}개 기사에 번호 할당 완료${failed > 0 ? `, ${failed}개 실패` : ""}`,
    });
  } catch (e) {
    console.error("[migrate-no] error:", e);
    return NextResponse.json({ success: false, error: "서버 오류" }, { status: 500 });
  }
}
