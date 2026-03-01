/**
 * 외부 기사 API v1 — 마크다운 파일 업로드
 * POST /api/v1/articles/markdown
 *
 * Content-Type: text/markdown  (raw 마크다운 텍스트를 body로)
 * 또는 Content-Type: application/json  ({ markdown: "..." })
 *
 * YAML 프론트매터 지원 필드:
 *   제목 / title       → article.title
 *   카테고리 / category → article.category
 *   메인이미지 / thumbnail → article.thumbnail
 *   테그 / tags        → article.tags (배열 또는 쉼표 문자열)
 *   요약문 / summary   → article.summary
 *   작성일 / date      → article.date
 *   기자 / author      → article.author (이메일 자동 조회)
 *   상태 / status      → 게시|임시저장|예약 (기본: 임시저장)
 *   예약시간 / scheduledPublishAt → ISO 8601
 *   slug               → article.slug
 *   sourceUrl / 원문   → article.sourceUrl
 *
 * 인증: Authorization: Bearer <api_key>
 */
import { NextRequest, NextResponse } from "next/server";
import { load as yamlLoad } from "js-yaml";
import { marked } from "marked";
import type { Article } from "@/types/article";
import { serverCreateArticle, serverGetArticleById, serverGetSetting } from "@/lib/db-server";
import { verifyApiKey } from "@/lib/api-key";
import { verifyAuthToken } from "@/lib/cookie-auth";

async function authenticate(req: NextRequest): Promise<boolean> {
  if (await verifyApiKey(req.headers.get("authorization"))) return true;
  const cookie = req.cookies.get("cp-admin-auth");
  const result = await verifyAuthToken(cookie?.value ?? "");
  return result.valid;
}

async function findReporterEmail(name: string): Promise<string> {
  try {
    const reporters = await serverGetSetting<{ name: string; email: string; active?: boolean }[]>("cp-reporters", []);
    const match = reporters.find((r) => r.name === name && r.active !== false);
    return match?.email ?? "";
  } catch {
    return "";
  }
}

/**
 * YAML 프론트매터와 본문을 분리한다.
 * --- (YAML) --- 블록이 없으면 전체를 본문으로 처리.
 */
function parseFrontmatter(raw: string): { meta: Record<string, unknown>; body: string } {
  const fmMatch = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!fmMatch) return { meta: {}, body: raw };

  let meta: Record<string, unknown> = {};
  try {
    const parsed = yamlLoad(fmMatch[1]);
    if (parsed && typeof parsed === "object") meta = parsed as Record<string, unknown>;
  } catch {
    // YAML 파싱 실패 시 프론트매터 무시
  }
  return { meta, body: fmMatch[2] };
}

/** 배열 또는 쉼표 문자열 → 쉼표 구분 문자열 */
function normalizeTags(val: unknown): string {
  if (!val) return "";
  if (Array.isArray(val)) return val.join(",");
  return String(val);
}

/** 한글/영문 필드명 모두 지원 */
function pick(meta: Record<string, unknown>, ...keys: string[]): string {
  for (const k of keys) {
    if (meta[k] !== undefined && meta[k] !== null) return String(meta[k]).trim();
  }
  return "";
}

export async function POST(req: NextRequest) {
  if (!await authenticate(req)) {
    return NextResponse.json({ success: false, error: "API 키가 필요합니다. Authorization: Bearer <key>" }, { status: 401 });
  }

  try {
    const contentType = req.headers.get("content-type") ?? "";
    let rawMarkdown = "";

    if (contentType.includes("application/json")) {
      const json = await req.json();
      rawMarkdown = json.markdown ?? json.content ?? "";
    } else {
      // text/markdown, text/plain, multipart 등 → 텍스트 그대로
      rawMarkdown = await req.text();
    }

    if (!rawMarkdown.trim()) {
      return NextResponse.json({ success: false, error: "마크다운 내용이 비어 있습니다." }, { status: 400 });
    }

    const { meta, body: mdBody } = parseFrontmatter(rawMarkdown);

    // ── 필드 매핑 (한글/영문 모두 허용) ──────────────────
    const title    = pick(meta, "제목", "title");
    const category = pick(meta, "카테고리", "category");
    const thumbnail = pick(meta, "메인이미지", "thumbnail", "thumbnailUrl");
    const summary  = pick(meta, "요약문", "summary");
    const date     = pick(meta, "작성일", "date");
    const authorName = pick(meta, "기자", "author");
    const slug     = pick(meta, "slug");
    const sourceUrl = pick(meta, "sourceUrl", "원문");
    const rawStatus = pick(meta, "상태", "status");
    const scheduledPublishAt = pick(meta, "예약시간", "scheduledPublishAt");
    const tags     = normalizeTags(meta["테그"] ?? meta["tags"] ?? meta["태그"]);

    if (!title)    return NextResponse.json({ success: false, error: "프론트매터에 '제목' 또는 'title'이 필요합니다." }, { status: 400 });
    if (!category) return NextResponse.json({ success: false, error: "프론트매터에 '카테고리' 또는 'category'가 필요합니다." }, { status: 400 });

    const VALID_STATUSES = ["게시", "임시저장", "예약"] as const;
    const status = VALID_STATUSES.includes(rawStatus as typeof VALID_STATUSES[number])
      ? (rawStatus as typeof VALID_STATUSES[number])
      : "임시저장";

    if (status === "예약") {
      if (!scheduledPublishAt) {
        return NextResponse.json({ success: false, error: "status가 '예약'이면 '예약시간' 또는 scheduledPublishAt이 필요합니다." }, { status: 400 });
      }
      if (isNaN(Date.parse(scheduledPublishAt))) {
        return NextResponse.json({ success: false, error: "예약시간 형식이 올바르지 않습니다. (예: 2026-03-10T09:00:00)" }, { status: 400 });
      }
    }

    // 기자 이메일 자동 조회
    let authorEmail = pick(meta, "기자이메일", "authorEmail");
    if (authorName && !authorEmail) {
      authorEmail = await findReporterEmail(authorName);
    }

    // 마크다운 → HTML 변환
    const bodyHtml = await marked.parse(mdBody.trim(), { async: true });

    // 대표 이미지: 프론트매터에 없으면 본문 첫 이미지 추출
    let finalThumbnail = thumbnail;
    if (!finalThumbnail) {
      const imgMatch = bodyHtml.match(/<img[^>]+src="(https?:\/\/[^"]+)"[^>]*>/i);
      if (imgMatch?.[1]) finalThumbnail = imgMatch[1];
    }

    const article: Article = {
      id:              `api_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      title,
      category,
      date:            date || new Date().toISOString(),
      status,
      views:           0,
      body:            bodyHtml,
      thumbnail:       finalThumbnail,
      tags,
      author:          authorName,
      authorEmail,
      summary,
      slug,
      sourceUrl,
      scheduledPublishAt: status === "예약" ? scheduledPublishAt : undefined,
      updatedAt:       new Date().toISOString(),
    };

    await serverCreateArticle(article);

    // 생성 후 no(일련번호) 포함해 반환
    const saved = await serverGetArticleById(article.id);

    return NextResponse.json(
      {
        success: true,
        id:      article.id,
        no:      saved?.no ?? null,
        article: saved ?? article,
        // 파싱 결과 요약 (디버그용)
        parsed: { title, category, tags, status, author: authorName, authorEmail, thumbnail: finalThumbnail },
      },
      { status: 201 },
    );
  } catch (e) {
    console.error("[v1/articles/markdown] POST error:", e);
    return NextResponse.json({ success: false, error: "서버 오류" }, { status: 500 });
  }
}
