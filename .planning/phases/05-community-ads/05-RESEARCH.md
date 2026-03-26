# Phase 5: 커뮤니티 및 광고 - Research

**Researched:** 2026-03-26
**Domain:** 댓글, 뉴스레터, 광고 시스템 (Brownfield Audit)
**Confidence:** HIGH

## Summary

기존 댓글, 뉴스레터, 광고 시스템 코드를 전수 점검하였다. 전반적으로 잘 구축되어 있으나, 보안 취약점 2건(뉴스레터 HTML 인젝션), 데이터 정합성 문제 1건(스키마 파일 불일치), 엣지 케이스 버그 다수를 발견하였다.

**가장 중요한 발견:** 뉴스레터 웰컴 이메일의 `welcomeBody`/`footerText`가 HTML 이스케이프 없이 이메일 본문에 삽입되어 XSS/HTML 인젝션 위험이 있다. 댓글 시스템은 `supabase-schema.sql` 파일의 스키마 정의와 실제 마이그레이션 스크립트 간 컬럼 불일치가 있어 혼동 가능성이 있다.

**Primary recommendation:** 뉴스레터 HTML 이스케이프 누락 2건 수정 + 댓글/뉴스레터 엣지 케이스 버그 수정이 우선.

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| COM-01 | 댓글 CRUD | 댓글 API(route.ts) 전수 점검 완료 — CRUD 동작 확인, 버그 3건 발견 |
| COM-02 | 댓글 답글 | 답글(parentId) 구현 확인 — UI에서 답글에 대한 답글 불가 제한 없음(의도적) |
| COM-03 | 뉴스레터 구독/해지 | 구독/해지 API 점검 — 재구독 시 토큰 미갱신 버그, 웰컴 이메일 HTML 인젝션 발견 |
| COM-04 | 뉴스레터 발송 | 발송 API 점검 — 인증은 미들웨어에서 처리, 본문 이스케이프는 정상 |
| COM-05 | AdSense | AdSense 컴포넌트 점검 — 정상 동작, 경미한 개선점 1건 |
| COM-06 | 쿠팡 추천 | 쿠팡 API + CoupangAutoAd + CoupangUnit 점검 — 정상 동작 |
</phase_requirements>

## Project Constraints (from CLAUDE.md/MEMORY.md)

- 모든 설명/안내를 한글로 작성
- 사이트 코드 변경 시 반드시 `vercel deploy --prod`까지 자동 실행
- Supabase DB 우선, Vercel Hobby 제약 (cron 1일1회, 이미지 unoptimized)
- pnpm 9.12.2, Next.js 15.5.14, TypeScript
- 어드민 async 패턴: `saveXxx -> Promise<boolean>`, `handleSave` async

---

## Bug Report: 댓글 시스템 (COM-01, COM-02)

### BUG-C01: supabase-schema.sql과 실제 테이블 스키마 불일치 (LOW severity)
**위치:** `supabase-schema.sql` 28-35행
**문제:** 스키마 파일의 comments 테이블 정의에 `article_title`, `ip`, `parent_id` 컬럼이 없다. 실제 마이그레이션(`migrate-comments/route.ts`)에서는 이 컬럼들을 포함하여 생성한다. 스키마 파일이 실제 DB와 동기화되어 있지 않다.
**영향:** 코드 동작에는 영향 없음 (실제 테이블에는 컬럼 존재). 신규 개발자가 `supabase-schema.sql`을 보고 혼동할 수 있음.
**수정:** `supabase-schema.sql`의 comments 정의를 마이그레이션 스크립트와 일치시킬 것.

### BUG-C02: GET 댓글에서 비관리자가 특정 기사 외 전체 조회 시 정렬만 되고 필터 누락 아님 (OK — 확인 완료)
**위치:** `route.ts` 119-125행
**확인 결과:** `articleId` 없이 비관리자가 GET하면 `status=eq.approved` 필터가 적용됨. 정상 동작.

