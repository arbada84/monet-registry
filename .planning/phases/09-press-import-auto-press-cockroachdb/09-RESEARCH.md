# Phase 9: press-import/auto-press CockroachDB 통합 연동 - Research

**연구 일자:** 2026-03-27
**도메인:** CockroachDB press_feeds 테이블 + Next.js API 라우트 통합
**신뢰도:** HIGH

## 요약

CockroachDB에 이미 `press_feeds` 테이블이 존재하며, `scripts/crawl-newswire.mjs` 크롤러가 뉴스와이어 보도자료를 수집하여 저장하고 있다. 현재 `/api/press-feed`와 `auto-press`는 각각 독립적으로 RSS를 실시간 파싱하는데, 이를 CockroachDB `press_feeds` 테이블을 공통 데이터 소스로 전환해야 한다.

`pg` 모듈(v8.20.0)이 이미 설치되어 있고, `.env.local`에 `COCKROACH_DATABASE_URL`이 설정되어 있다. `docs/cockroachdb-guide.md`에 싱글톤 Pool 패턴이 문서화되어 있어 `src/lib/cockroach-db.ts` 공통 레이어를 이 패턴 기반으로 생성하면 된다. 현재 `src/` 내에는 CockroachDB 관련 코드가 전혀 없으므로 신규 생성이다.

**핵심 권장사항:** `src/lib/cockroach-db.ts`에 싱글톤 Pool + press_feeds CRUD 함수를 구현하고, `/api/press-feed`와 `auto-press`가 이 모듈을 공유하도록 통합한다.

## Standard Stack

### Core
| 라이브러리 | 버전 | 용도 | 사유 |
|---------|---------|---------|--------------|
| pg | 8.20.0 | CockroachDB 연결 (PostgreSQL 호환) | 이미 설치됨, cockroachdb-guide.md 공식 패턴 |

### Supporting
| 라이브러리 | 버전 | 용도 | 사용 시점 |
|---------|---------|---------|-------------|
| @types/pg | (설치 필요 여부 확인) | TypeScript 타입 지원 | cockroach-db.ts 작성 시 |

**설치:**
- `pg`는 이미 `package.json`에 `^8.20.0`으로 존재
- `@types/pg`가 없으면 추가 필요: `pnpm add -D @types/pg`

## 아키텍처 패턴

### 현재 구조 (변경 전)

```
press-import/page.tsx
  └─ fetch("/api/press-feed?tab=rss|newswire")
       └─ /api/press-feed/route.ts → 실시간 RSS 파싱 (korea.kr / newswire RSS)
  └─ fetch("/api/press-feed/detail?url=...")
       └─ /api/press-feed/detail/route.ts → 원문 HTML 직접 추출

auto-press/route.ts
  └─ fetchRssFeed() → 실시간 RSS 파싱
  └─ fetchOriginContent() → 원문 HTML 직접 추출
  └─ AI 편집 → serverCreateArticle()
```

### 목표 구조 (변경 후)

```
src/lib/cockroach-db.ts          ← 신규: 공통 DB 레이어
  ├─ getPool(): Pool              (싱글톤)
  ├─ getPressFeeds(options)       (목록 조회 + 필터/페이지네이션)
  ├─ getPressFeedById(id)        (단건 조회)
  ├─ getUnregisteredFeeds(opts)  (registered=false 미등록 건 조회)
  ├─ markAsRegistered(id, articleId)  (등록 완료 표시)
  └─ searchPressFeeds(query)     (검색)

/api/press-feed/route.ts         ← 변경: RSS 파싱 → CockroachDB 조회
  └─ getPressFeeds({ tab, page, sca, stx })

auto-press/route.ts              ← 변경: RSS 파싱 → getUnregisteredFeeds()
  └─ getUnregisteredFeeds({ keywords, dateRange, count })
  └─ (기존) AI 편집 → serverCreateArticle()
  └─ markAsRegistered(feedId, articleId)  ← 신규

/api/press-feed/detail/route.ts  ← 변경: CockroachDB body_html 우선 반환
  └─ getPressFeedById(id) → body_html 있으면 반환
  └─ (fallback) 원문 HTML 직접 추출 (기존 로직 유지)
```

