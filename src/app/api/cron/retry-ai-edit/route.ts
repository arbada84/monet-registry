/**
 * AI 편집 실패 기사 자동 재편집 크론 핸들러
 * POST /api/cron/retry-ai-edit
 * GET  /api/cron/retry-ai-edit
 *
 * 임시저장 상태 + "AI 편집 실패" reviewNote 기사를 찾아 AI 재편집 시도.
 * 점진적 재시도 간격: 1h → 6h → 12h → 24h → 48h → 70h (총 6회)
 * 성공 시 "게시"로 전환 + aiGenerated=true.
 * 6회 초과 시 "AI 재편집 포기 — 수동 검토 필요"로 변경.
 */
import { NextRequest, NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { serverGetSetting, serverSaveSetting, serverUpdateArticle } from "@/lib/db-server";
import { serverUploadImageUrl } from "@/lib/server-upload-image";
import { verifyAuthToken, timingSafeEqual } from "@/lib/cookie-auth";
import { aiEditArticle, VALID_CATEGORIES } from "@/lib/ai-prompt";
import type { AutoPressSettings } from "@/types/article";

const TIMEOUT_MS = 50_000; // 50초 안전마진 (Vercel 60초 제한)
const MAX_BATCH = 5;       // 한번에 최대 5건

// 점진적 재시도 간격 (시간 단위) — 회차별 최소 대기 시간
// 0회차→1회차: 1시간, 1→2: 6시간, 2→3: 12시간, 3→4: 24시간, 4→5: 48시간, 5→6: 70시간
const RETRY_DELAYS_HOURS = [1, 6, 12, 24, 48, 70];
const MAX_RETRY = RETRY_DELAYS_HOURS.length; // 6회

// ── 인증 ──
async function authenticate(req: NextRequest): Promise<boolean> {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const bearer = req.headers.get("authorization")?.replace("Bearer ", "") ?? "";
    if (bearer && timingSafeEqual(bearer, secret)) return true;
  }
  const cookie = req.cookies.get("cp-admin-auth");
  const result = await verifyAuthToken(cookie?.value ?? "");
  return result.valid;
}

// ── reviewNote에서 재시도 횟수 파싱 ──
function parseRetryCount(note: string): number {
  const match = note.match(/\((\d+)\/\d+\)/);
  return match ? parseInt(match[1], 10) : 0;
}

// ── 재시도 간격 체크: updatedAt 기준으로 충분한 시간이 경과했는지 ──
function isReadyForRetry(retryCount: number, updatedAt: string): boolean {
  if (retryCount >= MAX_RETRY) return false;
  const delayHours = RETRY_DELAYS_HOURS[retryCount] ?? 70;
  const lastAttempt = new Date(updatedAt).getTime();
  const requiredWait = delayHours * 60 * 60 * 1000;
  return Date.now() - lastAttempt >= requiredWait;
}

// ── Supabase에서 AI 편집 실패 임시저장 기사 조회 ──
async function getAiFailedDrafts(limit: number): Promise<Array<{
  id: string; title: string; body: string; category: string;
  sourceUrl?: string; author?: string; reviewNote: string;
  thumbnail?: string; updatedAt: string;
}>> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return [];

  // status=임시저장 + review_note LIKE 'AI 편집 실패%' + 삭제 제외
  // limit을 넉넉하게 조회 (간격 체크로 일부 건너뛰므로)
  const query = `${url}/rest/v1/articles?` + new URLSearchParams({
    status: "eq.임시저장",
    review_note: "like.AI 편집 실패*",
    deleted_at: "is.null",
    select: "id,title,body,category,source_url,author,review_note,thumbnail,updated_at",
    order: "created_at.asc",
    limit: String(limit * 3),
  });

  const resp = await fetch(query, {
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    signal: AbortSignal.timeout(10000),
  });

  if (!resp.ok) {
    console.error(`[retry-ai-edit] Supabase 조회 실패: ${resp.status}`);
    return [];
  }

  const rows = await resp.json() as Array<Record<string, unknown>>;
  return rows
    .filter((r) => {
      const note = String(r.review_note || "");
      // "포기" 키워드 포함된 건 제외
      return note.startsWith("AI 편집 실패") && !note.includes("포기");
    })
    .map((r) => ({
      id: String(r.id),
      title: String(r.title || ""),
      body: String(r.body || ""),
      category: String(r.category || "공공"),
      sourceUrl: r.source_url ? String(r.source_url) : undefined,
      author: r.author ? String(r.author) : undefined,
      reviewNote: String(r.review_note || ""),
      thumbnail: r.thumbnail ? String(r.thumbnail) : undefined,
      updatedAt: String(r.updated_at || new Date().toISOString()),
    }));
}

