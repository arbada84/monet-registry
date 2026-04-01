#!/usr/bin/env node
/**
 * 기사 대량 AI 재편집 스크립트
 *
 * - Supabase에서 기사를 가져와 Gemini로 재편집
 * - 일정 패턴 금지: 매번 다른 문체/구성/어조 사용
 * - 단락 간 공백: 마침표 후 새 단락 → 빈 줄 삽입
 * - 이미지 태그 반드시 보존
 *
 * Usage: node scripts/batch-reedit.mjs [--limit 50] [--offset 0] [--dry-run]
 */

import { readFileSync } from "fs";

let env = {};
try {
  const raw = readFileSync(".env.production.local", "utf-8");
  for (const line of raw.split("\n")) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)="?([^"]*)"?$/);
    if (m) env[m[1]] = m[2];
  }
} catch {}

const SUPABASE_URL = env.NEXT_PUBLIC_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_KEY;
let GEMINI_KEY = env.GEMINI_API_KEY || process.env.GEMINI_API_KEY;

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error("환경변수 누락: SUPABASE_URL, SERVICE_KEY");
  process.exit(1);
}

// Gemini API 키가 환경변수에 없으면 DB에서 가져오기
if (!GEMINI_KEY) {
  const resp = await fetch(`${SUPABASE_URL}/rest/v1/site_settings?key=eq.cp-ai-settings&select=value`, {
    headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` },
  });
  const rows = await resp.json();
  GEMINI_KEY = rows?.[0]?.value?.geminiApiKey;
  if (!GEMINI_KEY) {
    console.error("GEMINI_API_KEY를 찾을 수 없습니다 (환경변수/DB 모두 없음)");
    process.exit(1);
  }
  console.log("Gemini API 키: DB에서 로드 완료");
}

const args = process.argv.slice(2);
const DRY_RUN = args.includes("--dry-run");
const LIMIT = parseInt(args.find((_, i) => args[i - 1] === "--limit") || "50");
const OFFSET = parseInt(args.find((_, i) => args[i - 1] === "--offset") || "0");

// ── 다양한 문체 프롬프트 ──────────────────────────────────────
// 매 기사마다 랜덤하게 하나를 선택하여 패턴 반복 방지
const STYLE_VARIANTS = [
  "간결하고 명쾌한 보도체로 작성하세요. 핵심 사실을 먼저 전달하고 배경을 덧붙이세요.",
  "내러티브 스타일로 독자의 관심을 끌어보세요. 현장감 있는 묘사와 인용을 활용하세요.",
  "분석적 톤으로 작성하세요. '왜 중요한가'를 중심으로 맥락과 의미를 풀어주세요.",
  "부드러운 매거진체로 작성하세요. 문화·예술의 감성을 살리면서도 정확한 정보를 전달하세요.",
  "질문으로 시작하거나 흥미로운 사실로 서두를 여세요. 독자의 호기심을 자극하는 리드를 써주세요.",
  "역피라미드 형식으로 작성하세요. 가장 중요한 정보를 맨 앞에 놓고 점차 세부사항으로 확장하세요.",
  "스토리텔링 기법을 활용하세요. 사건의 배경→전개→결과 순서로 자연스럽게 이야기를 풀어주세요.",
  "핵심 키워드 중심의 간결체로 작성하세요. 짧은 문장을 주로 사용하고 불필요한 수식어를 줄이세요.",
];

// 문단 수도 랜덤하게 변화
const PARAGRAPH_VARIANTS = [
  "3-4개 문단으로 구성하세요.",
  "4-5개 문단으로 구성하세요.",
  "5-6개 문단으로 구성하세요.",
  "4-6개 문단으로 구성하되, 한 문단은 1-2문장, 다른 문단은 3-4문장으로 길이를 다양하게 하세요.",
  "3-5개 문단으로 구성하세요. 서두와 마무리는 짧게, 중간 문단은 상세하게 하세요.",
];

function getRandomPrompt() {
  const style = STYLE_VARIANTS[Math.floor(Math.random() * STYLE_VARIANTS.length)];
  const para = PARAGRAPH_VARIANTS[Math.floor(Math.random() * PARAGRAPH_VARIANTS.length)];

  return `당신은 컬처피플 뉴스 편집 AI입니다. 아래 기사를 독자 친화적으로 재편집하세요.

문체 지시: ${style}
문단 지시: ${para}

규칙:
1. 제목은 원문 의미를 살리되 60자 이내, 핵심을 담아 간결하게 (매번 다른 표현 방식 사용)
2. 본문은 HTML (<p> 태그)로 작성. 단락과 단락 사이는 반드시 분리
3. 원문 사실만 작성 (창작/추측 금지), 객관적 어조 유지
4. 광고, 관련 기사 링크, 기자 정보, SNS 버튼, 타 언론사 이름, 바이라인 등 제거
5. 원문의 <img> 태그는 반드시 모두 포함하세요 (이미지 삭제 절대 금지)
6. 요약은 기사 핵심을 2문장으로 (80자 이내)
7. 태그는 핵심 키워드 3-5개, 쉼표 구분
8. category는 기사 내용을 분석하여 아래 6개 중 하나:
   "엔터" / "스포츠" / "라이프" / "테크·모빌리티" / "비즈" / "공공"

중요 금지사항:
- "~에 대해 알아보겠습니다", "~를 살펴보겠습니다" 같은 상투적 표현 금지
- 모든 기사가 같은 패턴으로 시작하거나 끝나지 않도록 주의
- 기사마다 서두, 전개, 마무리 방식을 다르게 하세요

반드시 아래 JSON 형식으로만 응답하세요 (마크다운 코드블록 없이):
{"title":"...","summary":"...","body":"<p>...</p><p>...</p>","tags":"태그1,태그2","category":"카테고리명"}`;
}

// ── Supabase REST API ─────────────────────────────────────────
async function supabaseFetch(path, options = {}) {
  const url = `${SUPABASE_URL}/rest/v1/${path}`;
  const resp = await fetch(url, {
    ...options,
    headers: {
      "apikey": SERVICE_KEY,
      "Authorization": `Bearer ${SERVICE_KEY}`,
      "Content-Type": "application/json",
      "Prefer": options.method === "PATCH" ? "return=minimal" : "return=representation",
      ...options.headers,
    },
  });
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Supabase ${resp.status}: ${text}`);
  }
  if (options.method === "PATCH") return null;
  return resp.json();
}