### 패턴 1: 싱글톤 Pool (cockroachdb-guide.md 기반)

**무엇:** Vercel 서버리스 환경에서 커넥션 폭발 방지
**사용 시점:** 모든 CockroachDB 접근
**예시:**
```typescript
// src/lib/cockroach-db.ts
import { Pool } from "pg";

let pool: Pool | null = null;

export function getPool(): Pool {
  if (!pool) {
    pool = new Pool({
      connectionString: process.env.COCKROACH_DATABASE_URL,
      ssl: { rejectUnauthorized: false },
      max: 5,
      idleTimeoutMillis: 20_000,
      connectionTimeoutMillis: 10_000,
    });
    pool.on("error", () => { pool = null; });
  }
  return pool;
}
```

### 패턴 2: press_feeds 조회 함수 인터페이스

```typescript
interface PressFeed {
  id: string;           // UUID
  source: string;       // "newswire"
  source_no: number;
  title: string;
  url: string;
  date: string | null;
  category: string | null;
  company: string | null;
  summary: string | null;
  body_html: string | null;
  thumbnail: string | null;
  images: string[];     // JSON 배열
  tags: string[];       // JSON 배열
  crawled_at: string;
  registered: boolean;
  article_id: string | null;
}

interface GetPressFeedsOptions {
  source?: string;       // "newswire" 필터
  category?: string;
  search?: string;       // 제목 ILIKE 검색
  page?: number;
  pageSize?: number;
  registeredOnly?: boolean;
  unregisteredOnly?: boolean;
}
```

### 안티패턴 금지
- **매번 new Pool() 생성 금지:** 서버리스 환경에서 커넥션 폭발 → 반드시 싱글톤
- **ssl: true 금지:** CockroachDB Cloud에서 `{ rejectUnauthorized: false }` 필수
- **문자열 보간 SQL 금지:** 반드시 파라미터 바인딩 ($1, $2...) 사용

## 직접 구현 금지 (Don't Hand-Roll)

| 문제 | 직접 만들지 말 것 | 대신 사용 | 이유 |
|---------|-------------|-------------|-----|
| DB 커넥션 풀 | 커스텀 풀 매니저 | pg Pool 싱글톤 | 검증된 패턴, cockroachdb-guide.md 참조 |
| SQL 인젝션 방어 | 수동 이스케이프 | pg 파라미터 바인딩 ($1) | 이미 프로젝트 규약 |
| RSS 파싱 | 새로운 파서 | 기존 parseRssXml 유지 | 크롤러가 DB에 저장하므로 API에서는 불필요 |

## 현재 코드 상세 분석

### 1. /api/press-feed/route.ts (259줄)

**핵심 동작:**
- 인증 확인 후 `tab` (rss/newswire), `page`, `sca` (카테고리), `stx` (검색) 파라미터 처리
- RSS_FEEDS (정부 korea.kr 약 50개 URL), NEWSWIRE_FEEDS (20개 URL) 매핑 보유
- `fetchRssFeed(url)` → 실시간 RSS XML 파싱 → RssItem 배열 반환
- 검색어 필터 → 페이지네이션(20건) → FeedItem 형태 변환 반환

**교체 지점:**
- `fetchRssFeed(feedUrl)` 호출 부분 → `getPressFeeds()` CockroachDB 조회로 교체
- 반환 형태(items, total, lastPage, page)는 유지해야 함 (press-import/page.tsx 호환)
- **주의:** 현재 정부 보도자료(korea.kr)는 CockroachDB에 없음. 뉴스와이어만 저장됨.
  - 정부 보도자료 탭은 기존 RSS 로직 유지하거나, 별도 크롤러 추가 필요
  - 이 페이즈에서는 뉴스와이어(newswire) 탭만 CockroachDB 전환이 가능

**FeedItem 반환 형태 (press-import/page.tsx 호환):**
```typescript
{
  wr_id: string,         // press_feeds.id 또는 URL 기반 base64
  title: string,
  category: string,
  writer: string,        // company 필드 매핑
  date: string,          // YYYY-MM-DD
  hits: string,
  detail_url: string,    // press_feeds.url
  description: string,   // press_feeds.summary
  _index: number
}
```

