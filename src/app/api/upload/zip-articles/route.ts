/**
 * POST /api/upload/zip-articles
 * ZIP 파일을 업로드하면 안의 .md 파일을 모두 기사로 등록
 *
 * multipart/form-data:
 *   file     : ZIP 파일 (필수, 최대 50MB)
 *   category : 기본 카테고리 (선택, 기본 "뉴스")
 *   status   : 기본 상태 "임시저장" | "게시" (선택, 기본 "임시저장")
 *
 * Response:
 *   { success: true, total, succeeded, failed,
 *     results: [{ file, title, no, success, error? }] }
 */

import { NextRequest, NextResponse } from "next/server";
import { verifyAuthToken } from "@/lib/cookie-auth";
import { unzipSync, strFromU8 } from "fflate";
import { marked } from "marked";
import { serverCreateArticle } from "@/lib/db-server";
import { serverMigrateBodyImages, serverUploadImageUrl, serverUploadBuffer } from "@/lib/server-upload-image";
import { normalizeCategory } from "@/lib/constants";
import type { Article } from "@/types/article";

const MAX_ZIP_SIZE = 50 * 1024 * 1024; // 50 MB

// ── 프론트매터 파서 (서버) ─────────────────────────────────
function parseFrontmatter(content: string): { meta: Record<string, string>; body: string } {
  const match = content.match(/^---[ \t]*\r?\n([\s\S]*?)\r?\n---[ \t]*\r?\n?([\s\S]*)$/);
  if (!match) return { meta: {}, body: content.trim() };
  const meta: Record<string, string> = {};
  for (const line of match[1].split(/\r?\n/)) {
    const colonIdx = line.indexOf(":");
    if (colonIdx < 1) continue;
    const key = line.slice(0, colonIdx).trim();
    const val = line.slice(colonIdx + 1).trim().replace(/^["']|["']$/g, "");
    if (key) meta[key] = val;
  }
  return { meta, body: match[2].trim() };
}

// ── 다중 기사 분리 (서버) ────────────────────────────────
function splitMultiArticles(content: string): string[] {
  const normalized = content.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const regex = /(?:^|\n)---[ \t]*\n(?=[a-zA-Z가-힣_-]+[ \t]*:)/g;
  const starts: number[] = [];
  let m: RegExpExecArray | null;
  while ((m = regex.exec(normalized)) !== null) {
    starts.push(m.index === 0 ? 0 : m.index + 1);
  }
  if (starts.length <= 1) return [content];
  return starts.map((start, i) => {
    const end = i + 1 < starts.length ? starts[i + 1] : normalized.length;
    return normalized.slice(start, end).trim();
  });
}

// ── 메인 핸들러 ───────────────────────────────────────────
export async function POST(request: NextRequest) {
  // 관리자 인증 필수
  const cookie = request.cookies.get("cp-admin-auth");
  const auth = await verifyAuthToken(cookie?.value ?? "");
  if (!auth.valid) {
    return NextResponse.json({ success: false, error: "인증이 필요합니다." }, { status: 401 });
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ success: false, error: "multipart/form-data 파싱 실패" }, { status: 400 });
  }

  const file = formData.get("file") as File | null;
  if (!file) return NextResponse.json({ success: false, error: "file 필드가 필요합니다." }, { status: 400 });
  if (!file.name.toLowerCase().endsWith(".zip")) {
    return NextResponse.json({ success: false, error: "ZIP 파일(.zip)만 허용됩니다." }, { status: 400 });
  }
  if (file.size > MAX_ZIP_SIZE) {
    return NextResponse.json({ success: false, error: "ZIP 파일은 50MB 이하여야 합니다." }, { status: 400 });
  }

  const defaultCategory = (formData.get("category") as string | null) || "뉴스";
  const defaultStatus   = (formData.get("status")   as string | null) || "임시저장";

  // ZIP 압축 해제
  const buffer = await file.arrayBuffer();
  let unzipped: Record<string, Uint8Array>;
  try {
    unzipped = unzipSync(new Uint8Array(buffer));
  } catch (e) {
    console.error("[zip-articles] unzip error:", e);
    return NextResponse.json({ success: false, error: "ZIP 파일을 읽을 수 없습니다. 파일이 손상되었거나 형식이 올바르지 않습니다." }, { status: 400 });
  }

  // 파일 분류: .md + 이미지 (macOS 아티팩트 제외)
  const imgExts = [".png", ".jpg", ".jpeg", ".gif", ".webp"];
  const mdEntries: [string, Uint8Array][] = [];
  const zipImages = new Map<string, Uint8Array>();

  for (const [path, data] of Object.entries(unzipped)) {
    if (path.startsWith("__MACOSX") || path.includes("/.")) continue;
    if (path.includes("..") || path.startsWith("/")) continue;
    const lower = path.toLowerCase();
    if (lower.endsWith(".md") || lower.endsWith(".markdown")) {
      mdEntries.push([path, data]);
    } else if (imgExts.some((ext) => lower.endsWith(ext))) {
      zipImages.set(path, data);
      const filename = path.split("/").pop();
      if (filename && filename !== path) zipImages.set(filename, data);
    }
  }

  if (mdEntries.length === 0) {
    return NextResponse.json({ success: false, error: "ZIP 안에 .md 파일이 없습니다." }, { status: 400 });
  }

  const today = new Date().toISOString().slice(0, 10);
  const results: Array<{ file: string; title: string; no?: number; success: boolean; error?: string }> = [];

  for (const [zipPath, data] of mdEntries) {
    const filename = zipPath.split("/").pop() ?? zipPath;
    let content: string;
    try {
      content = strFromU8(data);
    } catch {
      results.push({ file: filename, title: filename, success: false, error: "파일 인코딩 오류 (UTF-8 필요)" });
      continue;
    }

    const articles = splitMultiArticles(content);

    for (let idx = 0; idx < articles.length; idx++) {
      const articleText = articles[idx];
      const isMulti = articles.length > 1;
      const label = isMulti ? `${filename} (${idx + 1}/${articles.length})` : filename;

      try {
        const { meta, body: mdBody } = parseFrontmatter(articleText);
        const rawHtml   = String(await marked.parse(mdBody, { async: false }));

        // ZIP 내 상대경로 이미지 → Supabase 업로드
        let bodyHtml = rawHtml;
        const relRegex = /<img[^>]+src="((?!https?:\/\/|data:|\/)[^"]+)"/gi;
        let rm: RegExpExecArray | null;
        const relPaths = new Set<string>();
        while ((rm = relRegex.exec(rawHtml)) !== null) relPaths.add(rm[1]);

        const relReplacements = new Map<string, string>();
        for (const relPath of relPaths) {
          const imgData = zipImages.get(relPath) || zipImages.get(relPath.split("/").pop() || "");
          if (!imgData) continue;
          const uploaded = await serverUploadBuffer(imgData, relPath.split("/").pop() || "image.png");
          if (uploaded) relReplacements.set(relPath, uploaded);
        }
        for (const [rel, abs] of relReplacements) {
          const escaped = rel.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
          bodyHtml = bodyHtml.replace(new RegExp(`src="${escaped}"`, "g"), `src="${abs}"`);
        }
        // 업로드 실패한 상대경로 이미지 태그 제거 (깨진 링크 방지)
        for (const relPath of relPaths) {
          if (!relReplacements.has(relPath)) {
            const escaped = relPath.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
            bodyHtml = bodyHtml.replace(new RegExp(`<img[^>]*src="${escaped}"[^>]*>`, "gi"), "");
          }
        }

        // 외부 URL 이미지 → Supabase 재업로드
        bodyHtml = await serverMigrateBodyImages(bodyHtml);

        // 썸네일: frontmatter → 본문 첫 이미지 → 업로드
        let thumbnail = meta.thumbnail || meta.image || "";
        // 상대경로 썸네일 → 이미 업로드한 URL로 교체
        if (thumbnail && relReplacements.has(thumbnail)) {
          thumbnail = relReplacements.get(thumbnail) || thumbnail;
        } else if (thumbnail && thumbnail.indexOf("http") !== 0) {
          // ZIP 이미지에서 직접 업로드
          const thumbData = zipImages.get(thumbnail) || zipImages.get(thumbnail.split("/").pop() || "");
          if (thumbData) {
            thumbnail = (await serverUploadBuffer(thumbData, thumbnail.split("/").pop() || "thumb.png")) ?? "";
          } else {
            thumbnail = "";
          }
        } else if (thumbnail && !thumbnail.includes("supabase") && !thumbnail.includes("culturepeople.co.kr")) {
          thumbnail = (await serverUploadImageUrl(thumbnail)) ?? thumbnail;
        }
        // 썸네일 없으면 본문 첫 번째 이미지 자동 추출 + 본문에서 제거 (중복 방지)
        if (!thumbnail) {
          const pImgMatch = bodyHtml.match(/<p>\s*<img[^>]+src="(https?:\/\/[^"]+)"[^>]*>\s*<\/p>/i);
          const imgMatch  = bodyHtml.match(/<img[^>]+src="(https?:\/\/[^"]+)"/i);
          if (pImgMatch) {
            thumbnail = pImgMatch[1];
            bodyHtml  = bodyHtml.replace(pImgMatch[0], "").trim();
          } else if (imgMatch) {
            thumbnail = imgMatch[1];
            bodyHtml  = bodyHtml.replace(imgMatch[0], "").trim();
          }
        }

        const fileTitle = filename.replace(/\.(md|markdown)$/i, "").replace(/[-_]/g, " ");
        const article: Article = {
          id: crypto.randomUUID(),
          title: meta.title || (isMulti ? `${fileTitle} (${idx + 1})` : fileTitle),
          category: normalizeCategory(meta.category || defaultCategory),
          status: (["게시", "임시저장", "예약", "상신"].includes(meta.status ?? "") ? meta.status : defaultStatus) as Article["status"],
          date: meta.date || today,
          views: 0,
          body: bodyHtml,
          thumbnail: thumbnail || undefined,
          tags: meta.tags || meta.tag || undefined,
          author: meta.author || meta.writer || undefined,
          summary: meta.summary || meta.description || undefined,
          slug: meta.slug || undefined,
          sourceUrl: meta.sourceUrl || meta.source_url || undefined,
          scheduledPublishAt: meta.status === "예약" && meta.scheduledPublishAt ? meta.scheduledPublishAt : undefined,
        };

        await serverCreateArticle(article);
        results.push({ file: label, title: article.title, success: true });
      } catch (e) {
        console.error(`[zip-articles] article create fail (${label}):`, e);
        results.push({ file: label, title: "?", success: false, error: "기사 등록에 실패했습니다." });
      }
    }
  }

  const succeeded = results.filter(r => r.success).length;
  const failed    = results.filter(r => !r.success).length;

  return NextResponse.json({
    success: true,
    total: results.length,
    succeeded,
    failed,
    results,
  });
}
