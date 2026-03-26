# Phase 2: 공개 페이지 - Research

**Researched:** 2026-03-26
**Domain:** Next.js 15 App Router 공개 페이지 감사 (brownfield audit)
**Confidence:** HIGH

## Summary

5개 공개 페이지(홈, 기사 상세, 카테고리, 태그, 검색)에 대한 코드 감사를 수행했다. TypeScript 컴파일 에러는 없으며, 핵심 데이터 흐름(Supabase -> db-server.ts -> 페이지)은 정상 동작한다. 그러나 몇 가지 **성능 문제**, **미사용 변수**, **하드코딩된 테마 색상** 문제가 발견되었다.

가장 큰 문제는 (1) 홈페이지와 카테고리 페이지에서 `serverGetArticles()`가 전체 기사(~3000건, 삭제 포함)를 가져오고 클라이언트에서 필터링하는 점, (2) 태그 페이지의 하드코딩된 accent 색상이 테마별로 적용되지 않는 점이다.

**Primary recommendation:** 성능 이슈(전체 기사 로드)와 태그 페이지 테마 색상 하드코딩을 우선 수정한다.

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| PUB-01 | 홈페이지 렌더링 | 홈페이지는 3개 테마 모두 정상 렌더링. 성능 이슈(전체 기사 로드) 발견 |
| PUB-02 | 기사 상세 | 기사 상세 페이지 정상. UUID->no 리다이렉트, 조회수 트래킹, 댓글, 사이드바 모두 동작 |
| PUB-03 | 카테고리 | 카테고리 페이지 정상. 불필요한 allArticles 로드 성능 이슈 발견 |
| PUB-04 | 태그 | 태그 페이지 렌더링 정상이나 accent 변수 미사용, 하드코딩 색상 잔존 |
| PUB-05 | 검색+페이지네이션 | 검색 정상. 페이지네이션+뒤로가기 지원. sort 기본값 비교 로직 약간 비직관적 |
</phase_requirements>

## Project Constraints (from CLAUDE.md)

- 모든 설명/안내/출력은 한글로 작성
- 사이트 코드 변경 시 반드시 `vercel deploy --prod` 실행
- Next.js 15.5.14 App Router, pnpm 9.12.2
- Supabase DB, `images.unoptimized: true`
- ISR `revalidate = 3600`

## Audit Findings: Bugs and Issues

### BUG-01: 홈페이지 전체 기사 로드 (성능) [MEDIUM]

**파일:** `src/app/page.tsx` -> `serverGetArticles()` -> `sbGetArticles()`

**문제:** `sbGetArticles()`는 상태 필터 없이 전체 기사(~3000건)를 페이지네이션 루프로 가져온다. 삭제되지 않은 기사만 코드 레벨에서 필터링한다. 홈페이지는 최신 기사 몇십 건만 필요하지만, 3000건 전체를 서버에서 페치 후 클라이언트 컴포넌트로 전달한다.

**영향:**
- Supabase에 3~4회 HTTP 요청 (1000건씩 페이지네이션)
- 서버 -> 클라이언트 직렬화 데이터 크기 증가
- ISR 캐싱이 있어 실제 사용자 응답에는 큰 영향 없지만, ISR 재생성 시 느림

**권장 수정:** `sbGetArticles()`에 `status=eq.게시` 필터와 `limit` 파라미터를 추가하거나, 홈페이지 전용 함수 추가. 단, 기존 코드의 다른 호출처(관리자 페이지, sitemap 등)에 영향을 주지 않도록 주의.

**수정 난이도:** 중 (다른 호출처 영향 분석 필요)

---

### BUG-02: 카테고리 페이지 불필요한 allArticles 로드 [MEDIUM]

**파일:** `src/app/category/[slug]/page.tsx:79`

```typescript
const allArticles = (siteType === "insightkorea" || siteType === "culturepeople")
  ? await serverGetArticles() : [];
```