### 2. /api/cron/auto-press/route.ts (약 540줄)

**핵심 동작:**
- 인증(CRON_SECRET 또는 쿠키) → 설정 로드 → 활성 RSS 소스 수집
- `fetchRssFeed(url, maxItems)` → RssItem 배열 → 키워드 필터 → 중복 체크
- `fetchOriginContent(baseUrl, articleUrl)` → 원문 HTML 추출
- AI 편집 → 이미지 재업로드 → `serverCreateArticle()` 저장
- 50초 타임아웃 안전 마진 (Vercel 60초 제한)

**교체 지점:**
- `fetchRssFeed()` 호출 → `getUnregisteredFeeds()` CockroachDB 조회로 교체
- 원문 추출(`fetchOriginContent`)은 press_feeds에 `body_html`이 있으면 불필요
- 기사 등록 후 `markAsRegistered(feedId, articleId)` 호출 추가
- **주의:** auto-press의 RSS 소스 설정(`settings.sources`)에는 정부 보도자료 소스도 포함
  - 뉴스와이어 소스만 CockroachDB에서 가져오고, 나머지는 기존 RSS 로직 유지

### 3. /api/press-feed/detail/route.ts (117줄)

**핵심 동작:**
- `url` 파라미터로 원문 HTML 직접 fetch → 뉴스와이어 전용 파서 또는 범용 추출
- SSRF 방어 포함

**교체 지점:**
- CockroachDB에 `body_html`이 저장되어 있으므로, press_feeds.id 또는 url로 DB 조회 우선
- DB에 body_html이 없거나 빈 경우에만 기존 원문 fetch 로직 fallback

### 4. press-import/page.tsx (클라이언트)

**핵심 동작:**
- `/api/press-feed?tab=...&page=...&sca=...&stx=...` 호출
- `/api/press-feed/detail?url=...` 호출
- `/api/db/articles` POST로 임시저장 생성
- `importedIds`를 localStorage로 관리 (중복 방지)

**변경 불필요:**
- API 응답 형태만 동일하면 프런트엔드 변경 없음
- 단, CockroachDB의 `registered` 플래그를 활용하면 localStorage 대신 서버 기반 중복 관리 가능 (선택사항)

### 5. scripts/crawl-newswire.mjs (크롤러)

**현재 상태:**
- 뉴스와이어 목록/상세 페이지를 크롤링하여 CockroachDB에 저장
- INSERT 필드: source, source_no, title, url, date, category, company, summary, body_html, thumbnail, images, tags
- `ON CONFLICT (url) DO NOTHING` — URL 기준 중복 방지
- `registered`, `article_id` 필드는 INSERT에 포함되지 않음 (DEFAULT 값 사용)

**press_feeds 테이블 스키마 (크롤러 INSERT 기준 추정):**
```sql
CREATE TABLE press_feeds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source STRING NOT NULL,           -- "newswire"
  source_no INT,                     -- 뉴스와이어 고유번호
  title STRING NOT NULL,
  url STRING NOT NULL UNIQUE,
  date STRING,                       -- "YYYY-MM-DD"
  category STRING,
  company STRING,
  summary STRING,
  body_html STRING,
  thumbnail STRING,
  images JSONB,                      -- ["url1", "url2"]
  tags JSONB,                        -- ["tag1", "tag2"]
  crawled_at TIMESTAMPTZ DEFAULT now(),
  registered BOOL DEFAULT false,
  article_id STRING                  -- 등록된 기사 ID
);
```

## Common Pitfalls

### 함정 1: 정부 보도자료(korea.kr)가 CockroachDB에 없음

**문제:** press_feeds 테이블에는 뉴스와이어만 저장됨. press-import의 "rss" 탭(정부 보도자료)은 CockroachDB로 전환 불가.
**원인:** 크롤러(`crawl-newswire.mjs`)가 뉴스와이어만 수집
**회피 방법:** 뉴스와이어 탭만 CockroachDB 전환. 정부 보도자료 탭은 기존 RSS 로직 유지.
**경고 신호:** "전체 전환"이라고 가정하면 정부 보도자료 탭이 빈 목록 반환