### BUG-C03: JSON 폴백 모드에서 댓글 GET의 비관리자 전체 조회 시 정렬 누락 (LOW severity)
**위치:** `route.ts` 134-141행
**문제:** 테이블 모드에서는 `order=created_at.desc`로 정렬하지만, JSON 폴백에서는 정렬 없이 반환한다.
**영향:** JSON 폴백은 개발환경용이므로 프로덕션 영향 없음.

### BUG-C04: 댓글 삭제 시 자식 답글이 고아(orphan)가 됨 (MEDIUM severity)
**위치:** `route.ts` DELETE 핸들러 (284-314행)
**문제:** 부모 댓글 삭제 시 자식 답글(parentId가 삭제된 댓글 ID인 것)의 parentId가 그대로 남아 `parent_id` FK가 `ON DELETE SET NULL`로 처리되므로 DB에서는 NULL이 되지만, 프론트엔드에서는 `parentId`가 null인 댓글이 루트 댓글로 표시된다.
**영향:** 답글이었던 것이 삭제 후 루트 댓글처럼 보임. 의도된 동작일 수 있으나 UX 상 혼동 가능.
**수정 옵션:** (1) 부모 삭제 시 자식도 함께 삭제 또는 (2) "[삭제된 댓글]" 표시 패턴 적용.

### BUG-C05: isTableMode() 캐시가 서버 수명 동안 영구 유지 (LOW severity)
**위치:** `route.ts` 25-36행
**문제:** `useTable` 변수가 모듈 레벨에서 `null`로 초기화되고 한 번 설정되면 변경 불가. Vercel 서버리스에서는 콜드 스타트마다 리셋되므로 실질적 문제는 낮으나, 테이블이 중간에 생성/삭제되는 시나리오에서는 재시작 필요.
**영향:** 실질적 영향 극히 낮음.

### BUG-C06: 댓글 POST에서 articleId UUID 검증 누락 (LOW severity)
**위치:** `route.ts` 167행
**문제:** `articleId`가 문자열인지만 확인하고 UUID 형식 검증을 하지 않는다. `parentId`는 UUID 검증(178행)을 수행.
**영향:** 잘못된 articleId로 댓글 등록 시 DB에 무효 참조 댓글이 생길 수 있음. 단, `article_id TEXT NOT NULL`로 FK 제약이 약하므로 DB 에러는 발생하지 않음.

---

## Bug Report: 뉴스레터 시스템 (COM-03, COM-04)

### BUG-N01: 웰컴 이메일 welcomeBody/footerText HTML 인젝션 (HIGH severity - 보안)
**위치:** `api/db/newsletter/route.ts` 51-53행
**문제:** `settings.welcomeBody`와 `settings.footerText`가 `escHtml()` 처리 없이 직접 HTML 템플릿에 삽입된다. 관리자가 설정한 값이므로 직접적인 공격 벡터는 낮으나, 관리자 계정 탈취 시 뉴스레터 구독자에게 악성 HTML/JS를 발송할 수 있다.
**비교:** `api/newsletter/send/route.ts`에서는 `escHtml(content)` 및 `escHtml(settings.footerText)`로 올바르게 이스케이프한다 (108-114행).
**수정:** `welcomeBody`와 `footerText`에 `escHtml()` 적용 또는, 의도적으로 HTML을 허용하는 경우 DOMPurify 서버 사이드 적용.

### BUG-N02: 뉴스레터 재구독 시 토큰 미갱신 (MEDIUM severity)
**위치:** `api/db/newsletter/route.ts` 173-174행
**문제:** unsubscribed 상태의 구독자가 재구독하면 `status`만 `"active"`로 변경하고 `token`은 그대로 유지한다. 이전 구독 해제 링크가 그대로 유효하여 재구독 즉시 해제될 수 있다.
**수정:** 재구독 시 `token: crypto.randomUUID()`로 갱신.