**문제:** 카테고리 페이지에서 이미 `serverGetArticlesByCategory(categoryName)`로 해당 카테고리 기사를 가져왔는데, 테마 컴포넌트에 `allArticles` (전체 기사 ~3000건)를 추가로 전달한다. 테마 컴포넌트에서 사이드바용 "최신 기사" 등에 사용하는 것으로 보이나, 전체 기사 로드는 과도하다.

**영향:** 카테고리 페이지 ISR 재생성 시 Supabase 3~4회 추가 호출

**권장 수정:** `allArticles` 대신 `serverGetTopArticles(10)` 등으로 필요한 데이터만 조회

---

### BUG-03: 태그 페이지 accent 변수 미사용 + 하드코딩 색상 [LOW]

**파일:** `src/app/tag/[name]/page.tsx:49`

```typescript
const accent = siteType === "culturepeople" ? "#5B4B9E"
  : siteType === "insightkorea" ? "#d2111a" : "#E8192C";
```

**문제:** `accent` 변수를 계산하지만 JSX에서 전혀 사용하지 않는다. 대신 `#E8192C`가 하드코딩되어 있어 culturepeople(보라색 `#5B4B9E`) / insightkorea(빨간색 `#d2111a`) 테마에서도 netpro 색상이 표시된다.

**영향 위치:**
- 라인 60: 브레드크럼 hover 색상 `hover:text-[#E8192C]`
- 라인 67: 태그 `#` 기호 색상 `text-[#E8192C]`
- 라인 80: "홈으로 돌아가기" 링크 `text-[#E8192C]`
- 라인 113: 카테고리 배지 `text-[#E8192C]`
- 라인 116: 기사 제목 hover `group-hover:text-[#E8192C]`

**권장 수정:** `accent` 변수를 인라인 `style`에 적용하거나, Tailwind CSS 변수로 치환

---

### BUG-04: 카테고리 페이지 searchParams 미사용 [LOW]

**파일:** `src/app/category/[slug]/page.tsx:20-22`

```typescript
interface Props {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ page?: string }>;
}
```

**문제:** `searchParams`가 Props 인터페이스에 선언되어 있지만, `CategoryPage` 함수에서 사용하지 않는다. `page` 파라미터 기반 페이지네이션이 구현되지 않은 상태이다. (netpro 테마는 `CategoryArticleList` 클라이언트 컴포넌트에서 "더 보기" 방식, culturepeople/insightkorea 테마는 자체 페이지네이션)

**영향:** 기능적 문제는 없으나, 사용되지 않는 인터페이스 필드가 혼란을 줄 수 있음

**권장 수정:** 사용하지 않는 `searchParams` 제거

---

### BUG-05: 태그 페이지 페이지네이션 미구현 [MEDIUM]

**파일:** `src/app/tag/[name]/page.tsx`

**문제:** 태그 페이지에 페이지네이션이 없다. 특정 태그에 수백 건의 기사가 있으면 모두 한 번에 렌더링된다. 카테고리 페이지는 "더 보기" 버튼이 있고, 검색은 10건씩 페이지네이션이 있지만, 태그 페이지는 제한 없이 전부 표시한다.

**영향:** 태그에 기사가 많을 경우 페이지 로드 느림, 이미지 대량 로드

**권장 수정:** `CategoryArticleList` 패턴의 "더 보기" 방식이나 페이지네이션 추가

---

### BUG-06: sbGetArticlesByTag ILIKE 부분 매칭 과잉 [LOW]

**파일:** `src/lib/supabase-server-db.ts:147`

```typescript
const url = `...&tags=ilike.*${encodeURIComponent(tag)}*...`;
```

**문제:** ILIKE 와일드카드 매칭 후 코드에서 `parseTags(a.tags).includes(tag)`로 정확한 매칭을 다시 한다. 이 자체는 정확하지만, "문화" 태그를 검색하면 "문화재", "문화산업" 등이 포함된 기사도 DB에서 일단 가져오게 된다. `limit=500`이므로 실제로 원하는 "문화" 태그 기사가 500건 이전에 다른 태그 기사로 채워질 수 있다.

