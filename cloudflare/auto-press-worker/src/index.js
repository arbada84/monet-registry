const JSON_HEADERS = { "content-type": "application/json; charset=utf-8" };
const IMAGE_EXT_RE = /\.(png|jpe?g|webp|gif)(\?|#|$)/i;
const TRUSTED_PROXY_HOST_RE = /(^|\.)newswire\.co\.kr$|(^|\.)korea\.kr$/i;
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const MIN_SOURCE_BODY_CHARS = 180;
const MIN_AI_BODY_CHARS = 220;
const AI_RESPONSE_SCHEMA = {
  type: "OBJECT",
  properties: {
    title: { type: "STRING" },
    summary: { type: "STRING" },
    bodyHtml: { type: "STRING" },
    category: { type: "STRING" },
    tags: {
      type: "ARRAY",
      items: { type: "STRING" },
    },
  },
  required: ["title", "summary", "bodyHtml", "category", "tags"],
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: JSON_HEADERS });
}

function nowIso() {
  return new Date().toISOString();
}

function todayKst() {
  return new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

function asInt(value, fallback, min = 1, max = 300) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(Math.trunc(parsed), max));
}

function stripHtml(html) {
  return String(html || "")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function truncate(value, length) {
  const text = String(value || "");
  return text.length > length ? `${text.slice(0, length - 1)}...` : text;
}

function normalizeTitle(title) {
  return String(title || "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "")
    .slice(0, 160);
}

function makeId(prefix) {
  const rand = crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2);
  return `${prefix}_${Date.now()}_${String(rand).replace(/-/g, "").slice(0, 12)}`;
}

function parseJson(value, fallback = {}) {
  if (!value) return fallback;
  if (typeof value !== "string") return value;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function parseAiJson(value) {
  const text = String(value || "").trim();
  if (!text) return null;
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/i)?.[1]?.trim();
  const candidates = [text, fenced].filter(Boolean);
  const objectStart = text.indexOf("{");
  const objectEnd = text.lastIndexOf("}");
  if (objectStart >= 0 && objectEnd > objectStart) {
    candidates.push(text.slice(objectStart, objectEnd + 1));
  }
  for (const candidate of candidates) {
    try {
      return JSON.parse(candidate);
    } catch {
      // Try the next candidate; Gemini can occasionally wrap JSON despite responseMimeType.
    }
  }
  return null;
}

function authOk(request, env) {
  const secret = String(env.AUTO_PRESS_WORKER_SECRET || "").trim();
  if (!secret) return false;
  const auth = request.headers.get("authorization") || "";
  const direct = request.headers.get("x-auto-press-worker-secret") || "";
  return auth === `Bearer ${secret}` || direct === secret;
}

async function event(env, runId, itemId, level, code, message, metadata = {}) {
  await env.DB.prepare(
    `INSERT INTO auto_press_events (run_id, item_id, level, code, message, metadata_json)
     VALUES (?, ?, ?, ?, ?, ?)`,
  ).bind(runId, itemId || null, level, code, message, JSON.stringify(metadata)).run();
  await env.DB.prepare(
    `UPDATE auto_press_runs
     SET last_event_at = ?, updated_at = ?
     WHERE id = ?`,
  ).bind(nowIso(), nowIso(), runId).run();
}

async function loadItem(env, itemId) {
  return env.DB.prepare("SELECT * FROM auto_press_items WHERE id = ? LIMIT 1").bind(itemId).first();
}

async function loadRun(env, runId) {
  return env.DB.prepare("SELECT * FROM auto_press_runs WHERE id = ? LIMIT 1").bind(runId).first();
}

async function listDueItems(env, limit) {
  const now = nowIso();
  const result = await env.DB.prepare(
    `SELECT *
     FROM auto_press_items
     WHERE status = 'queued'
       AND (next_retry_at IS NULL OR next_retry_at <= ?)
       AND (lease_until IS NULL OR lease_until <= ?)
       AND attempt_count < max_attempts
     ORDER BY priority ASC, created_at ASC
     LIMIT ?`,
  ).bind(now, now, limit).all();
  return result.results || [];
}

async function acquireLease(env, item) {
  const now = nowIso();
  const leaseUntil = new Date(Date.now() + 5 * 60 * 1000).toISOString();
  const result = await env.DB.prepare(
    `UPDATE auto_press_items
     SET status = 'running',
         started_at = COALESCE(started_at, ?),
         attempt_count = attempt_count + 1,
         retry_count = retry_count + 1,
         lease_until = ?,
         reason_code = NULL,
         reason_message = 'Worker 처리 중',
         updated_at = ?
     WHERE id = ?
       AND status = 'queued'
       AND (next_retry_at IS NULL OR next_retry_at <= ?)
       AND (lease_until IS NULL OR lease_until <= ?)
       AND attempt_count < max_attempts`,
  ).bind(now, leaseUntil, now, item.id, now, now).run();
  return (result.meta && result.meta.changes > 0) ? leaseUntil : null;
}

async function refreshRunCounts(env, runId) {
  const rows = await env.DB.prepare(
    `SELECT status, COUNT(*) AS count
     FROM auto_press_items
     WHERE run_id = ?
     GROUP BY status`,
  ).bind(runId).all();
  const counts = Object.fromEntries((rows.results || []).map((row) => [row.status, Number(row.count || 0)]));
  const published = Number(counts.ok || 0);
  const failed = Number(counts.fail || 0);
  const queued = Number(counts.queued || 0);
  const running = Number(counts.running || 0);
  const skipped = Number(counts.skip || 0) + Number(counts.dup || 0) + Number(counts.no_image || 0) + Number(counts.old || 0);
  const status = running > 0 ? "running" : queued > 0 ? "queued" : failed > 0 ? "completed" : "completed";
  await env.DB.prepare(
    `UPDATE auto_press_runs
     SET status = ?,
         processed_count = ?,
         published_count = ?,
         skipped_count = ?,
         failed_count = ?,
         queued_count = ?,
         completed_at = CASE WHEN ? = 0 AND ? = 0 THEN COALESCE(completed_at, ?) ELSE completed_at END,
         last_event_at = ?,
         updated_at = ?
     WHERE id = ?`,
  ).bind(
    status,
    published + failed + skipped,
    published,
    skipped,
    failed,
    queued,
    queued,
    running,
    nowIso(),
    nowIso(),
    nowIso(),
    runId,
  ).run();
}

async function finishItem(env, item, status, reasonCode, reasonMessage, patch = {}) {
  const now = nowIso();
  const terminal = ["ok", "dup", "no_image", "old", "skip", "fail"].includes(status) ? 1 : 0;
  await env.DB.prepare(
    `UPDATE auto_press_items
     SET status = ?,
         reason_code = ?,
         reason_message = ?,
         article_id = COALESCE(?, article_id),
         article_no = COALESCE(?, article_no),
         image_url = COALESCE(?, image_url),
         image_count = COALESCE(?, image_count),
         retryable = CASE WHEN ? = 1 THEN 0 ELSE retryable END,
         next_retry_at = CASE WHEN ? = 1 THEN NULL ELSE next_retry_at END,
         lease_until = NULL,
         completed_at = CASE WHEN ? = 1 THEN ? ELSE completed_at END,
         updated_at = ?
     WHERE id = ?`,
  ).bind(
    status,
    reasonCode || null,
    reasonMessage || "",
    patch.articleId || null,
    patch.articleNo || null,
    patch.imageUrl || null,
    Number.isFinite(patch.imageCount) ? patch.imageCount : null,
    terminal,
    terminal,
    terminal,
    now,
    now,
    item.id,
  ).run();
  await refreshRunCounts(env, item.run_id);
}

async function dailyUsage(env) {
  const date = todayKst();
  const row = await env.DB.prepare("SELECT * FROM auto_press_daily_usage WHERE date = ? LIMIT 1").bind(date).first();
  if (row) return row;
  await env.DB.prepare(
    "INSERT INTO auto_press_daily_usage (date, created_at, updated_at) VALUES (?, ?, ?)",
  ).bind(date, nowIso(), nowIso()).run();
  return env.DB.prepare("SELECT * FROM auto_press_daily_usage WHERE date = ? LIMIT 1").bind(date).first();
}

async function incrementUsage(env, field) {
  const allowed = new Set(["jobs_processed", "ai_calls", "publishes", "image_uploads", "source_fetch_failures"]);
  if (!allowed.has(field)) return;
  const date = todayKst();
  await env.DB.prepare(
    `INSERT INTO auto_press_daily_usage (date, ${field}, created_at, updated_at)
     VALUES (?, 1, ?, ?)
     ON CONFLICT(date) DO UPDATE SET
       ${field} = ${field} + 1,
       updated_at = excluded.updated_at`,
  ).bind(date, nowIso(), nowIso()).run();
}

async function assertDailyLimits(env) {
  const usage = await dailyUsage(env);
  const aiLimit = asInt(env.AUTO_PRESS_DAILY_AI_LIMIT, 50, 1, 10000);
  const publishLimit = asInt(env.AUTO_PRESS_DAILY_PUBLISH_LIMIT, 30, 1, 10000);
  const imageLimit = asInt(env.AUTO_PRESS_DAILY_IMAGE_LIMIT, 50, 1, 10000);
  if (Number(usage.ai_calls || 0) >= aiLimit) return "일일 AI 호출 상한에 도달했습니다.";
  if (Number(usage.publishes || 0) >= publishLimit) return "일일 기사 등록 상한에 도달했습니다.";
  if (Number(usage.image_uploads || 0) >= imageLimit) return "일일 이미지 업로드 상한에 도달했습니다.";
  return "";
}

async function fetchSource(url) {
  if (!/^https?:\/\//i.test(String(url || ""))) throw new Error("원문 URL이 올바르지 않습니다.");
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetch(url, {
      headers: {
        "user-agent": "CulturePeopleAutoPressWorker/1.0",
        accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      },
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`원문 응답 HTTP ${response.status}`);
    const html = await response.text();
    const title = (html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)/i)?.[1])
      || (html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1])
      || "";
    const bodyText = stripHtml(html);
    const images = extractImages(html, url);
    return { html, title: stripHtml(title), bodyText, images };
  } finally {
    clearTimeout(timeout);
  }
}

