/**
 * 외부 기사 API v1 — 마크다운 파일 업로드
 * POST /api/v1/articles/markdown
 *
 * 전송 방식 (3가지 모두 지원):
 *   1) Content-Type: text/markdown   → raw 마크다운 텍스트
 *   2) Content-Type: application/json → { markdown: "..." } or { content: "..." }
 *   3) Content-Type: multipart/form-data → 파일 필드명: "file" 또는 "markdown"
 *
 * YAML 프론트매터 지원 필드:
 *   제목 / title            → article.title   (필수)
 *   카테고리 / category     → article.category (필수)
 *   메인이미지 / thumbnail  → article.thumbnail (없으면 본문 첫 이미지 자동 추출)
 *   테그 / tags             → article.tags (배열 또는 쉼표 문자열)
 *   요약문 / summary        → article.summary
 *   작성일 / date           → article.date
 *   기자 / author           → article.author (등록된 기자면 이메일 자동 조회)
 *   상태 / status           → 게시|임시저장|예약 (기본: 임시저장)
 *   예약시간 / scheduledPublishAt → ISO 8601 (status=예약이면 필수)
 *   slug                    → article.slug
 *   sourceUrl / 원문        → article.sourceUrl
 *
 * 처리 과정:
 *   1) 마크다운 → HTML 변환
 *   2) 본문 외부 이미지 Supabase Storage 자동 업로드 (URL 교체)
 *   3) 대표 이미지가 본문 첫 이미지와 같으면 본문에서 제거 (중복 방지)
 *   4) 대표 이미지도 Supabase Storage 업로드
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
import { serverMigrateBodyImages, serverUploadImageUrl, isOwnUrl } from "@/lib/server-upload-image";

// ── 인증 ──────────────────────────────────────────────────
async function authenticate(req: NextRequest): Promise<boolean> {
  if (await verifyApiKey(req.headers.get("authorization"))) return true;
  const cookie = req.cookies.get("cp-admin-auth");
  const result = await verifyAuthToken(cookie?.value ?? "");
  return result.valid;
}

async function findReporterEmail(name: string): Promise<string> {
  try {
    const reporters = await serverGetSetting<{ name: string; email: string; active?: boolean }[]>("cp-admin-accounts", []);
    const match = reporters.find((r) => r.name === name && r.active !== false);
    return match?.email ?? "";
  } catch {
    return "";
  }
}

// 이미지 업로드는 공유 유틸리티 사용 (server-upload-image.ts)
// → 워터마크 자동 적용, og:image 추출, weserv.nl 프록시 폴백, SSRF 방어 포함

// ── 프론트매터 파싱 ───────────────────────────────────────
function parseFrontmatter(raw: string): { meta: Record<string, unknown>; body: string } {
  // BOM 제거 (Windows 파일에 흔히 포함)
  const cleaned = raw.replace(/^\uFEFF/, "");
  const fmMatch = cleaned.match(/^---[ \t]*\r?\n([\s\S]*?)\r?\n---[ \t]*\r?\n?([\s\S]*)$/);
  if (!fmMatch) return { meta: {}, body: cleaned };

  let meta: Record<string, unknown> = {};
  try {
    const parsed = yamlLoad(fmMatch[1]);
    if (parsed && typeof parsed === "object") meta = parsed as Record<string, unknown>;
  } catch {
    return { meta: {}, body: cleaned };
  }
  return { meta, body: fmMatch[2] };
}

function normalizeTags(val: unknown): string {
  if (!val) return "";
  if (Array.isArray(val)) return val.map(String).join(",");
  return String(val);
}

function pick(meta: Record<string, unknown>, ...keys: string[]): string {
  for (const k of keys) {
    const v = meta[k];
    if (v !== undefined && v !== null && String(v).trim() !== "") return String(v).trim();
  }
  return "";
}

async function extractMarkdown(req: NextRequest): Promise<string> {
  const ct = (req.headers.get("content-type") ?? "").toLowerCase();
  if (ct.includes("application/json")) {
    const json = await req.json();
    return (json.markdown ?? json.content ?? "") as string;
  }
  if (ct.includes("multipart/form-data")) {
    const formData = await req.formData();
    const f = formData.get("file") ?? formData.get("markdown") ?? formData.get("content");
    if (f instanceof File) return await f.text();
    if (typeof f === "string") return f;
    return "";
  }
  return await req.text();
}

// ── 메인 핸들러 ───────────────────────────────────────────
export async function POST(req: NextRequest) {
  if (!await authenticate(req)) {
    return NextResponse.json({ success: false, error: "API 키가 필요합니다. Authorization: Bearer <key>" }, { status: 401 });
  }

  try {
    const rawMarkdown = await extractMarkdown(req);
    if (!rawMarkdown.trim()) {
      return NextResponse.json({ success: false, error: "마크다운 내용이 비어 있습니다." }, { status: 400 });
    }

    const { meta, body: mdBody } = parseFrontmatter(rawMarkdown);

    const title              = pick(meta, "제목", "title");
    const category           = pick(meta, "카테고리", "category");
    const fmThumbnail        = pick(meta, "메인이미지", "thumbnail", "thumbnailUrl");
    const summary            = pick(meta, "요약문", "summary");
    const date               = pick(meta, "작성일", "date");
    const authorName         = pick(meta, "기자", "author");
    const slug               = pick(meta, "slug");
    const sourceUrl          = pick(meta, "sourceUrl", "원문");
    const rawStatus          = pick(meta, "상태", "status");
    const scheduledPublishAt = pick(meta, "예약시간", "scheduledPublishAt");
    const tags               = normalizeTags(meta["테그"] ?? meta["tags"] ?? meta["태그"]);

    if (!title) {
      return NextResponse.json({
        success: false,
        error: "프론트매터에 '제목' 또는 'title'이 필요합니다.",
        debug: { parsedKeys: Object.keys(meta), rawLength: rawMarkdown.length, hasBOM: rawMarkdown.charCodeAt(0) === 0xFEFF },
      }, { status: 400 });
    }
    if (!category) {
      return NextResponse.json({
        success: false,
        error: "프론트매터에 '카테고리' 또는 'category'가 필요합니다.",
        debug: { parsedKeys: Object.keys(meta), title },
      }, { status: 400 });
    }

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

    let authorEmail = pick(meta, "기자이메일", "authorEmail");
    if (authorName && !authorEmail) {
      authorEmail = await findReporterEmail(authorName);
    }

    // ── 1) 마크다운 → HTML 변환 ──────────────────────────
    let bodyHtml = marked.parse(mdBody.trim()) as string;

    // ── 2) 본문 외부 이미지 Supabase Storage 업로드 (공유 유틸: 워터마크+og:image+프록시)
    const bodyBefore = bodyHtml;
    bodyHtml = await serverMigrateBodyImages(bodyHtml);

    // 업로드 통계 집계 (간이: 변경된 img src 수로 추정)
    const countExternalImgs = (h: string) => [...h.matchAll(/<img[^>]+src="(https?:\/\/[^"]+)"/gi)].filter(m => !isOwnUrl(m[1])).length;
    const imgBefore = countExternalImgs(bodyBefore);
    const imgAfter = countExternalImgs(bodyHtml);
    const imgUploaded = imgBefore - imgAfter;
    const imgFailed = imgAfter; // 남아있는 외부 이미지 (serverMigrateBodyImages가 실패한 이미지는 제거하므로 사실상 0)

    // ── 3) 대표 이미지 결정 ───────────────────────────────
    let finalThumbnail: string | undefined;
    if (fmThumbnail) {
      // 외부 URL이면 Supabase에 업로드 (og:image 추출 + 워터마크 포함)
      if (!isOwnUrl(fmThumbnail)) {
        finalThumbnail = (await serverUploadImageUrl(fmThumbnail)) ?? fmThumbnail;
      } else {
        finalThumbnail = fmThumbnail;
      }
    } else {
      // 본문 첫 <img>에서 자동 추출 후 본문에서 제거 (중복 방지)
      const pImgMatch = bodyHtml.match(/<p>\s*<img[^>]+src="(https?:\/\/[^"]+)"[^>]*>\s*<\/p>/i);
      const imgMatch  = bodyHtml.match(/<img[^>]+src="(https?:\/\/[^"]+)"/i);
      if (pImgMatch) {
        finalThumbnail = pImgMatch[1];
        bodyHtml = bodyHtml.replace(pImgMatch[0], "").trim();
      } else if (imgMatch) {
        finalThumbnail = imgMatch[1];
        bodyHtml = bodyHtml.replace(imgMatch[0], "").trim();
      }
    }

    // ── 4) frontmatter 썸네일과 본문 첫 이미지 중복 제거 ─
    if (fmThumbnail && finalThumbnail) {
      const pImgMatch = bodyHtml.match(/<p>\s*<img[^>]+src="(https?:\/\/[^"]+)"[^>]*>\s*<\/p>/i);
      if (pImgMatch) {
        const firstImgUrl = pImgMatch[1];
        // 썸네일과 동일한 URL이면 본문에서 제거 (원본 URL 또는 업로드된 URL)
        if (firstImgUrl === finalThumbnail || firstImgUrl === fmThumbnail) {
          bodyHtml = bodyHtml.replace(pImgMatch[0], "").trim();
        }
      }
    }

    // ── 5) 기사 생성 ─────────────────────────────────────
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

    // 생성 후 no(일련번호 — 순수 숫자) 포함해 반환
    const saved = await serverGetArticleById(article.id);
    const no = (saved?.no != null && saved.no > 0) ? Number(saved.no) : null;

    return NextResponse.json(
      {
        success: true,
        id:      article.id,
        no,                         // 순수 숫자 일련번호
        article: saved ?? article,
        parsed:  {
          title, category, tags, status,
          author: authorName, authorEmail,
          thumbnail: finalThumbnail,
          imagesUploaded: imgUploaded,   // Supabase에 업로드 성공
          imagesFailed: imgFailed,       // 원본 URL 유지 (hotlink 차단 등)
        },
      },
      { status: 201 },
    );
  } catch (e) {
    console.error("[v1/articles/markdown] POST error:", e);
    return NextResponse.json({
      success: false,
      error: "서버 오류",
      detail: e instanceof Error ? e.message : String(e),
    }, { status: 500 });
  }
}