**영향:** 태그명이 다른 태그의 부분 문자열인 경우, 실제 결과보다 적은 기사가 반환될 수 있음

**권장 수정:** 쉼표 경계를 포함한 패턴 사용 또는 limit 증가

---

### BUG-07: 기사 상세 breadcrumb에 카테고리 slug 미인코딩 [LOW]

**파일:** `src/app/article/[id]/page.tsx:212` (netpro 테마 전용)

```typescript
<Link href={`/category/${article.category}`} ...>{article.category}</Link>
```

**문제:** 카테고리명에 공백이나 특수문자가 포함된 경우 URL이 깨질 수 있다. 예: "문화/예술" 같은 카테고리. 현재 DB에는 "문화", "경제" 등 한글 단어만 있어 실제 문제는 발생하지 않지만, 방어적 코딩이 부족하다.

**영향:** 현재 카테고리 목록에서는 문제 없음. 향후 특수문자 포함 카테고리 추가 시 발생

**권장 수정:** `encodeURIComponent(article.category)` 사용

---

### BUG-08: 검색 sort 기본값 비교 불일치 [LOW]

**파일:** `src/app/search/components/SearchContent.tsx:123,155`

```typescript
if (initialSort && initialSort !== "date") params.set("sort", initialSort);
```

**문제:** `goToPage`과 `handleSortChange`에서 기본 sort 값을 `"date"`로 취급하지만, 실제 기본 정렬은 "관련도순" (빈 문자열)이다. `sort === ""`가 기본(관련도순)인데 `sort !== "date"`를 기본값 검사로 사용하여, 사용자가 "최신순"을 선택한 후 페이지를 이동하면 sort 파라미터가 URL에서 제거된다.

**영향:** 사용자가 "최신순" 정렬 후 페이지네이션 클릭 시 정렬이 관련도순으로 초기화됨

**권장 수정:** 기본값 검사를 `sort !== ""`로 변경하거나, 관련도순을 명시적 값으로 사용

---

### PERF-01: 검색 페이지 force-dynamic [INFO]

**파일:** `src/app/search/page.tsx:15`

```typescript
export const dynamic = "force-dynamic";
```

**정상:** 검색 페이지는 쿼리 파라미터에 따라 결과가 달라지므로 dynamic이 적절하다. 캐시 불가.

---

### PERF-02: DOMPurify 훅 등록/해제 패턴 [LOW]

**파일:** `src/app/article/[id]/components/ArticleBody.tsx:22-34`

**문제:** `useMemo` 안에서 `DOMPurify.addHook` / `removeHooks`를 반복 호출한다. DOMPurify는 글로벌 인스턴스이므로 동시에 여러 ArticleBody가 렌더링되면 훅이 충돌할 수 있다. 현재는 기사 상세 페이지에서 최대 2개(bodyFirst, bodySecond)가 렌더링되며, React의 동기적 렌더링 특성상 실제 문제는 발생하지 않을 가능성이 높다.

**권장 수정:** DOMPurify 인스턴스를 `DOMPurify(window)`로 격리하거나, 훅 대신 sanitize 후 직접 iframe src 검증

## Architecture Patterns

### 데이터 흐름
```
Supabase (PostgreSQL)
  -> src/lib/supabase-server-db.ts (REST API 직접 호출)
  -> src/lib/db-server.ts (추상화 레이어: Supabase/MySQL/File 폴백)
  -> Server Component (page.tsx)
  -> Theme Component ("use client")
```

### 테마 시스템
```
page.tsx에서 getSiteType()로 테마 판별
  -> "culturepeople": src/components/themes/culturepeople/
  -> "insightkorea": src/components/themes/insightkorea/
  -> "netpro": 인라인 JSX 또는 레거시 registry 컴포넌트
```

### 캐싱 전략
- 모든 공개 페이지: `revalidate = 3600` (ISR)
- Supabase fetch: `next: { revalidate: 60, tags: ["articles"] }`
- 검색: `force-dynamic` + `cache: "no-store"`
- 설정: `unstable_cache` with `revalidate: 300~3600`