function getHostname(url) {
  try {
    return new URL(url).hostname;
  } catch {
    return "";
  }
}

function shouldPreferSiteProxy(env, url) {
  if (String(env.AUTO_PRESS_PREFER_SITE_PROXY || "true").toLowerCase() === "false") return false;
  return TRUSTED_PROXY_HOST_RE.test(getHostname(url));
}

function isUsableSource(source) {
  const bodyText = String(source?.bodyText || "").trim();
  const title = String(source?.title || "").trim();
  return bodyText.length >= MIN_SOURCE_BODY_CHARS && title.length >= 4;
}

function normalizeSource(source) {
  return {
    html: String(source?.html || ""),
    title: stripHtml(source?.title || ""),
    bodyText: String(source?.bodyText || "").trim(),
    images: Array.isArray(source?.images) ? source.images.filter(Boolean) : [],
  };
}

async function fetchSourceViaSiteProxy(env, url, cause) {
  const siteBaseUrl = String(env.SITE_BASE_URL || "").replace(/\/+$/, "");
  if (!siteBaseUrl) throw cause;
  const proxyUrl = `${siteBaseUrl}/api/netpro/origin?url=${encodeURIComponent(url)}`;
  const headers = { "user-agent": "CulturePeopleAutoPressWorker/1.0" };
  const secret = String(env.AUTO_PRESS_WORKER_SECRET || "").trim();
  if (secret) headers.authorization = `Bearer ${secret}`;
  const response = await fetch(proxyUrl, {
    headers,
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data.success === false) {
    const reason = data.error || `프록시 응답 HTTP ${response.status}`;
    throw new Error(`${cause instanceof Error ? cause.message : String(cause)} / Vercel 원문 프록시 실패: 프록시 응답 HTTP ${response.status}: ${reason}`);
  }
  const bodyHtml = String(data.bodyHtml || "");
  const bodyText = String(data.bodyText || stripHtml(bodyHtml));
  const images = Array.isArray(data.images) ? data.images.filter(Boolean) : [];
  if (data.thumbnail && !images.includes(data.thumbnail)) images.unshift(data.thumbnail);
  return {
    html: bodyHtml,
    title: stripHtml(data.title || ""),
    bodyText,
    images,
  };
}

async function fetchSourceWithFallback(env, url) {
  if (shouldPreferSiteProxy(env, url)) {
    try {
      const proxied = normalizeSource(await fetchSourceViaSiteProxy(env, url, new Error("사이트 프록시 우선 수집")));
      if (isUsableSource(proxied)) return proxied;
    } catch (proxyError) {
      const proxyMessage = proxyError instanceof Error ? proxyError.message : String(proxyError);
      if (/프록시 응답 HTTP (401|403|429)/.test(proxyMessage)) throw proxyError;
      try {
        const direct = normalizeSource(await fetchSource(url));
        if (isUsableSource(direct)) return direct;
      } catch {
        throw proxyError;
      }
      throw proxyError;
    }
  }

  try {
    const direct = normalizeSource(await fetchSource(url));
    if (isUsableSource(direct)) return direct;
    try {
      const proxied = normalizeSource(await fetchSourceViaSiteProxy(env, url, new Error("직접 수집 본문 품질 부족")));
      if (isUsableSource(proxied)) return proxied;
    } catch {
      return direct;
    }
    return direct;
  } catch (error) {
    return normalizeSource(await fetchSourceViaSiteProxy(env, url, error));
  }
}

function absolutizeUrl(url, base) {
  try {
    return new URL(url, base).href;
  } catch {
    return "";
  }
}

function extractImages(html, baseUrl) {
  const images = new Set();
  const metaRe = /<meta[^>]+(?:property|name)=["'](?:og:image|twitter:image)["'][^>]+content=["']([^"']+)["'][^>]*>/gi;
  const imgRe = /<img[^>]+src=["']([^"']+)["'][^>]*>/gi;
  const sourceRe = /<source[^>]+srcset=["']([^"']+)["'][^>]*>/gi;
  for (const re of [metaRe, imgRe, sourceRe]) {
    let match;
    while ((match = re.exec(html))) {
      const first = String(match[1] || "").split(",")[0].trim().split(/\s+/)[0];
      const absolute = absolutizeUrl(first, baseUrl);
      if (absolute && /^https?:\/\//i.test(absolute) && !/pixel|spacer|blank|logo|icon/i.test(absolute)) {
        images.add(absolute);
      }
    }
  }
  return [...images].filter((url) => IMAGE_EXT_RE.test(url) || /image|photo|thumb|attach|file/i.test(url)).slice(0, 8);
}

async function duplicateExists(env, sourceUrl, normalizedTitle) {
  if (sourceUrl) {
    const byUrl = await env.DB.prepare(
      "SELECT id FROM articles WHERE source_url = ? AND deleted_at IS NULL LIMIT 1",
    ).bind(sourceUrl).first();
    if (byUrl) return true;
  }
  if (normalizedTitle) {
    const byTitle = await env.DB.prepare(
      "SELECT id FROM articles WHERE lower(replace(replace(title, ' ', ''), '.', '')) = ? AND deleted_at IS NULL LIMIT 1",
    ).bind(normalizedTitle).first();
    if (byTitle) return true;
  }
  return false;
}

function buildGeminiPrompt(source) {
  return [
    "너는 CulturePeople 보도자료 편집자다.",
    "원문을 그대로 베끼지 말고 문화/정책/지역 관점의 기사형 문장으로 재작성해라.",
    "출력은 JSON만 허용한다: title, summary, bodyHtml, category, tags.",
    "bodyHtml은 <p> 문단 중심으로 작성하고 원문 문단을 그대로 복사하지 마라.",
    "",
    `제목: ${source.title}`,
    `본문: ${source.bodyText.slice(0, 3000)}`,
  ].join("\n");
}

function buildCulturePeoplePrompt(source) {
  return [
    "너는 CulturePeople 보도자료 편집자다.",
    "원문을 그대로 베끼지 말고 문화, 정책, 지역 관점의 기사 문장으로 재작성해라.",
    "출력은 JSON만 허용한다: title, summary, bodyHtml, category, tags.",
    "bodyHtml은 <p> 문단 4~6개로 작성하고, 본문 순수 텍스트가 최소 700자 이상이 되게 해라.",
    "원문 문단을 그대로 복사하지 말고 문장 구조와 표현을 바꾸되, 사실관계와 고유명사는 유지해라.",
    "이미지 태그는 넣지 마라. 시스템이 별도로 대표 이미지를 삽입한다.",
    "",
    `제목: ${source.title}`,
    `본문: ${source.bodyText.slice(0, 4500)}`,
  ].join("\n");
}

function resolvePublishStatus(options) {
  return String(options.publishStatus || "").trim() === "게시" ? "게시" : "임시저장";
}

function resolveCategory(edited, options, env) {
  return String(edited.category || options.category || env.AUTO_PRESS_DEFAULT_CATEGORY || "문화").slice(0, 40);
}

function isTerminalSourceFetchError(error) {
  const message = error instanceof Error ? error.message : String(error);
  return message.includes("프록시 응답 HTTP 422")
    || message.includes("정부 보도자료 본문을 추출할 수 없습니다")
    || message.includes("원문 본문을 추출할 수 없습니다");
}

async function geminiEdit(env, source, runOptions) {
  const apiKey = String(env.GEMINI_API_KEY || "").trim();
  if (!apiKey) throw new Error("Gemini API 키가 Worker secret에 없습니다.");
  await incrementUsage(env, "ai_calls");
  const model = String(runOptions.aiModel || env.GEMINI_MODEL || "gemini-2.5-flash").trim();
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      contents: [{ role: "user", parts: [{ text: buildCulturePeoplePrompt(source) }] }],
      generationConfig: {
        temperature: 0.45,
        maxOutputTokens: 4096,
        responseMimeType: "application/json",
        responseSchema: AI_RESPONSE_SCHEMA,
      },
    }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`AI 편집 HTTP ${response.status}`);
  const text = data.candidates?.[0]?.content?.parts?.map((part) => part.text || "").join("") || "";
  const edited = parseAiJson(text);
  const bodyChars = edited?.bodyHtml ? stripHtml(edited.bodyHtml).length : 0;
  if (!edited || !edited.bodyHtml || bodyChars < MIN_AI_BODY_CHARS) {
    const finishReason = data.candidates?.[0]?.finishReason || "unknown";
    throw new Error(`AI 편집 결과가 비어 있거나 너무 짧습니다. finish=${finishReason}, textChars=${text.length}, bodyChars=${bodyChars}`);
  }
  return edited;
}

function similarityTooHigh(sourceText, editedHtml) {
  const sourceWords = new Set(stripHtml(sourceText).split(/\s+/).filter((word) => word.length >= 3).slice(0, 800));
  const editedWords = stripHtml(editedHtml).split(/\s+/).filter((word) => word.length >= 3).slice(0, 800);
  if (sourceWords.size < 30 || editedWords.length < 30) return false;
  const overlap = editedWords.filter((word) => sourceWords.has(word)).length / Math.max(1, editedWords.length);
  return overlap >= 0.72;
}

function getDeclaredContentLength(response) {
  const raw = response.headers.get("content-length");
  if (!raw) return null;
  const value = Number.parseInt(raw, 10);
  return Number.isFinite(value) ? value : null;
}

function detectImageMime(buffer) {
  const arr = new Uint8Array(buffer);
  if (arr[0] === 0xFF && arr[1] === 0xD8 && arr[2] === 0xFF) return "image/jpeg";
  if (arr[0] === 0x89 && arr[1] === 0x50 && arr[2] === 0x4E && arr[3] === 0x47) return "image/png";
  if (arr[0] === 0x47 && arr[1] === 0x49 && arr[2] === 0x46) return "image/gif";
  if (
    arr[0] === 0x52 && arr[1] === 0x49 && arr[2] === 0x46 && arr[3] === 0x46
    && arr[8] === 0x57 && arr[9] === 0x45 && arr[10] === 0x42 && arr[11] === 0x50
  ) {
    return "image/webp";
  }
  return "";
}

function imageExtForMime(contentType) {
  return contentType.includes("png") ? "png"
    : contentType.includes("webp") ? "webp"
      : contentType.includes("gif") ? "gif"
        : "jpg";
}

function validateDownloadedImage(buffer, contentType, imageUrl) {
  if (!buffer || buffer.byteLength === 0) throw new Error("이미지 다운로드 결과가 비어 있습니다.");
  if (buffer.byteLength > MAX_IMAGE_BYTES) throw new Error("이미지 크기가 10MB를 초과했습니다.");
  const detected = detectImageMime(buffer);
  const normalizedContentType = String(contentType || "").split(";")[0].trim().toLowerCase();
  const finalContentType = detected || normalizedContentType;
  if (!["image/jpeg", "image/png", "image/gif", "image/webp"].includes(finalContentType)) {
    throw new Error(`이미지 파일이 아닙니다: ${normalizedContentType || "unknown"}`);
  }
  return {
    buffer,
    contentType: finalContentType,
    ext: imageExtForMime(finalContentType),
    sourceUrl: imageUrl,
  };
}

function imageRequestHeaders(imageUrl) {
  const headers = {
    "user-agent": "CulturePeopleAutoPressWorker/1.0",
    accept: "image/webp,image/apng,image/*,*/*;q=0.8",
  };
  try {
    headers.referer = `${new URL(imageUrl).origin}/`;
  } catch {
    // Keep the request usable even if the source URL is malformed; fetch will fail below.
  }
  return headers;
}

async function downloadImageDirect(imageUrl) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetch(imageUrl, {
      headers: imageRequestHeaders(imageUrl),
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`이미지 다운로드 HTTP ${response.status}`);
    const declaredSize = getDeclaredContentLength(response);
    if (declaredSize !== null && declaredSize > MAX_IMAGE_BYTES) {
      throw new Error("이미지 크기가 10MB를 초과했습니다.");
    }
    const buffer = await response.arrayBuffer();
    return validateDownloadedImage(buffer, response.headers.get("content-type") || "", imageUrl);
  } finally {
    clearTimeout(timeout);
  }
}