// ── Gemini API ────────────────────────────────────────────────
async function callGemini(prompt, content) {
  const resp = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": GEMINI_KEY },
      body: JSON.stringify({
        contents: [{ parts: [{ text: `${prompt}\n\n---\n\n${content}` }] }],
        generationConfig: { temperature: 0.7, maxOutputTokens: 3000 },
      }),
      signal: AbortSignal.timeout(60000),
    }
  );
  if (!resp.ok) throw new Error(`Gemini ${resp.status}`);
  const data = await resp.json();
  return data.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
}

function extractJson(raw) {
  let text = raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1) return null;
  text = text.slice(start, end + 1);
  try {
    const obj = JSON.parse(text);
    if (!obj.title || !obj.body) return null;
    return obj;
  } catch { return null; }
}

// ── 단락 간격 정규화 ─────────────────────────────────────────
function normalizeParagraphs(html) {
  // </p><p> 사이에 줄바꿈 보장
  let result = html
    .replace(/<\/p>\s*<p>/gi, "</p>\n\n<p>")  // 단락 간 빈 줄
    .replace(/(<br\s*\/?>[\s\n]*){3,}/gi, "<br><br>")  // 3개 이상 br → 2개
    .replace(/<p>\s*<\/p>/gi, "")  // 빈 p 태그 제거
    .replace(/<strong>\s*<\/strong>/gi, "")  // 빈 strong 제거
    .trim();
  return result;
}

