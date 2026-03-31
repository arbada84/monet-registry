# Phase 10: 운영 안정성 - Research

**Researched:** 2026-04-01
**Domain:** Supabase 쿼리 최적화, Upstash Redis rate limiting, Next.js cookie 보안, 파일 정리
**Confidence:** HIGH

## Summary

Phase 10은 5개 요구사항(PERF-01, PERF-02, SEC-01, SEC-02, CLEAN-01)을 다루며, 모두 기존 코드의 명확한 패턴 개선이다. 새로운 라이브러리 도입 없이 현재 스택(Supabase REST API, Upstash Redis, Next.js 15.5.14) 내에서 해결 가능하다.

핵심 발견사항: (1) `sbGetArticles()`는 이미 body를 제외하지만 전체 기사 4000+건을 매번 가져와 클라이언트에서 필터링하는 구조. 18곳에서 호출되며 대부분 게시 상태의 최신 N건만 필요. (2) 인메모리 rate limit 3곳(commentRateMap, cronRateLimitMap, memAttempts)은 이미 Redis 우선 + 인메모리 폴백 구조로 되어 있어 폴백 코드 제거만 하면 됨. (3) cookie secure 플래그는 login/route.ts 3곳에서 `process.env.NODE_ENV === "production"` 조건부로 설정.

**Primary recommendation:** 목적별 Supabase 쿼리 함수 추출(serverGetRecentArticles, serverGetArticleIds 등) + Redis 전용 전환 + cookie secure: true 하드코딩

## Project Constraints (from CLAUDE.md/MEMORY)

- `vercel deploy --prod` 배포 필수 (코드 변경 시)
- 한글 출력 필수
- pnpm 9.12.2, Next.js 15.5.14, Supabase, Vercel Hobby
- Redis 공통 유틸: `src/lib/redis.ts` 재사용
- 최소 변경 원칙 (v1.0부터 유지)
- Vercel Hobby: 파일시스템 읽기 전용, cron 1일1회 제한

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| PERF-01 | serverGetArticles() 20곳+을 목적별 쿼리로 전환 | sbGetArticles()가 4000+건 전체 조회, 호출처 18곳 분석 완료 - 목적별 함수(Recent, Ids, Scheduled 등) 추출 패턴 도출 |
| PERF-02 | /api/db/articles GET의 클라이언트 사이드 필터링을 DB 레벨로 전환 | route.ts 50-74행 - q/category/status 3개 필터를 serverGetArticles() 후 JS filter()로 처리 중. Supabase ilike/eq 전환 가능 |
| SEC-01 | 인메모리 rate limit 잔여분 Redis 전환 | commentRateMap(comments/route.ts), cronRateLimitMap(middleware.ts), memAttempts(login/route.ts) 3곳 확인. 모두 이미 Redis 우선 분기 존재, 인메모리 폴백만 제거 |
| SEC-02 | Cookie secure 플래그 항상 true 강제 | login/route.ts 3곳(204, 253, 273행)에서 `secure: process.env.NODE_ENV === "production"` 사용 중 |
| CLEAN-01 | temp 파일 삭제 + .gitignore 패턴 추가 | 루트에 5개 확인(temp_ai_output.html, temp_articles_output.html, temp_dashboard_output.html, temp_press_output.html, tmp_pma.html, cookies.txt, nul). .gitignore에 패턴 이미 존재하나 git에서 추적 해제 필요 |
</phase_requirements>

## Standard Stack

### Core (변경 없음 - 기존 스택 활용)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| @upstash/redis | ^1.36.3 | Rate limiting, 토큰 블랙리스트 | 이미 사용 중, redis.ts 공통 유틸 존재 |
| Supabase REST API | (서비스) | DB 쿼리 | 이미 사용 중, PostgREST 필터링 지원 |
| Next.js | 15.5.14 | 프레임워크 | 이미 사용 중 |

### Alternatives Considered
없음 - 모든 작업이 기존 스택 내에서 해결 가능.

## Architecture Patterns

### PERF-01: 목적별 쿼리 함수 분리 패턴

**현재 문제:** `serverGetArticles()` -> `sbGetArticles()`가 body 제외 전체 컬럼, 전체 기사(4000+건)를 가져온 뒤 호출처에서 JS 필터링.

**호출처 분석 (18곳):**