async function downloadImageViaSiteProxy(env, imageUrl, cause) {
  if (String(env.AUTO_PRESS_IMAGE_PROXY_FALLBACK || "true").toLowerCase() === "false") throw cause;
  const siteBaseUrl = String(env.SITE_BASE_URL || "").replace(/\/+$/, "");
  const secret = String(env.AUTO_PRESS_WORKER_SECRET || "").trim();
  if (!siteBaseUrl || !secret) throw cause;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20000);
  try {
    const response = await fetch(`${siteBaseUrl}/api/netpro/image?url=${encodeURIComponent(imageUrl)}`, {
      headers: {
        authorization: `Bearer ${secret}`,
        "user-agent": "CulturePeopleAutoPressWorker/1.0",
      },
      signal: controller.signal,
    });
    if (!response.ok) {
      const reason = await response.text().catch(() => "");
      throw new Error(`사이트 이미지 프록시 HTTP ${response.status}${reason ? `: ${truncate(reason, 180)}` : ""}`);
    }
    const declaredSize = getDeclaredContentLength(response);
    if (declaredSize !== null && declaredSize > MAX_IMAGE_BYTES) {
      throw new Error("사이트 이미지 프록시 결과가 10MB를 초과했습니다.");
    }
    const buffer = await response.arrayBuffer();
    return validateDownloadedImage(buffer, response.headers.get("content-type") || "", imageUrl);
  } catch (error) {
    const causeMessage = cause instanceof Error ? cause.message : String(cause);
    const fallbackMessage = error instanceof Error ? error.message : String(error);
    throw new Error(`${causeMessage} / ${fallbackMessage}`);
  } finally {
    clearTimeout(timeout);
  }
}