### BUG-N03: 뉴스레터 구독 POST rate limit이 인메모리 전용 (MEDIUM severity)
**위치:** `api/db/newsletter/route.ts` 126-148행
**문제:** 댓글과 unsubscribe에서는 Redis 기반 rate limit을 사용하지만, 뉴스레터 구독 POST에서는 인메모리 `Map`만 사용한다. Vercel 서버리스에서는 콜드 스타트마다 리셋되므로 rate limit이 실질적으로 무효.
**수정:** `checkRateLimit` (redis.ts) 공용 함수 사용으로 통일.

### BUG-N04: 뉴스레터 DELETE에 라우트 레벨 인증 없음 (LOW severity)
**위치:** `api/db/newsletter/route.ts` 199-212행
**문제:** GET 핸들러에는 `isAuthenticated` 검사가 있지만 DELETE에는 없다. 미들웨어에서 보호되므로 실질적 위험은 낮으나, "심층 방어" 원칙에 어긋남.
**수정:** DELETE에도 `isAuthenticated` 검사 추가.

### BUG-N05: newsletter/send POST에 라우트 레벨 인증 없음 (LOW severity)
**위치:** `api/newsletter/send/route.ts`
**문제:** 미들웨어 155행에서 `/api/newsletter` 경로를 보호하므로 실질적으로는 안전. 그러나 댓글 PATCH/DELETE처럼 라우트 레벨에서도 이중 검증하는 것이 일관적.
**수정:** `verifyAuthToken` 또는 `isAuthenticated` 추가.

### BUG-N06: 구독자 수 10,000건 제한이지만 site_settings JSON에 전체 저장 (LOW severity)
**위치:** `api/db/newsletter/route.ts` 164행
**문제:** 구독자를 `cp-newsletter-subscribers` 키의 jsonb 값으로 저장한다. 10,000건이면 JSON이 수 MB가 되어 Supabase REST API 응답 시간이 느려진다.
**영향:** 현재 구독자가 많지 않다면 문제없음. 장기적으로 별도 테이블 마이그레이션 필요.

---

## Bug Report: 광고 시스템 (COM-05, COM-06)

### BUG-A01: AdSenseUnit pushed.current가 React Strict Mode에서 문제 가능 (LOW severity)
**위치:** `AdSenseUnit.tsx` 31행, 35-36행
**문제:** React 18 Strict Mode에서는 useEffect가 두 번 실행되므로, `pushed.current = true` 후 cleanup에서 리셋하지 않으면 두 번째 마운트에서 push가 스킵된다. 프로덕션에서는 Strict Mode가 비활성화되므로 실질적 영향은 없음.

### BUG-A02: CoupangUnit MutationObserver iframe src 매칭 불안정 (LOW severity)
**위치:** `CoupangUnit.tsx` 81행
**문제:** `iframe?.src?.includes(\`id=\${numId}\`)` 매칭이 다른 광고 단위의 ID가 부분 매칭될 수 있음 (예: id=12가 id=123의 iframe과 매칭). 실질적으로 동일 페이지에 유사 ID가 동시 존재할 확률은 낮음.
**수정:** 정규식 `new RegExp(\`[?&]id=\${numId}(?:&|$)\`)` 사용.

### BUG-A03: 쿠팡 API 응답에 캐싱 없음 (LOW severity — 성능)
**위치:** `api/coupang/products/route.ts` 61행
**문제:** `cache: "no-store"`로 매 요청마다 쿠팡 API를 호출한다. 같은 키워드로 짧은 시간에 반복 호출하면 쿠팡 API rate limit에 걸릴 수 있음.
**수정 옵션:** 응답에 `Cache-Control: s-maxage=300` 추가 또는 Redis 캐싱.