| 호출처 | 실제 필요 데이터 | 목적별 함수 |
|--------|-----------------|-------------|
| `src/app/page.tsx` (홈) | 게시 기사 전체 (목록 표시) | `serverGetPublishedArticles()` |
| `src/app/api/db/articles/route.ts` (어드민) | 필터링된 기사 (페이지네이션) | PERF-02에서 처리 |
| `src/app/api/rss/route.ts` | 게시 기사 최신 N건 (title, summary, date, author, no) | `serverGetRecentArticles(n, cols)` |
| `src/app/atom.xml/route.ts` | 동일 | `serverGetRecentArticles(n, cols)` |
| `src/app/feed.json/route.ts` | 동일 | `serverGetRecentArticles(n, cols)` |
| `src/app/sitemap.xml/route.ts` | 게시 기사 (no, date, tags, author) | `serverGetArticleIds()` 또는 최소 컬럼 쿼리 |
| `src/app/reporter/[name]/page.tsx` | 특정 기자 기사 | `serverGetArticlesByReporter(name)` |
| `src/app/api/db/articles/sidebar/route.ts` | 사이드바용 최근 기사 | `serverGetRecentArticles(n)` |
| `src/app/api/cron/publish/route.ts` | 예약 상태 기사만 | `serverGetScheduledArticles()` |
| `src/app/api/cron/auto-news/route.ts` | 중복 확인용 (title) | `serverGetRecentTitles(days)` |
| `src/app/api/cron/auto-press/route.ts` | 중복 확인용 (title) | `serverGetRecentTitles(days)` |
| `src/app/api/v1/articles/route.ts` | 외부 API (필터 지원) | DB 레벨 필터링 전환 |
| `src/app/api/admin/fix-*` (3곳) | 일회성 스크립트 | 변경 불필요 (admin fix 스크립트) |
| `src/lib/db-server.ts` 내부 (3곳) | 폴백용 전체 조회 | Supabase 전용 함수로 대체 |

**추천 새 함수 (supabase-server-db.ts):**

```typescript
// 1. 게시 기사 목록 (body 제외, status=게시만)
export async function sbGetPublishedArticles(): Promise<Article[]>
// select: 현재 baseSelect 동일, 필터: status=eq.게시&deleted_at=is.null

// 2. 최신 N건 (피드/사이드바용)
export async function sbGetRecentArticles(limit: number): Promise<Article[]>
// select: 최소 컬럼, 필터: status=eq.게시, order: date.desc, limit

// 3. sitemap용 최소 데이터
export async function sbGetArticleSitemapData(): Promise<{no: number; date: string; tags: string; author: string}[]>
// select: no,date,tags,author

// 4. 예약 발행 대상
export async function sbGetScheduledArticles(): Promise<Article[]>
// select: 필요 컬럼, 필터: status=eq.예약&scheduled_publish_at=lte.{now}

// 5. 최근 N일 제목 (중복 확인용)
export async function sbGetRecentTitles(days: number): Promise<string[]>
// select: title, 필터: date>=N일 전
```

**db-server.ts 래퍼 패턴:**
```typescript
export async function serverGetPublishedArticles(): Promise<Article[]> {
  if (isSupabaseEnabled()) {
    const { sbGetPublishedArticles } = await import("@/lib/supabase-server-db");
    return await sbGetPublishedArticles();
  }
  // MySQL/file-db 폴백은 Phase 11에서 제거 예정
  const all = await serverGetArticles();
  return all.filter(a => a.status === "게시");
}
```

### PERF-02: DB 레벨 필터링 패턴

**현재 코드 (route.ts 50-74행):**
```typescript
let articles = await serverGetArticles(); // 전체 4000+건 가져옴
if (q) articles = articles.filter(a => a.title.toLowerCase().includes(q) ...);
if (category) articles = articles.filter(a => a.category === category);
if (status) articles = articles.filter(a => a.status === status);
```

**전환 방식:** Supabase REST API URL 파라미터로 필터 전달

```typescript
// supabase-server-db.ts에 새 함수
export async function sbGetFilteredArticles(opts: {
  q?: string; category?: string; status?: string;
  page?: number; limit?: number;
  includeDeleted?: boolean;
}): Promise<{ articles: Article[]; total: number }>

// Supabase REST 필터 조합:
// ?status=eq.게시
// &category=eq.문화
// &or=(title.ilike.*검색어*,author.ilike.*검색어*,tags.ilike.*검색어*)
// &order=date.desc,created_at.desc
// &limit=20&offset=0

// 총 개수는 Prefer: count=exact 헤더로 content-range 응답에서 추출
```