async function downloadImage(env, imageUrl) {
  try {
    return await downloadImageDirect(imageUrl);
  } catch (error) {
    return downloadImageViaSiteProxy(env, imageUrl, error);
  }
}

async function uploadDownloadedImage(env, imageUrl, itemId, downloaded) {
  if (!env.MEDIA_BUCKET) throw new Error("R2 MEDIA_BUCKET 바인딩이 없습니다.");
  const base = String(env.PUBLIC_MEDIA_BASE_URL || "").replace(/\/+$/, "");
  if (!base) throw new Error("PUBLIC_MEDIA_BASE_URL이 설정되지 않았습니다.");
  const contentType = downloaded.contentType || "image/jpeg";
  const ext = downloaded.ext || imageExtForMime(contentType);
  const date = todayKst().replace(/-/g, "/");
  const key = `press/${date}/${itemId}.${ext}`;
  await env.MEDIA_BUCKET.put(key, downloaded.buffer, {
    httpMetadata: { contentType },
    customMetadata: { source_url: imageUrl, item_id: itemId, uploaded_at: nowIso() },
  });
  await incrementUsage(env, "image_uploads");
  return `${base}/${key}`;
}

async function serveMedia(request, env) {
  if (!env.MEDIA_BUCKET) return json({ success: false, error: "R2 바인딩이 없습니다." }, 500);
  const url = new URL(request.url);
  const key = decodeURIComponent(url.pathname.replace(/^\/media\/?/, ""));
  if (!key || key.includes("..")) return json({ success: false, error: "잘못된 미디어 경로입니다." }, 400);
  const object = await env.MEDIA_BUCKET.get(key);
  if (!object) return json({ success: false, error: "미디어를 찾을 수 없습니다." }, 404);
  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set("etag", object.httpEtag);
  headers.set("cache-control", "public, max-age=31536000, immutable");
  if (request.method === "HEAD") return new Response(null, { headers });
  return new Response(object.body, { headers });
}