### 함정 2: 서버리스 커넥션 폭발

**문제:** Vercel 서버리스에서 API 호출마다 new Pool() 생성 시 커넥션 수 급증
**원인:** 서버리스 함수는 cold start마다 새 인스턴스 생성
**회피 방법:** 싱글톤 패턴 필수 (cockroachdb-guide.md 참조), max: 5
**경고 신호:** "too many clients" 에러

### 함정 3: images/tags 필드가 JSON 문자열

**문제:** 크롤러가 `JSON.stringify(item.images)` 형태로 저장. 조회 시 파싱 필요.
**원인:** JSONB 컬럼이지만 문자열로 INSERT
**회피 방법:** 조회 시 `typeof row.images === 'string' ? JSON.parse(row.images) : row.images` 안전 파싱

### 함정 4: auto-press 50초 타임아웃

**문제:** auto-press는 Vercel 60초 제한으로 50초 안전 마진 적용. DB 조회가 추가되면 시간 예산 감소.
**원인:** CockroachDB 네트워크 지연 (AWS AP-Southeast-1 리전)
**회피 방법:** DB 조회는 빠르므로(~100ms) 큰 문제 없지만, LIMIT 적용 필수

### 함정 5: Vercel 환경변수 미설정

**문제:** `.env.local`에는 `COCKROACH_DATABASE_URL`이 있지만 Vercel에 미설정 시 배포 후 실패
**회피 방법:** 반드시 Vercel Settings > Environment Variables에 추가

## 코드 예시

### CockroachDB 공통 레이어 (src/lib/cockroach-db.ts)

```typescript
// Source: docs/cockroachdb-guide.md 싱글톤 패턴 기반
import { Pool } from "pg";

let pool: Pool | null = null;

export function getPool(): Pool {
  if (!pool) {
    pool = new Pool({
      connectionString: process.env.COCKROACH_DATABASE_URL,
      ssl: { rejectUnauthorized: false },
      max: 5,
      idleTimeoutMillis: 20_000,
      connectionTimeoutMillis: 10_000,
    });
    pool.on("error", () => { pool = null; });
  }
  return pool;
}

export interface PressFeed {
  id: string;
  source: string;
  source_no: number;
  title: string;
  url: string;
  date: string | null;
  category: string | null;
  company: string | null;
  summary: string | null;
  body_html: string | null;
  thumbnail: string | null;
  images: string[];
  tags: string[];
  crawled_at: string;
  registered: boolean;
  article_id: string | null;
}

// 목록 조회 (press-import용)
export async function getPressFeeds(options: {
  source?: string;
  category?: string;
  search?: string;
  page?: number;
  pageSize?: number;
}): Promise<{ items: PressFeed[]; total: number }> {
  const { source, category, search, page = 1, pageSize = 20 } = options;
  const conditions: string[] = [];
  const values: (string | number)[] = [];
  let idx = 1;

  if (source) { conditions.push(`source = $${idx++}`); values.push(source); }
  if (category) { conditions.push(`category = $${idx++}`); values.push(category); }
  if (search) { conditions.push(`title ILIKE $${idx++}`); values.push(`%${search}%`); }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
  const offset = (page - 1) * pageSize;

  const countResult = await getPool().query(`SELECT COUNT(*) FROM press_feeds ${where}`, values);
  const total = parseInt(countResult.rows[0].count);

  values.push(pageSize, offset);
  const dataResult = await getPool().query(
    `SELECT * FROM press_feeds ${where} ORDER BY crawled_at DESC LIMIT $${idx++} OFFSET $${idx++}`,
    values
  );

  return { items: dataResult.rows.map(parsePressFeedRow), total };
}

// 미등록 건 조회 (auto-press용)
export async function getUnregisteredFeeds(options: {
  keywords?: string[];
  dateFrom?: string;
  limit?: number;
}): Promise<PressFeed[]> {
  const { keywords, dateFrom, limit = 20 } = options;
  const conditions: string[] = ["registered = false"];
  const values: (string | number)[] = [];
  let idx = 1;

  if (dateFrom) { conditions.push(`date >= $${idx++}`); values.push(dateFrom); }
  if (keywords && keywords.length > 0) {
    const kwConditions = keywords.map(() => `title ILIKE $${idx++}`);
    conditions.push(`(${kwConditions.join(" OR ")})`);
    values.push(...keywords.map(kw => `%${kw}%`));
  }

  const where = `WHERE ${conditions.join(" AND ")}`;
  values.push(limit);

  const result = await getPool().query(
    `SELECT * FROM press_feeds ${where} ORDER BY crawled_at DESC LIMIT $${idx}`,
    values
  );
  return result.rows.map(parsePressFeedRow);
}

// 등록 완료 표시
export async function markAsRegistered(feedId: string, articleId: string): Promise<void> {
  await getPool().query(
    "UPDATE press_feeds SET registered = true, article_id = $1 WHERE id = $2",
    [articleId, feedId]
  );
}

// 단건 조회 (detail API용)
export async function getPressFeedByUrl(url: string): Promise<PressFeed | null> {
  const result = await getPool().query("SELECT * FROM press_feeds WHERE url = $1 LIMIT 1", [url]);
  return result.rows.length > 0 ? parsePressFeedRow(result.rows[0]) : null;
}

function parsePressFeedRow(row: Record<string, unknown>): PressFeed {
  return {
    ...row,
    images: typeof row.images === "string" ? JSON.parse(row.images) : (row.images || []),
    tags: typeof row.tags === "string" ? JSON.parse(row.tags) : (row.tags || []),
  } as PressFeed;
}
```