**Supabase REST API 필터링 문법:**
- `eq.값` : 정확히 일치
- `ilike.*값*` : 대소문자 무시 부분 일치
- `or=(조건1,조건2)` : OR 조합
- `Prefer: count=exact` 헤더 : 총 개수 반환 (페이지네이션용)

### SEC-01: Redis 전용 전환 패턴

**현재 구조 (3곳 모두 동일):**
```typescript
if (redis) {
  return redisCheckRateLimit(ip, prefix, max, window);
}
// 인메모리 폴백
const map = new Map();
// ... 복잡한 정리 로직
```

**전환 방식:** 인메모리 폴백 제거, Redis 없으면 허용(가용성 우선 - redis.ts의 기존 정책과 동일)

```typescript
// 변경 후 (인메모리 Map 코드 전체 제거)
async function checkCommentRateLimit(ip: string): Promise<boolean> {
  return redisCheckRateLimit(ip, "cp:comment:rate:", COMMENT_LIMIT, 600);
}
```

**참고:** `checkRateLimit()` in redis.ts는 이미 `if (!redis) return true` (Redis 없으면 허용)을 구현하고 있으므로, 인메모리 폴백 제거 후에도 로컬 개발에서 문제없음.

**대상 파일과 제거 범위:**

| 파일 | 변수 | 제거할 코드 (대략) |
|------|------|-------------------|
| `src/middleware.ts` | `cronRateLimitMap` | 9-30행 (Map 선언 + checkCronRateLimit 함수 내 폴백) |
| `src/app/api/db/comments/route.ts` | `commentRateMap` | 65-101행 (Map 선언 + checkCommentRateLimit 함수 내 폴백) |
| `src/app/api/auth/login/route.ts` | `memAttempts` | 43-126행 (Map 선언 + checkRateLimit/recordFailure/clearAttempts 내 폴백) |

**login/route.ts 특수사항:** `memAttempts`는 단순 카운트가 아닌 잠금(lockedUntil) 기능 포함. Redis 전환 시 기존 Redis 키 구조(`cp:login:attempts:{ip}`, `cp:login:lock:{ip}`)가 이미 구현되어 있어 인메모리 분기만 제거하면 됨.

### SEC-02: Cookie secure 플래그 하드코딩 패턴

**현재 코드 (login/route.ts):**
```typescript
secure: process.env.NODE_ENV === "production",  // 3곳
```

**변경:**
```typescript
secure: true,  // 환경 무관 항상 secure
```

**주의사항:** localhost 개발 시 HTTPS 없으면 쿠키가 전송되지 않음. 그러나:
- Vercel 배포 환경(프로덕션)에서는 항상 HTTPS
- 로컬 개발은 `pnpm dev`로 HTTP지만, `NODE_ENV=development`에서도 secure: true 설정하면 localhost는 예외적으로 쿠키 전송됨 (대부분의 최신 브라우저에서 localhost를 secure context로 취급)
- Chrome, Firefox, Edge 모두 localhost를 potentially trustworthy origin으로 분류

### CLEAN-01: Temp 파일 정리 패턴

**현재 상태:**
- `.gitignore`에 패턴 이미 존재: `temp_*.html`, `temp_*.txt`, `tmp_*.html`, `nul`, `cookies.txt`, `*_tmp.json`
- 루트에 파일 7개 남아있음 (git에서 이미 추적 중이므로 .gitignore만으로는 제거 안됨)

**작업:**
```bash
# git에서 추적 해제 + 파일 삭제
git rm --cached temp_*.html tmp_*.html cookies.txt nul 2>/dev/null
rm -f temp_*.html tmp_*.html cookies.txt nul

# .gitignore 확인 (이미 패턴 존재하므로 추가 불필요)
```

**추가 확인 필요:** `D*UsersDocuments*` 패턴이 .gitignore에 있는데 이것은 Windows 경로 잔재. 루트에 해당 파일 있는지 확인하고 있으면 함께 삭제.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Rate Limiting | 인메모리 Map + 정리 로직 | Upstash Redis `checkRateLimit()` | 서버리스 인스턴스 간 일관성, 콜드스타트 후 상태 유지 |
| DB 필터링 | JS Array.filter() | Supabase PostgREST 필터 파라미터 | 4000+건 네트워크 전송 vs DB 레벨 필터 |
| 페이지네이션 카운트 | articles.length | `Prefer: count=exact` 헤더 | 전체 조회 없이 총 개수 확인 |

