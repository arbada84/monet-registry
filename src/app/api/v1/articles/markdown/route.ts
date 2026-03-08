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

// ── 환경변수 ───────────────────────────────────────────────
const SUPABASE_URL  = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const SERVICE_KEY   = process.env.SUPABASE_SERVICE_KEY ?? "";
const BUCKET        = "images";
const IMG_ALLOWED   = ["image/jpeg", "image/png", "image/gif", "image/webp"];
const IMG_EXT: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/gif": "gif", "image/webp": "webp" };
const IMG_MAX_SIZE  = 5 * 1024 * 1024; // 5MB

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

// ── 이미지 업로드 유틸 ────────────────────────────────────
function isOwnUrl(url: string): boolean {
  // Supabase Storage에 이미 업로드된 URL만 자체 URL로 간주 → 재업로드 스킵
  // culturepeople.co.kr 전체를 자체로 보면 files.culturepeople.co.kr (구 Cafe24, 현재 폐쇄)도
  // 재업로드가 스킵되어 깨진 링크가 그대로 남는 문제가 발생함
  return Boolean(SUPABASE_URL) && url.includes(SUPABASE_URL);
}

function isSafeUrl(url: string): boolean {
  try {
    const p = new URL(url);
    if (p.protocol !== "https:" && p.protocol !== "http:") return false;
    const h = p.hostname.toLowerCase();
    if (h === "localhost" || h === "127.0.0.1") return false;
    const ipv4 = h.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
    if (ipv4) {
      const [, a, b] = ipv4.map(Number);
      if (a === 10 || a === 127 || a === 0) return false;
      if (a === 172 && b >= 16 && b <= 31) return false;
      if (a === 192 && b === 168) return false;
    }
    return true;
  } catch { return false; }
}

/** 외부 이미지 URL → Supabase Storage 업로드 후 새 URL 반환. 실패 시 원본 반환 */
async function uploadImageUrl(url: string): Promise<string> {
  if (!SUPABASE_URL || !SERVICE_KEY) return url;
  if (isOwnUrl(url) || !isSafeUrl(url)) return url;

  try {
    const imgResp = await fetch(url, {
      headers: {
        // 실제 브라우저 UA 사용 — Bot UA는 한국 보도자료 사이트 hotlink 보호에 차단됨
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        "Referer": new URL(url).origin + "/",
        "Accept": "image/webp,image/apng,image/*,*/*;q=0.8",
        "Accept-Language": "ko-KR,ko;q=0.9,en-US;q=0.8",
      },
      signal: AbortSignal.timeout(15000),
    });
    if (!imgResp.ok) return url;

    const buffer = await imgResp.arrayBuffer();
    if (buffer.byteLength === 0 || buffer.byteLength > IMG_MAX_SIZE) return url;

    let mimeType = imgResp.headers.get("content-type")?.split(";")[0].trim().toLowerCase() ?? "";
    if (!IMG_ALLOWED.includes(mimeType)) {
      const lower = url.toLowerCase();
      if (lower.includes(".png")) mimeType = "image/png";
      else if (lower.includes(".gif")) mimeType = "image/gif";
      else if (lower.includes(".webp")) mimeType = "image/webp";
      else mimeType = "image/jpeg";
    }
    const ext = IMG_EXT[mimeType] ?? "jpg";

    const now = new Date();
    const path = `${now.getFullYear()}/${String(now.getMonth() + 1).padStart(2, "0")}/${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`;

    const uploadRes = await fetch(`${SUPABASE_URL}/storage/v1/object/${BUCKET}/${path}`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${SERVICE_KEY}`,
        "apikey": SERVICE_KEY,
        "Content-Type": mimeType,
        "x-upsert": "true",
      },
      body: buffer,
      signal: AbortSignal.timeout(25000),
    });
    if (!uploadRes.ok) return url;

    return `${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${path}`;
  } catch {
    return url; // 업로드 실패 시 원본 URL 유지
  }
}

/** bodyHtml의 모든 외부 이미지 src를 Supabase에 업로드하고 URL 교체 (5개씩 병렬) */
async function reuploadBodyImages(html: string): Promise<{ html: string; urlMap: Map<string, string>; uploaded: number; failed: number }> {
  const urlMap = new Map<string, string>();
  const seen = new Set<string>();

  // 모든 외부 img src 수집
  for (const m of html.matchAll(/<img[^>]+src="(https?:\/\/[^"]+)"[^>]*>/gi)) {
    if (!isOwnUrl(m[1]) && isSafeUrl(m[1])) seen.add(m[1]);
  }

  const urls = [...seen];
  // 5개씩 병렬 업로드
  for (let i = 0; i < urls.length; i += 5) {
    const chunk = urls.slice(i, i + 5);
    await Promise.all(chunk.map(async (url) => {
      const newUrl = await uploadImageUrl(url);
      urlMap.set(url, newUrl);
    }));
  }

  // HTML 내 URL 교체
  const result = html.replace(/<img([^>]+)src="(https?:\/\/[^"]+)"([^>]*)>/gi, (full, pre, url, post) =>
    `<img${pre}src="${urlMap.get(url) ?? url}"${post}>`
  );

  // 업로드 성공/실패 집계
  let uploaded = 0, failed = 0;
  for (const [orig, replaced] of urlMap) {
    if (orig !== replaced) uploaded++;
    else failed++;
  }

  return { html: result, urlMap, uploaded, failed };
}

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

    // ── 2) 본문 외부 이미지 Supabase Storage 업로드 ──────
    const { html: uploadedBodyHtml, urlMap, uploaded: imgUploaded, failed: imgFailed } = await reuploadBodyImages(bodyHtml);
    bodyHtml = uploadedBodyHtml;

    // ── 3) 대표 이미지 결정 ───────────────────────────────
    // frontmatter 이미지가 있으면 우선 사용 (업로드된 URL로 교체), 없으면 본문 첫 이미지 자동 추출
    let finalThumbnail: string | undefined;
    if (fmThumbnail) {
      // urlMap에 있으면 업로드된 URL 사용 (본문에도 같은 이미지가 있었을 경우)
      finalThumbnail = urlMap.get(fmThumbnail) ?? fmThumbnail;
      // 본문에 없어서 urlMap에 없는 경우 → 직접 업로드
      if (finalThumbnail === fmThumbnail && !isOwnUrl(fmThumbnail)) {
        finalThumbnail = await uploadImageUrl(fmThumbnail);
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
    // fmThumbnail이 있을 때: 본문 첫 <p><img>가 같은 URL이면 제거
    if (fmThumbnail && finalThumbnail) {
      const pImgMatch = bodyHtml.match(/<p>\s*<img[^>]+src="(https?:\/\/[^"]+)"[^>]*>\s*<\/p>/i);
      if (pImgMatch) {
        const firstImgUrl = pImgMatch[1];
        const origFmUrl = fmThumbnail;
        const shouldRemove =
          firstImgUrl === finalThumbnail ||
          firstImgUrl === origFmUrl ||
          urlMap.get(origFmUrl) === firstImgUrl;
        if (shouldRemove) bodyHtml = bodyHtml.replace(pImgMatch[0], "").trim();
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