### BUG-A04: ScriptUnit 인라인 스크립트 차단 패턴이 `fetch(`를 포함하여 광고 스크립트도 차단 가능 (LOW severity)
**위치:** `ScriptUnit.tsx` 71행
**문제:** 인라인 스크립트에서 `fetch\s*\(`를 차단하는데, 일부 합법적 광고 SDK가 fetch를 사용할 수 있음.
**영향:** 현재까지 보고된 문제 없음. 외부 스크립트(src)에는 적용되지 않으므로 대부분 광고는 정상.

---

## Phase 1 Redis 변경이 댓글 Rate Limiting에 미친 영향

**결론: 영향 없음 (정상)**

`src/lib/redis.ts`를 점검한 결과:
- Redis 인스턴스가 Upstash REST API 기반으로 안정적으로 초기화됨
- `checkRateLimit` 함수가 고정 윈도우 방식으로 올바르게 구현됨
- Redis 장애 시 `true`(허용) 반환으로 가용성 우선 설계
- 댓글(`cp:comment:rate:`), unsubscribe(`cp:newsletter:rate:`), cron(`cp:cron:rate:`) 각각 별도 prefix 사용
- 댓글 API에서 Redis 실패 시 인메모리 폴백도 동작

---

## Architecture Patterns

### 현재 댓글 시스템 구조
```
CommentSection (client) -> /api/db/comments (route handler)
                               |
                   isTableMode() -> Supabase comments 테이블 (주)
                               |
                   JSON fallback -> site_settings 'cp-comments' (보조)
```

### 현재 뉴스레터 시스템 구조
```
프론트엔드 -> /api/db/newsletter POST (구독)
           -> /api/db/newsletter DELETE (관리자 구독 해지)
           -> /api/newsletter/unsubscribe GET (token 기반 해지)
           -> /api/newsletter/send POST (관리자 발송)

구독자 저장: site_settings 'cp-newsletter-subscribers' (jsonb)
설정 저장: site_settings 'cp-newsletter-settings' (jsonb)
이력 저장: site_settings 'cp-newsletter-history' (jsonb)
```

### 현재 광고 시스템 구조
```
AdBanner (서버 컴포넌트, 설정 로드)
  -> AdSenseUnit (클라이언트, Google AdSense)
  -> CoupangUnit (클라이언트, 쿠팡 파트너스)
  -> ScriptUnit (클라이언트, 커스텀 스크립트)

FloatingAds -> AdBanner x2 (floating-left, floating-right)
CoupangAutoAd -> /api/coupang/products (쿠팡 검색 API)

설정: site_settings 'cp-ads' (슬롯 목록), 'cp-ads-global' (전역)
```

---

## Common Pitfalls

### Pitfall 1: Vercel 서버리스 인메모리 Rate Limit
**문제:** 인메모리 Map 기반 rate limit은 콜드 스타트마다 리셋됨
**현재 상태:** 댓글과 unsubscribe는 Redis 우선 + 인메모리 폴백. 뉴스레터 구독은 인메모리 전용.
**교훈:** 모든 rate limit을 Redis 공용 함수로 통일해야 함.

### Pitfall 2: site_settings jsonb에 대량 데이터 저장
**문제:** 구독자, 댓글(JSON 폴백), 이력 등이 단일 jsonb 필드에 저장됨
**영향:** 데이터가 커지면 읽기/쓰기 성능 저하
**현재 완화:** 댓글은 별도 테이블 마이그레이션 완료. 구독자는 아직 jsonb.

### Pitfall 3: SMTP 발송 중 Vercel 함수 타임아웃
**문제:** Hobby 플랜 함수 실행 제한 10초. 구독자가 많으면 배치 발송 중 타임아웃.
**현재 완화:** 10명 배치 + 100ms 딜레이. 약 100명까지는 10초 이내 가능.