// ── 메인 실행 ─────────────────────────────────────────────────
async function main() {
  console.log(`=== 기사 대량 AI 재편집 ===`);
  console.log(`LIMIT=${LIMIT}, OFFSET=${OFFSET}, DRY_RUN=${DRY_RUN}\n`);

  // 기사 가져오기 (날짜순, 오래된 것부터)
  const articles = await supabaseFetch(
    `articles?select=id,title,body,summary,tags,category,no&order=no.asc&offset=${OFFSET}&limit=${LIMIT}`
  );

  console.log(`가져온 기사: ${articles.length}건\n`);

  let success = 0, fail = 0, skip = 0;

  for (let i = 0; i < articles.length; i++) {
    const art = articles[i];
    const progress = `[${i + 1}/${articles.length}]`;

    // 이미지 태그 추출 (보존용)
    const imgTags = art.body.match(/<img[^>]+>/gi) ?? [];

    // HTML에서 텍스트만 추출
    const plainText = art.body
      .replace(/<img[^>]*>/gi, "[IMG]")
      .replace(/<[^>]*>/g, " ")
      .replace(/\s+/g, " ")
      .trim();

    // 너무 짧은 기사는 스킵
    if (plainText.length < 50) {
      console.log(`${progress} #${art.no} SKIP (본문 ${plainText.length}자)`);
      skip++;
      continue;
    }

    console.log(`${progress} #${art.no} "${art.title.substring(0, 40)}..." 편집 중...`);

    try {
      // 랜덤 프롬프트 선택 (패턴 반복 방지)
      const prompt = getRandomPrompt();

      const content = `기존 제목: ${art.title}\n\n기존 본문:\n${plainText}\n\n이미지 태그 (반드시 포함):\n${imgTags.join("\n")}`;

      const raw = await callGemini(prompt, content);
      const result = extractJson(raw);

      if (!result) {
        console.log(`  ❌ JSON 파싱 실패`);
        fail++;
        continue;
      }

      // 이미지 태그가 결과에 포함되었는지 확인
      let finalBody = result.body;
      for (const img of imgTags) {
        // src 속성으로 비교
        const srcMatch = img.match(/src="([^"]+)"/);
        if (srcMatch && !finalBody.includes(srcMatch[1])) {
          // 누락된 이미지 → 첫 번째 <p> 뒤에 삽입
          finalBody = finalBody.replace(/<\/p>/, `</p>\n\n<figure>${img}</figure>\n\n`);
        }
      }

      // 단락 간격 정규화
      finalBody = normalizeParagraphs(finalBody);

      if (DRY_RUN) {
        console.log(`  ✅ [DRY] "${result.title.substring(0, 50)}"`);
        console.log(`     카테고리: ${result.category}, 태그: ${result.tags}`);
        console.log(`     본문 길이: ${finalBody.length}자, 이미지: ${imgTags.length}개`);
      } else {
        // DB 업데이트
        await supabaseFetch(`articles?id=eq.${art.id}`, {
          method: "PATCH",
          body: JSON.stringify({
            title: result.title,
            summary: result.summary || art.summary,
            body: finalBody,
            tags: result.tags ? result.tags.split(",").map(t => t.trim()) : art.tags,
            category: result.category || art.category,
          }),
        });
        console.log(`  ✅ "${result.title.substring(0, 50)}"`);
      }
      success++;

      // API 속도 제한 (Gemini 무료 15RPM)
      if (i < articles.length - 1) {
        await new Promise(r => setTimeout(r, 4500));
      }

    } catch (e) {
      console.log(`  ❌ 오류: ${e.message?.substring(0, 80)}`);
      fail++;
      // 에러 시 더 오래 대기
      await new Promise(r => setTimeout(r, 10000));
    }
  }

  console.log(`\n=== 완료 ===`);
  console.log(`성공: ${success}, 실패: ${fail}, 스킵: ${skip}`);
  console.log(`다음 실행: node scripts/batch-reedit.mjs --offset ${OFFSET + LIMIT} --limit ${LIMIT}`);
}

main().catch(console.error);