### /api/press-feed/route.ts 변경 패턴

```typescript
// newswire 탭: CockroachDB 조회
if (tab === "newswire") {
  const { items: feeds, total } = await getPressFeeds({
    source: "newswire",
    category: sca || undefined,
    search: stx || undefined,
    page: pageNum,
    pageSize: PAGE_SIZE,
  });
  // FeedItem 형태로 변환
  const items = feeds.map((feed, idx) => ({
    wr_id: feed.id,
    title: feed.title,
    category: feed.category || "",
    writer: feed.company || "뉴스와이어",
    date: feed.date || "",
    hits: "",
    detail_url: feed.url,
    description: feed.summary || "",
    _index: (pageNum - 1) * PAGE_SIZE + idx + 1,
  }));
  return NextResponse.json({ success: true, items, total, lastPage: Math.max(1, Math.ceil(total / PAGE_SIZE)), page: pageNum });
}
// rss 탭: 기존 RSS 파싱 로직 유지
```

## 환경 가용성

| 의존성 | 필요 이유 | 사용 가능 | 버전 | 대체 방안 |
|--------|-----------|-----------|------|-----------|
| pg | CockroachDB 연결 | O | 8.20.0 (package.json) | -- |
| CockroachDB Cloud | press_feeds 데이터 | O | (클라우드 서비스) | -- |
| COCKROACH_DATABASE_URL | 연결 문자열 | O (.env.local) | -- | Vercel에도 설정 필요 |

**누락 의존성 (차단):**
- Vercel 환경변수에 `COCKROACH_DATABASE_URL` 추가 필요 (로컬에만 존재)

**누락 의존성 (대체 가능):**
- `@types/pg` — 미확인, 없으면 설치 필요 (pnpm add -D @types/pg)

## 검증 아키텍처

### 테스트 프레임워크
| 속성 | 값 |
|------|-------|
| 프레임워크 | 수동 검증 (기존 테스트 프레임워크 미확인) |
| 빠른 실행 | `pnpm dev` + 브라우저 수동 확인 |
| 전체 검증 | `pnpm build` + `vercel deploy --prod` |