---

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | 별도 테스트 프레임워크 미설정 (검색 결과 없음) |
| Config file | none |
| Quick run command | N/A |
| Full suite command | N/A |

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| COM-01 | 댓글 CRUD | manual | Playwright 또는 curl 검증 | N/A |
| COM-02 | 댓글 답글 | manual | UI에서 답글 등록/표시 확인 | N/A |
| COM-03 | 뉴스레터 구독/해지 | manual | API curl + 이메일 확인 | N/A |
| COM-04 | 뉴스레터 발송 | manual | 관리자 UI에서 발송 테스트 | N/A |
| COM-05 | AdSense | manual | 브라우저에서 광고 렌더링 확인 | N/A |
| COM-06 | 쿠팡 추천 | manual | 기사 페이지에서 추천 상품 표시 확인 | N/A |

### Wave 0 Gaps
테스트 프레임워크 미설정 상태. 이 단계에서는 수동 검증(Playwright MCP + curl) 활용.

---

## Bug Severity Summary

| ID | Severity | Component | Description |
|----|----------|-----------|-------------|
| BUG-N01 | **HIGH** | 뉴스레터 | welcomeBody/footerText HTML 인젝션 |
| BUG-C04 | MEDIUM | 댓글 | 부모 삭제 시 자식 답글 고아화 |
| BUG-N02 | MEDIUM | 뉴스레터 | 재구독 시 토큰 미갱신 |
| BUG-N03 | MEDIUM | 뉴스레터 | 구독 rate limit 인메모리 전용 |
| BUG-C01 | LOW | 댓글 | supabase-schema.sql 불일치 |
| BUG-C03 | LOW | 댓글 | JSON 폴백 정렬 누락 |
| BUG-C05 | LOW | 댓글 | isTableMode 영구 캐시 |
| BUG-C06 | LOW | 댓글 | articleId UUID 검증 누락 |
| BUG-N04 | LOW | 뉴스레터 | DELETE 라우트 인증 누락 |
| BUG-N05 | LOW | 뉴스레터 | send 라우트 인증 누락 |
| BUG-N06 | LOW | 뉴스레터 | 구독자 jsonb 대량 저장 |
| BUG-A01 | LOW | 광고 | Strict Mode 이중 마운트 |
| BUG-A02 | LOW | 광고 | CoupangUnit ID 부분 매칭 |
| BUG-A03 | LOW | 광고 | 쿠팡 API 캐싱 없음 |
| BUG-A04 | LOW | 광고 | ScriptUnit fetch 차단 |

---

## Sources

### Primary (HIGH confidence)
- 소스 코드 직접 읽기: `src/app/api/db/comments/route.ts`, `src/app/article/[id]/components/CommentSection.tsx`
- 소스 코드 직접 읽기: `src/app/api/db/newsletter/route.ts`, `src/app/api/newsletter/send/route.ts`, `src/app/api/newsletter/unsubscribe/route.ts`
- 소스 코드 직접 읽기: `src/components/ui/AdBanner.tsx`, `AdSenseUnit.tsx`, `CoupangUnit.tsx`, `CoupangAutoAd.tsx`, `FloatingAds.tsx`, `ScriptUnit.tsx`
- 소스 코드 직접 읽기: `src/app/api/coupang/products/route.ts`
- 소스 코드 직접 읽기: `src/middleware.ts`, `src/lib/redis.ts`
- 스키마: `supabase-schema.sql`, `migration.sql`, `src/app/api/admin/migrate-comments/route.ts`
- 타입: `src/types/article.ts` (Comment interface)

## Metadata

**Confidence breakdown:**
- 댓글 시스템: HIGH - 전체 코드 읽기 완료
- 뉴스레터 시스템: HIGH - 전체 코드 읽기 완료
- 광고 시스템: HIGH - 전체 코드 읽기 완료
- Rate Limiting / Redis: HIGH - redis.ts + 각 API에서의 사용 패턴 확인

**Research date:** 2026-03-26
**Valid until:** 2026-04-26 (안정적인 코드, 빈번한 변경 없음)