async function nextArticleNo(env) {
  const row = await env.DB.prepare("SELECT MAX(no) AS max_no FROM articles").first();
  return Number(row?.max_no || 0) + 1;
}

async function saveArticle(env, item, run, source, edited, imageUrl) {
  const no = await nextArticleNo(env);
  const id = makeId("article");
  const options = parseJson(run.options_json, {});
  const status = options.publishStatus === "게시" ? "게시" : "임시저장";
  const title = truncate(stripHtml(edited.title || item.title || source.title), 120);
  const category = String(edited.category || options.category || env.AUTO_PRESS_DEFAULT_CATEGORY || "문화").slice(0, 40);
  const tags = Array.isArray(edited.tags) ? edited.tags.join(",") : String(edited.tags || "");
  const body = String(edited.bodyHtml || "");
  const bodyWithImage = /<img\b/i.test(body)
    ? body
    : `<p><img src="${imageUrl}" alt="${title.replace(/"/g, "&quot;")}" /></p>\n${body}`;
  const now = nowIso();
  await env.DB.prepare(
    `INSERT INTO articles (
       id, no, title, category, date, status, views, body, thumbnail, tags,
       author, summary, meta_description, og_image, updated_at, source_url,
       review_note, audit_trail_json, created_at, ai_generated
     )
     VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
  ).bind(
    id,
    no,
    title,
    resolveCategory(edited, options, env),
    todayKst(),
    resolvePublishStatus(options),
    bodyWithImage,
    imageUrl,
    tags,
    "CulturePeople AI",
    truncate(stripHtml(edited.summary || ""), 300),
    truncate(stripHtml(edited.summary || ""), 160),
    imageUrl,
    now,
    item.source_url,
    "Cloudflare Worker 자동 보도자료 등록",
    JSON.stringify([{ action: "자동등록", at: now, worker: "auto-press-worker", itemId: item.id }]),
    now,
  ).run();
  await env.DB.prepare(
    `INSERT INTO article_search_index (article_id, title, summary, tags, body_excerpt, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(article_id) DO UPDATE SET
       title = excluded.title,
       summary = excluded.summary,
       tags = excluded.tags,
       body_excerpt = excluded.body_excerpt,
       updated_at = excluded.updated_at`,
  ).bind(id, title, truncate(stripHtml(edited.summary || ""), 300), tags, truncate(stripHtml(bodyWithImage), 2000), now).run();
  await incrementUsage(env, "publishes");
  return { id, no, title };
}

async function processItem(env, itemId) {
  const item = await loadItem(env, itemId);
  if (!item) return { status: "skipped", reason: "ITEM_NOT_FOUND" };
  const run = await loadRun(env, item.run_id);
  if (!run) return { status: "skipped", reason: "RUN_NOT_FOUND" };
  const lease = await acquireLease(env, item);
  if (!lease) return { status: "skipped", reason: "LEASE_NOT_ACQUIRED" };

  await event(env, item.run_id, item.id, "info", "ITEM_LEASE_ACQUIRED", "Worker가 기사 후보 처리 권한을 획득했습니다.", { leaseUntil: lease });

  try {
    const limitMessage = await assertDailyLimits(env);
    if (limitMessage) {
      await finishItem(env, item, "queued", "DAILY_LIMIT_REACHED", limitMessage, {});
      await env.DB.prepare(
        "UPDATE auto_press_items SET next_retry_at = ?, lease_until = NULL, updated_at = ? WHERE id = ?",
      ).bind(new Date(Date.now() + 12 * 60 * 60 * 1000).toISOString(), nowIso(), item.id).run();
      await event(env, item.run_id, item.id, "warn", "DAILY_LIMIT_REACHED", limitMessage);
      return { status: "skipped", reason: "DAILY_LIMIT_REACHED" };
    }

    const normalized = normalizeTitle(item.title);
    if (await duplicateExists(env, item.source_url, normalized)) {
      await finishItem(env, item, "dup", "DUPLICATE_SOURCE", "이미 등록된 원문 또는 유사 제목 기사입니다.");
      await event(env, item.run_id, item.id, "info", "SKIPPED_DUPLICATE", "중복 기사로 등록하지 않았습니다.");
      return { status: "skipped", reason: "DUPLICATE_SOURCE" };
    }

    let source;
    try {
      source = await fetchSourceWithFallback(env, item.source_url);
    } catch (error) {
      await incrementUsage(env, "source_fetch_failures");
      if (isTerminalSourceFetchError(error)) {
        const message = error instanceof Error ? error.message : String(error);
        await finishItem(
          env,
          item,
          "skip",
          "SOURCE_BODY_UNAVAILABLE",
          "원문 본문을 추출할 수 없어 등록 대상에서 제외했습니다.",
          { error: truncate(message, 500) },
        );
        await event(
          env,
          item.run_id,
          item.id,
          "warn",
          "SKIPPED_SOURCE_BODY_UNAVAILABLE",
          "원문 본문을 추출할 수 없어 등록 대상에서 제외했습니다.",
          { error: truncate(message, 500) },
        );
        return { status: "skipped", reason: "SOURCE_BODY_UNAVAILABLE" };
      }
      throw error;
    }
    source.title = source.title || item.title;
    if (!source.bodyText || source.bodyText.length < 80) {
      await finishItem(env, item, "fail", "BODY_TOO_SHORT", "원문 본문이 너무 짧아 기사화하지 않았습니다.");
      await event(env, item.run_id, item.id, "warn", "BODY_TOO_SHORT", "원문 본문이 너무 짧습니다.");
      return { status: "failed", reason: "BODY_TOO_SHORT" };
    }
    if (source.images.length === 0) {
      await finishItem(env, item, "no_image", "NO_IMAGE", "AI 호출 전 코드 검사에서 이미지가 없어 제외했습니다.", { imageCount: 0 });
      await event(env, item.run_id, item.id, "info", "SKIPPED_NO_IMAGE", "이미지가 없어 AI 호출 없이 제외했습니다.");
      return { status: "skipped", reason: "NO_IMAGE" };
    }

    const sourceImageUrl = source.images[0];
    const downloadedImage = await downloadImage(env, sourceImageUrl);
    const runOptions = parseJson(run.options_json, {});
    const edited = await geminiEdit(env, source, runOptions);
    if (similarityTooHigh(source.bodyText, edited.bodyHtml)) {
      await finishItem(env, item, "skip", "COPYRIGHT_SIMILARITY_HIGH", "AI 편집 결과가 원문과 너무 유사해 등록하지 않았습니다.");
      await event(env, item.run_id, item.id, "warn", "COPYRIGHT_SIMILARITY_HIGH", "원문 유사도가 높아 자동 등록을 차단했습니다.");
      return { status: "skipped", reason: "COPYRIGHT_SIMILARITY_HIGH" };
    }

    const imageUrl = await uploadDownloadedImage(env, sourceImageUrl, item.id, downloadedImage);
    const saved = await saveArticle(env, item, run, source, edited, imageUrl);
    await finishItem(env, item, "ok", null, "등록 완료", {
      articleId: saved.id,
      articleNo: saved.no,
      imageUrl,
      imageCount: source.images.length,
    });
    await event(env, item.run_id, item.id, "info", "ARTICLE_PUBLISHED", "보도자료 자동등록이 완료되었습니다.", {
      articleId: saved.id,
      articleNo: saved.no,
      title: saved.title,
    });
    await incrementUsage(env, "jobs_processed");
    return { status: "success", articleId: saved.id, articleNo: saved.no };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const attempts = Number(item.attempt_count || 0) + 1;
    const maxAttempts = Number(item.max_attempts || 3);
    const willRetry = attempts < maxAttempts;
    const reasonCode = /이미지|image/i.test(message) ? "IMAGE_UPLOAD_FAILED" : "WORKER_PROCESS_FAILED";
    await env.DB.prepare(
      `UPDATE auto_press_items
       SET status = ?,
           reason_code = ?,
           reason_message = ?,
           retryable = ?,
           next_retry_at = ?,
           lease_until = NULL,
           completed_at = CASE WHEN ? = 0 THEN ? ELSE completed_at END,
           updated_at = ?
       WHERE id = ?`,
    ).bind(
      willRetry ? "queued" : "fail",
      reasonCode,
      truncate(message, 500),
      willRetry ? 1 : 0,
      willRetry ? new Date(Date.now() + 30 * 60 * 1000).toISOString() : null,
      willRetry ? 1 : 0,
      nowIso(),
      nowIso(),
      item.id,
    ).run();
    await refreshRunCounts(env, item.run_id);
    await event(env, item.run_id, item.id, "error", reasonCode === "IMAGE_UPLOAD_FAILED" ? "IMAGE_UPLOAD_FAILED" : "ITEM_FAILED", "Worker 처리 중 오류가 발생했습니다.", { error: message, willRetry });
    return { status: "failed", reason: reasonCode, error: message, retry: willRetry };
  }
}

async function notifySiteRunResult(env, runId, itemId) {
  const siteBaseUrl = String(env.SITE_BASE_URL || "").replace(/\/+$/, "");
  const secret = String(env.AUTO_PRESS_WORKER_SECRET || "").trim();
  if (!siteBaseUrl || !secret || String(env.AUTO_PRESS_RESULT_NOTIFY || "true").toLowerCase() === "false") {
    return { ok: false, skipped: true, reason: "NOT_CONFIGURED" };
  }

  const response = await fetch(`${siteBaseUrl}/api/auto-press/worker-notify`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${secret}`,
      "content-type": "application/json",
      "user-agent": "CulturePeopleAutoPressWorker/1.0",
    },
    body: JSON.stringify({
      runId,
      itemId,
      processedAt: nowIso(),
    }),
  });
  const data = await response.json().catch(() => ({}));
  return {
    ok: response.ok && data.success !== false,
    status: response.status,
    data,
  };
}

