/**
 * 메일 보도자료 기사 등록 API
 * POST /api/mail/register
 *
 * 단일 또는 일괄 등록 지원
 * - mode: "draft" (임시저장) | "ai" (AI편집 후 게시)
 */
import { NextRequest, NextResponse } from "next/server";
import { verifyAuthToken, timingSafeEqual } from "@/lib/cookie-auth";
import { serverCreateArticle } from "@/lib/db-server";
import { serverMigrateBodyImages, serverUploadImageUrl } from "@/lib/server-upload-image";
import { resolveAiApiKey, serverGetAiSettings } from "@/lib/ai-settings-server";
import { DEFAULT_GEMINI_TEXT_MODEL } from "@/lib/ai-model-options";
import type { Article } from "@/types/article";

// 인증
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

// ── AI 편집 (공유 모듈 사용) ──
import { aiEditArticle, VALID_CATEGORIES, AI_EDIT_PROMPT, callGemini, callOpenAI, extractAiJson, type AiEditResult as AiResult } from "@/lib/ai-prompt";

interface RegisterItem {
  subject: string;
  bodyHtml: string;
  bodyText: string;
  images: string[]; // Supabase URLs
  attachmentContents: string[]; // 첨부파일 변환 결과 (HTML)
  from: string;
}

async function registerArticle(
  item: RegisterItem,
  mode: "draft" | "ai",
  category: string,
  author: string,
): Promise<{ success: boolean; articleId?: string; title?: string; error?: string }> {
  try {
    // 본문 조합: 메일 본문 + 첨부파일 변환 내용
    let combinedHtml = item.bodyHtml || "";
    for (const content of item.attachmentContents) {
      if (content) combinedHtml += "\n" + content;
    }

    // 첨부 이미지를 본문에 삽입
    for (const imgUrl of item.images) {
      combinedHtml += `\n<figure style="margin:1.5em 0;text-align:center;"><img src="${imgUrl}" alt="" style="max-width:100%;height:auto;border-radius:6px;" /></figure>`;
    }

    let finalTitle = item.subject;
    let finalBody = combinedHtml;
    let finalSummary = "";
    let finalTags = "";
    let finalCategory = category;
    let aiGenerated = false;

    if (mode === "ai") {
      // AI 편집
      const aiSettings = await serverGetAiSettings();
      const provider = aiSettings.aiProvider ?? "gemini";
      const model = aiSettings.aiModel ?? DEFAULT_GEMINI_TEXT_MODEL;
      const apiKey = resolveAiApiKey(aiSettings, provider);

      if (apiKey) {
        try {
          const edited = await aiEditArticle(provider, model, apiKey, item.subject, (item.bodyText || "").slice(0, 3000), combinedHtml);
          if (edited) {
            finalTitle = edited.title;
            finalBody = edited.body;
            finalSummary = edited.summary;
            finalTags = edited.tags;
            if (edited.category && VALID_CATEGORIES.includes(edited.category)) {
              finalCategory = edited.category;
            }
            aiGenerated = true;

            // AI 결과에 이미지가 없으면 첨부 이미지 삽입
            if (!/<img[^>]+src=/i.test(finalBody) && item.images.length > 0) {
              const imgHtml = `<figure style="margin:1.5em 0;text-align:center;"><img src="${item.images[0]}" alt="${finalTitle.replace(/"/g, "&quot;")}" style="max-width:100%;height:auto;border-radius:6px;" /></figure>`;
              let pCount = 0;
              let insertIdx = -1;
              let pos = 0;
              while (pos < finalBody.length) {
                const found = finalBody.indexOf("</p>", pos);
                if (found === -1) break;
                pCount++;
                if (pCount === 2) { insertIdx = found + 4; break; }
                pos = found + 4;
              }
              finalBody = insertIdx === -1
                ? finalBody + imgHtml
                : finalBody.slice(0, insertIdx) + imgHtml + finalBody.slice(insertIdx);
            }
          }
        } catch (e) {
          console.error("[mail/register] AI 편집 실패:", e instanceof Error ? e.message : e);
          // AI 실패 시 원문 사용
        }
      }
    }

    // 본문 외부 이미지 Supabase 이관
    finalBody = await serverMigrateBodyImages(finalBody);

    // 대표이미지: 첨부 이미지 또는 본문 첫 이미지
    let thumbnail = "";
    if (item.images.length > 0) {
      thumbnail = item.images[0];
    } else {
      const firstImgMatch = finalBody.match(/<(?:figure[^>]*>)?\s*<img[^>]+src=["']([^"']+)["'][^>]*>\s*(?:<\/figure>)?/i);
      if (firstImgMatch?.[1]) {
        thumbnail = firstImgMatch[1];
        finalBody = finalBody.replace(firstImgMatch[0], "").trim();
      }
    }

    // 썸네일이 외부 URL이면 Supabase 업로드
    if (thumbnail && !thumbnail.includes("supabase")) {
      const uploaded = await serverUploadImageUrl(thumbnail);
      if (uploaded) thumbnail = uploaded;
    }

    const articleId = crypto.randomUUID();
    const today = new Date().toISOString().slice(0, 10);

    const article: Article = {
      id: articleId,
      title: finalTitle,
      category: finalCategory,
      date: today,
      status: mode === "ai" ? "게시" : "임시저장",
      views: 0,
      body: finalBody,
      thumbnail: thumbnail || undefined,
      tags: finalTags || undefined,
      author: author || undefined,
      summary: finalSummary || undefined,
      updatedAt: new Date().toISOString(),
      aiGenerated,
    };

    await serverCreateArticle(article);
    return { success: true, articleId, title: finalTitle };
  } catch (e) {
    console.error("[mail/register] error:", e);
    return { success: false, error: "기사 등록에 실패했습니다." };
  }
}

export async function POST(req: NextRequest) {
  if (!await authenticate(req)) {
    return NextResponse.json({ success: false, error: "인증이 필요합니다." }, { status: 401 });
  }

  try {
    const body = await req.json();
    const { items, mode = "draft", category = "보도자료", author = "" } = body as {
      items: RegisterItem[];
      mode: "draft" | "ai";
      category: string;
      author: string;
    };

    if (!items || !Array.isArray(items) || items.length === 0) {
      return NextResponse.json({ success: false, error: "등록할 메일이 없습니다." }, { status: 400 });
    }

    // 3개씩 병렬 처리
    const results: { success: boolean; articleId?: string; title?: string; error?: string }[] = [];
    for (let i = 0; i < items.length; i += 3) {
      const batch = items.slice(i, i + 3);
      const batchResults = await Promise.all(
        batch.map((item) => registerArticle(item, mode, category, author)),
      );
      results.push(...batchResults);

      // rate limit
      if (i + 3 < items.length) {
        await new Promise((r) => setTimeout(r, 500));
      }
    }

    return NextResponse.json({
      success: true,
      results,
      published: results.filter((r) => r.success).length,
      failed: results.filter((r) => !r.success).length,
    });
  } catch (e) {
    console.error("[mail/register] handler error:", e);
    return NextResponse.json({
      success: false,
      error: "기사 등록 중 오류가 발생했습니다.",
    }, { status: 500 });
  }
}

export const maxDuration = 60;