## Common Pitfalls

### Pitfall 1: Supabase REST 1000행 제한
**What goes wrong:** Supabase REST API는 기본 1000행까지만 반환
**Why it happens:** PostgREST 기본 설정
**How to avoid:** 전체 조회가 필요한 경우(sitemap 등) 기존 페이지네이션 패턴 유지. 목적별 쿼리는 limit 파라미터로 필요한 만큼만 요청
**Warning signs:** 기사 1000건 이상에서 데이터 누락

### Pitfall 2: Supabase OR 필터 URL 인코딩
**What goes wrong:** `or=(title.ilike.*검색어*,tags.ilike.*검색어*)` 에서 한글/특수문자가 깨짐
**Why it happens:** URL 인코딩 미적용
**How to avoid:** 각 값에 `encodeURIComponent()` 적용, `*` 와일드카드는 인코딩하지 않도록 주의
**Warning signs:** 한글 검색어로 필터링 시 결과 없음

### Pitfall 3: Redis 미연결 시 서비스 중단
**What goes wrong:** Redis 없는 환경(로컬 개발)에서 rate limit 차단
**Why it happens:** 인메모리 폴백 제거 후 Redis 미연결 처리 누락
**How to avoid:** redis.ts의 `checkRateLimit()`이 이미 `if (!redis) return true` 패턴 사용. 이 패턴을 유지하면 안전
**Warning signs:** 로컬 개발에서 403 응답

### Pitfall 4: Cookie secure + localhost
**What goes wrong:** 로컬 개발에서 로그인 불가
**Why it happens:** secure: true 쿠키는 HTTPS에서만 전송
**How to avoid:** 최신 브라우저는 localhost를 secure context로 취급하므로 대부분 문제없음. 만약 문제 발생 시 `__Secure-` prefix 없이 `secure: true`만 설정하면 localhost에서도 동작
**Warning signs:** 로컬에서 로그인 후 인증 유지 안됨

### Pitfall 5: Prefer: count=exact 성능
**What goes wrong:** 대량 테이블에서 count=exact가 느림
**Why it happens:** PostgreSQL이 전체 행 수를 세야 함
**How to avoid:** 4000건 수준에서는 문제없음. 향후 10만건+ 시 `count=estimated` 고려
**Warning signs:** 어드민 목록 로드 시간 증가

## Code Examples

### Supabase REST 필터링 쿼리 (PERF-02용)
```typescript
// Source: 기존 supabase-server-db.ts sbGetArticlesByCategory 패턴 참조
export async function sbGetFilteredArticles(opts: {
  q?: string; category?: string; status?: string;
  page?: number; limit?: number;
}): Promise<{ articles: Article[]; total: number }> {
  const select = "id,no,title,category,date,status,views,thumbnail,thumbnail_alt,tags,author,author_email,summary,slug,updated_at,created_at,source_url";
  const filters: string[] = [];
  
  if (opts.status) filters.push(`status=eq.${encodeURIComponent(opts.status)}`);
  if (opts.category) filters.push(`category=eq.${encodeURIComponent(opts.category)}`);
  if (opts.q) {
    const encoded = encodeURIComponent(`*${opts.q}*`);
    filters.push(`or=(title.ilike.${encoded},author.ilike.${encoded},tags.ilike.${encoded})`);
  }
  
  const limit = opts.limit || 20;
  const offset = ((opts.page || 1) - 1) * limit;
  const filterStr = filters.length ? `&${filters.join("&")}` : "";
  
  const url = `${BASE_URL}/rest/v1/articles?select=${select}${filterStr}&order=date.desc,created_at.desc&limit=${limit}&offset=${offset}`;
  const res = await fetch(url, {
    headers: { ...getHeaders(false), "Prefer": "count=exact" },
    cache: "no-store",
  });
  
  // content-range 헤더에서 총 개수 추출: "0-19/4235"
  const range = res.headers.get("content-range");
  const total = range ? parseInt(range.split("/")[1]) : 0;
  const rows = (await res.json()) as Record<string, unknown>[];
  return { articles: rows.map(r => rowToArticle(r, false)), total };
}
```