async function handleRetry(req: NextRequest): Promise<NextResponse> {
  if (!(await authenticate(req))) {
    return NextResponse.json({ error: "인증 실패" }, { status: 401 });
  }

  const startTime = Date.now();

  // AI 설정 로드
  const settings = await serverGetSetting<AutoPressSettings>("cp-auto-press-settings", {} as AutoPressSettings);
  const aiSettings = await serverGetSetting<{ geminiApiKey?: string; openaiApiKey?: string }>("cp-ai-settings", {});
  const aiProvider = settings.aiProvider ?? "gemini";
  const aiModel = settings.aiModel ?? "gemini-2.0-flash";
  const apiKey = aiProvider === "openai"
    ? (aiSettings.openaiApiKey ?? process.env.OPENAI_API_KEY ?? "")
    : (aiSettings.geminiApiKey ?? process.env.GEMINI_API_KEY ?? "");

  if (!apiKey) {
    return NextResponse.json({ error: "AI API 키 미설정" }, { status: 500 });
  }

  // AI 편집 실패 임시저장 기사 조회
  const allDrafts = await getAiFailedDrafts(MAX_BATCH);
  if (allDrafts.length === 0) {
    return NextResponse.json({ message: "재편집 대상 없음", processed: 0, success: 0, failed: 0, skipped: 0 });
  }

  // 점진적 간격 체크 — 충분한 시간이 지난 건만 처리
  const readyDrafts = allDrafts.filter((d) => {
    const count = parseRetryCount(d.reviewNote);
    return isReadyForRetry(count, d.updatedAt);
  }).slice(0, MAX_BATCH);

  const waitingCount = allDrafts.length - readyDrafts.length;

  if (readyDrafts.length === 0) {
    return NextResponse.json({
      message: `재편집 대기 중 ${allDrafts.length}건 (아직 재시도 간격 미도달)`,
      processed: 0, success: 0, failed: 0, waiting: waitingCount,
    });
  }

  const results: Array<{ id: string; title: string; status: "success" | "failed" | "skipped" | "give_up"; retryCount?: number; nextRetryHours?: number; error?: string }> = [];

  for (const draft of readyDrafts) {
    // 타임아웃 체크
    if (Date.now() - startTime > TIMEOUT_MS) {
      results.push({ id: draft.id, title: draft.title, status: "skipped", error: "시간 초과" });
      break;
    }

    const retryCount = parseRetryCount(draft.reviewNote) + 1;

    // 최대 재시도 초과 → 포기
    if (retryCount > MAX_RETRY) {
      try {
        await serverUpdateArticle(draft.id, {
          reviewNote: `AI 재편집 포기 — 수동 검토 필요 (${MAX_RETRY}회 시도 소진)`,
          updatedAt: new Date().toISOString(),
        });
        results.push({ id: draft.id, title: draft.title, status: "give_up" });
      } catch (e) {
        results.push({ id: draft.id, title: draft.title, status: "failed", error: e instanceof Error ? e.message : "업데이트 실패" });
      }
      continue;
    }

    // 본문 텍스트 추출 (HTML → plain text)
    const bodyText = draft.body
      .replace(/<[^>]+>/g, "")
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/\s+/g, " ")
      .trim();

    if (bodyText.length < 50) {
      results.push({ id: draft.id, title: draft.title, status: "skipped", error: "본문 너무 짧음" });
      try {
        await serverUpdateArticle(draft.id, {
          reviewNote: `AI 편집 실패 — 자동 재시도 대기 (${retryCount}/${MAX_RETRY}) [본문 부족]`,
          updatedAt: new Date().toISOString(),
        });
      } catch { /* 무시 */ }
      continue;
    }

    // AI 재편집 시도
    const nextDelay = RETRY_DELAYS_HOURS[retryCount] ?? "포기";
    try {
      const edited = await aiEditArticle(aiProvider, aiModel, apiKey, draft.title, bodyText.slice(0, 3000), draft.body);

      if (edited) {
        // 성공!
        const finalCategory = (edited.category && VALID_CATEGORIES.includes(edited.category))
          ? edited.category : draft.category;

        let finalBody = edited.body;

        // 본문에 이미지 없고 원본에 이미지 있으면 복원
        if (!/<img[^>]+src=/i.test(finalBody)) {
          const origImgMatch = draft.body.match(/<img[^>]+src=["']([^"']+)["'][^>]*>/i);
          if (origImgMatch) {
            const imgHtml = `<figure style="margin:1.5em 0;text-align:center;"><img src="${origImgMatch[1]}" alt="${edited.title.replace(/"/g, "&quot;")}" style="max-width:100%;height:auto;border-radius:6px;" /></figure>`;
            let pCount = 0, insertIdx = -1, pos = 0;
            while (pos < finalBody.length) {
              const found = finalBody.indexOf("</p>", pos);
              if (found === -1) break;
              pCount++;
              if (pCount === 2) { insertIdx = found + 4; break; }
              pos = found + 4;
            }
            finalBody = insertIdx === -1 ? finalBody + imgHtml : finalBody.slice(0, insertIdx) + imgHtml + finalBody.slice(insertIdx);
          }
        }

        // 대표이미지: 본문 첫 이미지를 thumbnail으로 승격
        let thumbnail = draft.thumbnail || "";
        const firstImgMatch = finalBody.match(/<(?:figure[^>]*>)?\s*<img[^>]+src=["']([^"']+)["'][^>]*>\s*(?:<\/figure>)?/i);
        if (firstImgMatch?.[1]) {
          thumbnail = firstImgMatch[1];
          if (thumbnail && !thumbnail.includes("supabase")) {
            try {
              const uploaded = await serverUploadImageUrl(thumbnail);
              if (uploaded) thumbnail = uploaded;
            } catch { /* 원본 유지 */ }
          }
          finalBody = finalBody.replace(firstImgMatch[0], "").trim();
        }

        await serverUpdateArticle(draft.id, {
          title: edited.title,
          body: finalBody,
          summary: edited.summary || undefined,
          tags: edited.tags || undefined,
          category: finalCategory,
          status: "게시",
          aiGenerated: true,
          reviewNote: `AI 재편집 성공 (${retryCount}회차)`,
          thumbnail: thumbnail || undefined,
          updatedAt: new Date().toISOString(),
        });

        try { revalidateTag("articles"); } catch { /* 무시 */ }

        console.log(`[retry-ai-edit] 성공: ${edited.title.slice(0, 40)} (${retryCount}회차)`);
        results.push({ id: draft.id, title: edited.title, status: "success", retryCount });
      } else {
        // AI 편집 실패 — 재시도 횟수 증가
        await serverUpdateArticle(draft.id, {
          reviewNote: `AI 편집 실패 — 자동 재시도 대기 (${retryCount}/${MAX_RETRY})`,
          updatedAt: new Date().toISOString(),
        });
        console.warn(`[retry-ai-edit] 실패: ${draft.title.slice(0, 40)} (${retryCount}/${MAX_RETRY}, 다음 시도: ${nextDelay}시간 후)`);
        results.push({ id: draft.id, title: draft.title, status: "failed", retryCount, nextRetryHours: typeof nextDelay === "number" ? nextDelay : undefined, error: `${retryCount}/${MAX_RETRY}회 시도` });
      }
    } catch (e) {
      const errMsg = e instanceof Error ? e.message : "알 수 없는 오류";
      // 429 rate limit → 조기 종료
      if (errMsg.includes("429") || errMsg.toLowerCase().includes("rate limit")) {
        await serverUpdateArticle(draft.id, {
          reviewNote: `AI 편집 실패 — 자동 재시도 대기 (${retryCount}/${MAX_RETRY}) [rate limit]`,
          updatedAt: new Date().toISOString(),
        }).catch(() => {});
        results.push({ id: draft.id, title: draft.title, status: "failed", retryCount, error: "rate limit — 조기 종료" });
        console.warn("[retry-ai-edit] Rate limit 감지, 조기 종료");
        break;
      }

      try {
        await serverUpdateArticle(draft.id, {
          reviewNote: `AI 편집 실패 — 자동 재시도 대기 (${retryCount}/${MAX_RETRY})`,
          updatedAt: new Date().toISOString(),
        });
      } catch { /* 무시 */ }
      results.push({ id: draft.id, title: draft.title, status: "failed", retryCount, error: errMsg });
    }

    // rate limit 방어
    await new Promise((r) => setTimeout(r, 1000));
  }

  const success = results.filter((r) => r.status === "success").length;
  const failed = results.filter((r) => r.status === "failed").length;
  const gaveUp = results.filter((r) => r.status === "give_up").length;

  // 활동 로그 기록 (처리 건이 있을 때만)
  if (results.length > 0) {
    try {
      const logs = await serverGetSetting<Array<{ action: string; target: string; detail: string; timestamp: string; user: string }>>("cp-activity-logs", []);
      logs.unshift({
        action: "AI재편집",
        target: `${results.length}건 처리`,
        detail: `성공 ${success}건, 실패 ${failed}건, 포기 ${gaveUp}건, 대기 ${waitingCount}건`,
        timestamp: new Date().toISOString(),
        user: "시스템",
      });
      await serverSaveSetting("cp-activity-logs", logs.slice(0, 1000));
    } catch { /* 로그 실패 무시 */ }
  }

  return NextResponse.json({
    message: `AI 재편집 완료: 성공 ${success}, 실패 ${failed}, 포기 ${gaveUp}, 대기 ${waitingCount}`,
    processed: results.length,
    success,
    failed,
    gaveUp,
    waiting: waitingCount,
    retrySchedule: "1h → 6h → 12h → 24h → 48h → 70h (총 6회)",
    results,
  });
}

export async function GET(req: NextRequest) { return handleRetry(req); }
export async function POST(req: NextRequest) { return handleRetry(req); }
