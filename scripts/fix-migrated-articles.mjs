/**
 * 마이그레이션된 블로그 기사 본문 정리 스크립트
 * - 네이버 이미지 → Supabase Storage 재업로드
 * - 깨진 이미지 제거
 * - 본문 HTML 클린업 (data-linkdata, onclick 등 제거)
 * - tags, slug 생성
 */
import { readFileSync } from 'fs';
import crypto from 'crypto';

// 환경변수 로드 (.env.production.local → .env.local)
let env = {};
for (const f of ['.env.production.local', '.env.local']) {
  try {
    const raw = readFileSync(f, 'utf-8');
    for (const line of raw.split('\n')) {
      const m = line.match(/^([A-Z_]+)\s*=\s*"?([^"]*)"?\s*$/);
      if (m) env[m[1]] = m[2];
    }
  } catch {}
}
const SUPABASE_URL = env.NEXT_PUBLIC_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_KEY;

const BATCH_SIZE = 20;
const CONCURRENCY = 5;
let stats = { processed: 0, imagesUploaded: 0, imagesRemoved: 0, errors: 0 };

// 이미지 다운로드 + Supabase 업로드
async function reuploadImage(url) {
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        Referer: 'https://blog.naver.com/',
      },
      redirect: 'follow',
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return null;

    const ct = res.headers.get('content-type') || '';
    if (!ct.startsWith('image/')) return null;

    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length < 1000) return null; // 너무 작은 이미지 스킵

    const ext = ct.includes('png') ? 'png' : ct.includes('gif') ? 'gif' : ct.includes('webp') ? 'webp' : 'jpg';
    const hash = crypto.createHash('md5').update(buf).digest('hex').slice(0, 12);
    const now = new Date();
    const filePath = `${now.getFullYear()}/${String(now.getMonth() + 1).padStart(2, '0')}/migrated-${hash}.${ext}`;

    const uploadRes = await fetch(`${SUPABASE_URL}/storage/v1/object/images/${filePath}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${SERVICE_KEY}`,
        'Content-Type': ct,
        'x-upsert': 'true',
      },
      body: buf,
    });
    if (!uploadRes.ok) return null;

    return `${SUPABASE_URL}/storage/v1/object/public/images/${filePath}`;
  } catch {
    return null;
  }
}

// 본문에서 네이버 이미지 URL 추출
function extractNaverImages(html) {
  const urls = new Set();
  // src="..." 패턴
  const srcMatches = html.matchAll(/src\s*=\s*["'](https?:\/\/[^"']*(?:pstatic\.net|blogfiles\.naver\.net|mblogthumb)[^"']*)/gi);
  for (const m of srcMatches) urls.add(m[1]);
  // data-linkdata 안의 src
  const dataMatches = html.matchAll(/"src"\s*:\s*"(https?:\/\/[^"]*(?:pstatic\.net|blogfiles\.naver\.net|mblogthumb)[^"]*)"/gi);
  for (const m of dataMatches) urls.add(m[1]);
  // data-lazy-src 패턴
  const lazyMatches = html.matchAll(/data-lazy-src\s*=\s*["'](https?:\/\/[^"']*(?:pstatic\.net|blogfiles\.naver\.net|mblogthumb)[^"']*)/gi);
  for (const m of lazyMatches) urls.add(m[1]);
  return [...urls];
}