### Redis rate limit 전환 (SEC-01용)
```typescript
// comments/route.ts - 변경 후
import { checkRateLimit as redisCheckRateLimit } from "@/lib/redis";

const COMMENT_LIMIT = 5;

async function checkCommentRateLimit(ip: string): Promise<boolean> {
  const allowed = await redisCheckRateLimit(ip, "cp:comment:rate:", COMMENT_LIMIT, 600);
  if (!allowed) {
    console.warn(`[security] 댓글 Rate Limit 초과: ip=${ip.slice(0, 8)}***`);
  }
  return allowed;
}
// commentRateMap, lastRateCleanup 변수 전체 삭제
```

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | 없음 (Phase 13에서 도입 예정) |
| Config file | 없음 |
| Quick run command | N/A |
| Full suite command | N/A |

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| PERF-01 | 목적별 쿼리가 필요한 컬럼만 조회 | manual | Supabase 쿼리 로그 확인 / 응답 크기 비교 | N/A |
| PERF-02 | 어드민 필터링이 DB 레벨 처리 | manual | `/api/db/articles?q=test&category=문화&status=게시` 호출 확인 | N/A |
| SEC-01 | 인메모리 rate limit 코드 제거 확인 | manual | `grep -r "commentRateMap\|cronRateLimitMap\|memAttempts" src/` 결과 0건 | N/A |
| SEC-02 | Cookie secure: true 하드코딩 확인 | manual | `grep "secure: process.env" src/` 결과 0건 | N/A |
| CLEAN-01 | temp 파일 없음 확인 | manual | `ls temp_* tmp_* cookies.txt nul 2>/dev/null` 결과 0건 | N/A |

### Sampling Rate
- **Per task commit:** `pnpm build` (빌드 성공 여부)
- **Per wave merge:** 수동 검증 (위 매뉴얼 테스트)
- **Phase gate:** 빌드 성공 + 5개 Success Criteria 수동 확인

### Wave 0 Gaps
None - 테스트 프레임워크는 Phase 13 범위. 이 페이즈는 빌드 성공 + grep 검증으로 충분.

## Open Questions

1. **홈 페이지의 serverGetArticles() 사용 범위**
   - What we know: 홈 페이지가 `articles` 전체를 컴포넌트에 전달하여 클라이언트 사이드에서 카테고리별 분류/정렬 수행
   - What's unclear: 홈 컴포넌트가 실제로 사용하는 최대 기사 수 (전체 4000+건이 필요한지, 최근 100건이면 충분한지)
   - Recommendation: 홈 컴포넌트(CulturePeopleLanding, InsightKoreaLanding) 내부를 확인하여 필요 기사 수 파악 후 limit 적용. 실행 시 확인.

2. **auto-press/auto-news의 중복 확인 범위**
   - What we know: `serverGetArticles()` 호출 후 기존 제목과 비교하여 중복 방지
   - What's unclear: 최근 며칠치만 비교하면 충분한지
   - Recommendation: 최근 30일이면 충분할 가능성 높음. 실행 시 기존 로직 분석 후 결정.

## Sources

### Primary (HIGH confidence)
- 프로젝트 소스코드 직접 분석: src/lib/db-server.ts, src/lib/supabase-server-db.ts, src/lib/redis.ts
- 프로젝트 소스코드 직접 분석: src/app/api/auth/login/route.ts, src/middleware.ts, src/app/api/db/comments/route.ts
- 프로젝트 소스코드 직접 분석: src/app/api/db/articles/route.ts, src/app/page.tsx
- .gitignore 현재 상태 확인

### Secondary (MEDIUM confidence)
- Supabase PostgREST 필터 문법 (기존 코드에서 패턴 확인됨 - sbGetArticlesByCategory, sbGetArticlesByTag)
- Chrome/Firefox localhost secure context 정책 (널리 알려진 사실)

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - 신규 라이브러리 없음, 기존 스택 활용
- Architecture: HIGH - 기존 코드 패턴(sbGetArticlesByCategory 등)을 확장하는 방식
- Pitfalls: HIGH - 기존 코드에서 이미 해결한 패턴(1000행 페이지네이션 등) 참조

**Research date:** 2026-04-01
**Valid until:** 2026-05-01 (안정적 기존 스택, 변동 없음)