## Common Pitfalls

### Pitfall 1: sbGetArticles 전체 로드
**What goes wrong:** 전체 기사를 불필요하게 가져와 ISR 재생성 느림
**Why it happens:** sbGetArticles가 범용 함수로 관리자/공개 모두에서 사용
**How to avoid:** 공개 페이지용 제한된 쿼리 함수 분리
**Warning signs:** ISR 재생성 시 Supabase 대시보드에서 높은 row read

### Pitfall 2: 테마 색상 하드코딩
**What goes wrong:** 새 테마 추가 시 기존 하드코딩된 색상이 남아있음
**Why it happens:** 초기 단일 테마에서 멀티 테마로 전환하면서 일부 누락
**How to avoid:** 테마별 CSS 변수 또는 accent 색상 prop 일관 적용

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | 별도 테스트 프레임워크 미설치 (jest/vitest 미감지) |
| Config file | 없음 |
| Quick run command | N/A |
| Full suite command | `npx tsc --noEmit` (타입 검사만) |

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| PUB-01 | 홈페이지 렌더링 | smoke | Playwright 또는 수동 확인 | N/A |
| PUB-02 | 기사 상세 렌더링 | smoke | 수동: 라이브 사이트 확인 | N/A |
| PUB-03 | 카테고리 페이지 | smoke | 수동: 라이브 사이트 확인 | N/A |
| PUB-04 | 태그 페이지 | smoke | 수동: 라이브 사이트 확인 | N/A |
| PUB-05 | 검색+페이지네이션 | smoke | 수동: 라이브 사이트 확인 | N/A |

### Sampling Rate
- **Per task commit:** `npx tsc --noEmit` (타입 에러 없음 확인)
- **Per wave merge:** 라이브 사이트 수동 검증
- **Phase gate:** `vercel deploy --prod` 후 라이브 사이트 5개 페이지 확인

### Wave 0 Gaps
- 별도 테스트 프레임워크가 없으므로 타입 체크 + 수동 검증에 의존
- Playwright MCP 서버가 있으므로 스크린샷 기반 검증 가능

## Issue Priority Summary

| ID | Severity | Page | Description |
|----|----------|------|-------------|
| BUG-08 | **HIGH** | 검색 | sort "date" 기본값 비교 버그 - 최신순 정렬이 페이지 이동 시 초기화 |
| BUG-01 | MEDIUM | 홈 | 전체 기사 로드 성능 |
| BUG-02 | MEDIUM | 카테고리 | 불필요한 allArticles 로드 |
| BUG-05 | MEDIUM | 태그 | 페이지네이션 미구현 |
| BUG-03 | LOW | 태그 | accent 변수 미사용 + 하드코딩 색상 |
| BUG-04 | LOW | 카테고리 | searchParams 미사용 |
| BUG-06 | LOW | 태그 | ILIKE 부분 매칭 한계 |
| BUG-07 | LOW | 기사 상세 | breadcrumb 카테고리 미인코딩 |
| PERF-02 | LOW | 기사 상세 | DOMPurify 훅 글로벌 충돌 가능성 |

## Sources

### Primary (HIGH confidence)
- 소스 코드 직접 감사: `src/app/page.tsx`, `src/app/article/[id]/page.tsx`, `src/app/category/[slug]/page.tsx`, `src/app/tag/[name]/page.tsx`, `src/app/search/page.tsx`
- 데이터 레이어: `src/lib/db-server.ts`, `src/lib/supabase-server-db.ts`
- 테마 컴포넌트: `src/components/themes/culturepeople/`, `src/components/themes/insightkorea/`
- TypeScript 컴파일: `npx tsc --noEmit` 에러 없음

## Metadata

**Confidence breakdown:**
- Bug identification: HIGH - 직접 코드 감사
- Severity assessment: MEDIUM - 실제 사용자 영향은 라이브 사이트 테스트 필요
- Performance claims: MEDIUM - DB 기사 수 ~3000건 기준 추정

**Research date:** 2026-03-26
**Valid until:** 2026-04-26