### 페이즈 요구사항 -> 테스트 맵
| 요구사항 ID | 동작 | 테스트 유형 | 자동화 명령 | 파일 존재? |
|--------|----------|-----------|-------------------|-------------|
| P9-01 | cockroach-db.ts 모듈이 CockroachDB에 연결되어 press_feeds 조회 | smoke | curl /api/press-feed?tab=newswire | 해당 없음 |
| P9-02 | press-import 뉴스와이어 탭이 DB 데이터 표시 | manual | 브라우저 확인 | 해당 없음 |
| P9-03 | auto-press가 미등록 건을 DB에서 가져와 처리 | manual | POST /api/cron/auto-press + DB 확인 | 해당 없음 |
| P9-04 | 기사 등록 후 registered=true 업데이트 | manual | DB 직접 확인 | 해당 없음 |
| P9-05 | detail API가 DB body_html 우선 반환 | smoke | curl /api/press-feed/detail?url=... | 해당 없음 |

### 샘플링 비율
- **태스크 커밋당:** `pnpm build` (타입 에러 검출)
- **웨이브 완료당:** `vercel deploy --prod` + 수동 검증
- **페이즈 게이트:** press-import 뉴스와이어 탭 + auto-press 수동 실행 확인

### Wave 0 갭
- [ ] `@types/pg` 설치 확인 — TypeScript 빌드 지원
- [ ] Vercel 환경변수 `COCKROACH_DATABASE_URL` 등록
- [ ] press_feeds 테이블 스키마 실제 확인 (registered, article_id 컬럼 존재 여부)

## 주요 설계 결정 사항

### 결정 1: 뉴스와이어만 CockroachDB 전환

정부 보도자료(korea.kr)는 CockroachDB에 데이터가 없으므로 기존 RSS 로직 유지. 뉴스와이어 탭만 DB 조회로 전환.

### 결정 2: detail API에서 DB 우선 조회

press_feeds에 body_html이 있으면 원문 fetch 없이 바로 반환. body_html이 비어있을 때만 기존 원문 추출 로직 fallback.

### 결정 3: auto-press에서 RSS + DB 하이브리드

auto-press의 활성 소스 중 뉴스와이어 소스는 CockroachDB에서 미등록 건 조회, 나머지 소스(정부 보도자료 등)는 기존 RSS 수집 유지.

### 결정 4: registered 플래그로 상태 관리

기사 등록 완료 시 `markAsRegistered(feedId, articleId)` 호출. auto-press 중복 체크에 활용.

## 미해결 질문

1. **press_feeds 테이블 실제 스키마**
   - 알고 있는 것: INSERT 문 기반 추정 (크롤러 코드에서)
   - 불확실한 점: registered, article_id 컬럼이 실제 존재하는지, 인덱스 현황
   - 권장: 구현 전 `\d press_feeds` 또는 Supabase MCP가 아닌 CockroachDB 직접 쿼리로 확인

2. **뉴스와이어 카테고리 매핑**
   - 알고 있는 것: NEWSWIRE_FEEDS는 산업코드(100~1900) 기반, press_feeds.category는 한글 카테고리명
   - 불확실한 점: 매핑이 정확히 일치하는지
   - 권장: DB 내 distinct category 값 확인 후 매핑 테이블 작성

3. **@types/pg 설치 여부**
   - package.json에서 확인 불가 → 실제 설치 여부 확인 필요

## Sources

### Primary (HIGH 신뢰도)
- `docs/cockroachdb-guide.md` — 싱글톤 패턴, SSL 설정, 서버리스 주의사항
- `scripts/crawl-newswire.mjs` — press_feeds 테이블 스키마 및 INSERT 패턴
- `src/app/api/press-feed/route.ts` — 현재 RSS 파싱 구조
- `src/app/api/cron/auto-press/route.ts` — 현재 auto-press 전체 로직
- `src/app/cam/press-import/page.tsx` — 프런트엔드 API 호출 패턴
- `src/app/api/press-feed/detail/route.ts` — 원문 추출 API
- `.env.local` — COCKROACH_DATABASE_URL 환경변수 확인

## 메타데이터

**신뢰도 분석:**
- Standard Stack: HIGH — pg 이미 설치됨, cockroachdb-guide.md 검증 완료
- Architecture: HIGH — 현재 코드 전수 분석 완료, 교체 지점 명확
- Pitfalls: HIGH — 정부 보도자료 미포함 이슈 등 실제 코드 기반 발견

**연구 일자:** 2026-03-27
**유효 기간:** 30일 (안정적 스택)