async function processItemAndNotify(env, itemId) {
  const result = await processItem(env, itemId);
  const item = await loadItem(env, itemId).catch(() => null);
  if (!item) return result;
  const status = String(item.status || "");
  const shouldNotifyDailyLimit = status === "queued" && item.reason_code === "DAILY_LIMIT_REACHED";
  if (!shouldNotifyDailyLimit && ["queued", "running"].includes(status)) return result;

  await notifySiteRunResult(env, item.run_id, item.id).catch((error) => {
    console.warn("[auto-press-worker] site result notify failed:", error instanceof Error ? error.message : error);
  });
  return result;
}

async function enqueueRunItems(request, env) {
  if (!authOk(request, env)) return json({ success: false, error: "인증이 필요합니다." }, 401);
  const body = await request.json().catch(() => ({}));
  const runId = String(body.runId || "").trim();
  const limit = asInt(body.limit, 100, 1, 300);
  if (!runId) return json({ success: false, error: "runId가 필요합니다." }, 400);
  const rows = await env.DB.prepare(
    `SELECT id, run_id, source_id
     FROM auto_press_items
     WHERE run_id = ?
       AND status = 'queued'
       AND (next_retry_at IS NULL OR next_retry_at <= ?)
       AND (lease_until IS NULL OR lease_until <= ?)
     ORDER BY priority ASC, created_at ASC
     LIMIT ?`,
  ).bind(runId, nowIso(), nowIso(), limit).all();
  const items = rows.results || [];
  if (env.AUTO_PRESS_QUEUE) {
    for (const item of items) {
      await env.AUTO_PRESS_QUEUE.send({
        type: "auto_press_item",
        version: 1,
        runId: item.run_id,
        itemId: item.id,
        sourceId: item.source_id || "",
        priority: 100,
        createdAt: nowIso(),
        traceId: makeId("trace"),
      });
    }
  }
  await event(env, runId, null, "info", "QUEUE_MESSAGES_SENT", `Worker Queue 메시지 ${items.length}건을 발행했습니다.`, { count: items.length }).catch(() => undefined);
  return json({ success: true, enqueued: items.length, queueConfigured: Boolean(env.AUTO_PRESS_QUEUE) });
}