// HTML 본문 정리
function cleanBodyHtml(html, urlMap) {
  let cleaned = html;

  // URL 교체 (업로드 성공한 것)
  for (const [oldUrl, newUrl] of Object.entries(urlMap)) {
    if (newUrl) {
      cleaned = cleaned.split(oldUrl).join(newUrl);
    }
  }

  // 업로드 실패한 네이버 이미지가 포함된 <img> 태그 제거
  const failedUrls = Object.entries(urlMap).filter(([, v]) => !v).map(([k]) => k);
  for (const url of failedUrls) {
    // img 태그 전체 제거
    const escaped = url.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    cleaned = cleaned.replace(new RegExp(`<img[^>]*${escaped}[^>]*>`, 'gi'), '');
    // data-linkdata가 포함된 a 태그 내용도 제거
    cleaned = cleaned.replace(new RegExp(`<a[^>]*data-linkdata[^>]*${escaped}[^>]*>[\\s\\S]*?<\\/a>`, 'gi'), '');
  }

  // 남은 네이버 이미지 참조 제거 (혹시 놓친 것)
  cleaned = cleaned.replace(/<img[^>]*(?:pstatic\.net|blogfiles\.naver\.net|mblogthumb)[^>]*>/gi, '');
  cleaned = cleaned.replace(/<a[^>]*onclick\s*=\s*["']return false;?["'][^>]*>[\s\S]*?<\/a>/gi, '');

  // 네이버 에디터 잔여물 제거
  cleaned = cleaned.replace(/data-linkdata='[^']*'/gi, '');
  cleaned = cleaned.replace(/onclick="[^"]*"/gi, '');
  cleaned = cleaned.replace(/data-lazy-src="[^"]*"/gi, '');
  cleaned = cleaned.replace(/data-width="[^"]*"/gi, '');
  cleaned = cleaned.replace(/data-height="[^"]*"/gi, '');
  cleaned = cleaned.replace(/class="se-[^"]*"/gi, '');
  cleaned = cleaned.replace(/class="__se[^"]*"/gi, '');

  // 빈 a 태그, 빈 div 정리
  cleaned = cleaned.replace(/<a[^>]*>\s*<\/a>/gi, '');
  cleaned = cleaned.replace(/<div[^>]*>\s*<\/div>/gi, '');
  cleaned = cleaned.replace(/<span[^>]*>\s*<\/span>/gi, '');

  // 연속 빈줄 정리
  cleaned = cleaned.replace(/(\s*<br\s*\/?>\s*){3,}/gi, '<br><br>');
  cleaned = cleaned.replace(/\n{3,}/g, '\n\n');

  return cleaned.trim();
}

// 제목에서 간단한 태그 추출
function generateTags(title, category) {
  const tags = [category];
  // 따옴표 안의 키워드 추출
  const quoted = title.matchAll(/[''"]([^''"]{2,15})[''""]/g);
  for (const m of quoted) {
    if (!tags.includes(m[1])) tags.push(m[1]);
    if (tags.length >= 5) break;
  }
  return tags;
}

// slug 생성
function generateSlug(title) {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9가-힣\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 80)
    .replace(/-$/, '');
}

async function processArticle(article) {
  const { id, title, body, category } = article;
  const naverUrls = extractNaverImages(body);

  const urlMap = {};

  // 이미지 재업로드 (동시 3개씩)
  for (let i = 0; i < naverUrls.length; i += 3) {
    const batch = naverUrls.slice(i, i + 3);
    const results = await Promise.all(batch.map(url => reuploadImage(url)));
    batch.forEach((url, idx) => {
      urlMap[url] = results[idx];
      if (results[idx]) stats.imagesUploaded++;
      else stats.imagesRemoved++;
    });
  }

  // 본문 정리
  const cleanedBody = cleanBodyHtml(body, urlMap);

  // 태그, slug 생성
  const tags = generateTags(title, category);
  const slug = generateSlug(title);

  // DB 업데이트 (REST API)
  const updateRes = await fetch(`${SUPABASE_URL}/rest/v1/articles?id=eq.${id}`, {
    method: 'PATCH',
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'return=minimal',
    },
    body: JSON.stringify({ body: cleanedBody, tags: JSON.stringify(tags), slug }),
  });

  if (!updateRes.ok) {
    stats.errors++;
    console.error(`  ❌ ${title.slice(0, 40)}... DB 에러: ${updateRes.status}`);
  } else {
    stats.processed++;
    const imgInfo = naverUrls.length > 0
      ? `이미지 ${Object.values(urlMap).filter(v => v).length}/${naverUrls.length} 업로드`
      : '이미지 없음';
    if (stats.processed % 50 === 0 || naverUrls.length > 0) {
      console.log(`  ✅ [${stats.processed}] ${title.slice(0, 50)}... | ${imgInfo}`);
    }
  }
}

async function main() {
  console.log('🔧 마이그레이션 기사 최적화 시작\n');

  // 전체 대상 조회
  let offset = 0;
  let total = 0;

  while (true) {
    const qRes = await fetch(
      `${SUPABASE_URL}/rest/v1/articles?source_url=like.*blog.naver.com*&select=id,title,body,category&order=created_at.asc&offset=${offset}&limit=${BATCH_SIZE}`,
      { headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` } }
    );
    if (!qRes.ok) { console.error('DB 조회 에러:', qRes.status); break; }
    const articles = await qRes.json();
    if (!articles || articles.length === 0) break;

    total += articles.length;

    // 동시 처리
    for (let i = 0; i < articles.length; i += CONCURRENCY) {
      const batch = articles.slice(i, i + CONCURRENCY);
      await Promise.all(batch.map(a => processArticle(a)));
    }

    if (stats.processed % 100 === 0) {
      console.log(`\n📊 진행: ${stats.processed}개 처리 | 이미지 업로드 ${stats.imagesUploaded} | 제거 ${stats.imagesRemoved} | 에러 ${stats.errors}\n`);
    }

    offset += BATCH_SIZE;
  }

  console.log('\n==================================================');
  console.log('📊 최종 결과:');
  console.log(`   처리: ${stats.processed}개`);
  console.log(`   이미지 업로드: ${stats.imagesUploaded}개`);
  console.log(`   이미지 제거: ${stats.imagesRemoved}개`);
  console.log(`   에러: ${stats.errors}개`);
}

main().catch(console.error);