async function processDue(env, limit) {
  const items = await listDueItems(env, limit);
  const results = [];
  for (const item of items) {
    results.push({ itemId: item.id, ...(await processItemAndNotify(env, item.id)) });
  }
  return { success: true, processed: results.length, results };
}

async function handleProcess(request, env) {
  if (!authOk(request, env)) return json({ success: false, error: "인증이 필요합니다." }, 401);
  const body = await request.json().catch(() => ({}));
  return json(await processDue(env, asInt(body.limit, 3, 1, 10)));
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if ((request.method === "GET" || request.method === "HEAD") && url.pathname.startsWith("/media/")) return serveMedia(request, env);
    if (request.method === "GET" && url.pathname === "/health") {
      return json({
        success: true,
        worker: "culturepeople-auto-press-worker",
        version: "2026-05-13-image-proxy-fallback",
        bindings: {
          d1: Boolean(env.DB),
          queue: Boolean(env.AUTO_PRESS_QUEUE),
          r2: Boolean(env.MEDIA_BUCKET),
          mediaBaseUrl: Boolean(env.PUBLIC_MEDIA_BASE_URL),
          geminiKey: Boolean(env.GEMINI_API_KEY),
        },
        ai: {
          model: String(env.GEMINI_MODEL || "gemini-2.5-flash"),
          responseSchema: true,
        },
        sourceFetch: {
          preferSiteProxy: String(env.AUTO_PRESS_PREFER_SITE_PROXY || "true").toLowerCase() !== "false",
          trustedHosts: ["newswire.co.kr", "korea.kr"],
          minBodyChars: MIN_SOURCE_BODY_CHARS,
        },
        imageFetch: {
          siteProxyFallback: String(env.AUTO_PRESS_IMAGE_PROXY_FALLBACK || "true").toLowerCase() !== "false",
          maxBytes: MAX_IMAGE_BYTES,
          beforeAiEdit: true,
        },
      });
    }
    if (request.method === "POST" && url.pathname === "/enqueue") return enqueueRunItems(request, env);
    if (request.method === "POST" && url.pathname === "/process") return handleProcess(request, env);
    return json({ success: false, error: "지원하지 않는 경로입니다." }, 404);
  },

  async queue(batch, env) {
    for (const message of batch.messages) {
      const body = message.body || {};
      const itemId = body.itemId || body.id;
      try {
        if (!itemId) throw new Error("Queue 메시지에 itemId가 없습니다.");
        const result = await processItemAndNotify(env, itemId);
        if (result.retry) message.retry();
        else message.ack();
      } catch (error) {
        message.retry();
      }
    }
  },

  async scheduled(eventInfo, env, ctx) {
    const limit = asInt(env.AUTO_PRESS_WORKER_BATCH_SIZE, 3, 1, 10);
    ctx.waitUntil(processDue(env, limit));
  },
};
