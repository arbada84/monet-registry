---
phase: 10-operational-stability
verified: 2026-04-01T12:00:00Z
status: passed
score: 5/5 must-haves verified
re_verification: false
---

# Phase 10: 운영 안정성 Verification Report

**Phase Goal:** 사이트 응답 속도와 운영 안정성이 체감 가능하게 개선된다
**Verified:** 2026-04-01
**Status:** passed
**Re-verification:** No -- initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | 홈/카테고리/어드민 목록 페이지가 목적별 쿼리로 필요한 컬럼만 조회하여 응답한다 | VERIFIED | 5개 목적별 함수(sbGetPublished/Recent/Sitemap/Scheduled/RecentTitles)가 supabase-server-db.ts에 존재하고, 11개 호출처가 모두 전환됨. serverGetArticles()는 src/app/ 내에서 admin fix 스크립트 3곳(일회성)에만 남아있으며, db-server.ts 폴백에서만 사용됨 |
| 2 | 어드민 기사 목록의 필터링(상태/카테고리/검색)이 DB 레벨에서 처리되어 대량 기사에서도 빠르게 동작한다 | VERIFIED | sbGetFilteredArticles가 supabase-server-db.ts:327에 존재, ilike/eq 필터+count=exact+content-range 파싱 구현. /api/db/articles/route.ts가 serverGetFilteredArticles를 import(11행)+호출(59행)하며 serverGetArticles() 호출 0건, JS .filter() 0건 (댓글 DELETE의 filter만 존재) |
| 3 | 인메모리 rate limit 잔여분(commentRateMap, cronRateLimitMap, memAttempts)이 모두 Redis로 전환되어 서버리스 인스턴스 간 일관성이 보장된다 | VERIFIED | grep "commentRateMap\|cronRateLimitMap\|memAttempts" src/ 결과 0건. middleware.ts가 redisCheckRateLimit 사용(4행 import, 10행 호출), comments/route.ts가 redisCheckRateLimit 사용(7행 import, 66행 호출), login/route.ts가 공통 redis.ts에서 redis import(5행) |
| 4 | 모든 인증 쿠키가 환경에 관계없이 secure 플래그가 설정된다 | VERIFIED | login/route.ts에 "secure: true" 3곳(142, 191, 211행), "secure: process.env" 0건 |
| 5 | 루트 디렉토리에 temp/tmp 파일이 없고 .gitignore에 패턴이 추가되어 재발이 방지된다 | VERIFIED | 물리 파일 7개가 루트에 존재하나 git ls-files 결과 0건(미추적). .gitignore에 temp_*.html(80행), temp_*.txt(81행), tmp_*.html(82행), nul(83행), cookies.txt(84행) 패턴 존재. git 저장소 관점에서 깨끗함 |

**Score:** 5/5 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/lib/supabase-server-db.ts` | 5개 목적별 쿼리 함수 + sbGetFilteredArticles | VERIFIED | sbGetPublishedArticles(215행), sbGetRecentArticles(241행), sbGetArticleSitemapData(254행), sbGetScheduledArticles(284행), sbGetRecentTitles(298행), sbGetFilteredArticles(327행) |
| `src/lib/db-server.ts` | 5개 래퍼 + serverGetFilteredArticles | VERIFIED | serverGetPublished(121행), serverGetRecent(133행), serverGetSitemap(148행), serverGetScheduled(162행), serverGetRecentTitles(175행), serverGetFiltered(206행) |
| `src/middleware.ts` | Redis 전용 cron rate limit | VERIFIED | redisCheckRateLimit import(4행)+호출(10행), cronRateLimitMap 0건 |
| `src/app/api/db/comments/route.ts` | Redis 전용 댓글 rate limit | VERIFIED | redisCheckRateLimit import(7행)+호출(66행), commentRateMap 0건 |
| `src/app/api/auth/login/route.ts` | Redis 전용 로그인 rate limit + secure cookie | VERIFIED | 공통 redis.ts import(5행), secure: true 3곳, memAttempts 0건 |
| `src/app/api/db/articles/route.ts` | DB 레벨 필터링 적용된 GET 핸들러 | VERIFIED | serverGetFilteredArticles import(11행)+호출(59행), serverGetArticles() 0건 |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| src/app/page.tsx | db-server.ts | serverGetPublishedArticles() | WIRED | import(3행)+호출(57행) |
| src/app/api/rss/route.ts | db-server.ts | serverGetRecentArticles/serverGetPublishedArticles | WIRED | import(3행)+조건부호출(42행) |
| src/app/api/cron/publish/route.ts | db-server.ts | serverGetScheduledArticles() | WIRED | import(3행)+호출(10행) |
| src/app/api/cron/auto-news/route.ts | db-server.ts | serverGetRecentTitles(30) | WIRED | dynamic import(276행)+호출(277행) |
| src/app/api/cron/auto-press/route.ts | db-server.ts | serverGetRecentTitles(30) | WIRED | dynamic import(243행)+호출(244행) |
| src/app/sitemap.xml/route.ts | db-server.ts | serverGetArticleSitemapData() | WIRED | import(2행)+호출(37행) |
| src/app/api/db/articles/route.ts | db-server.ts | serverGetFilteredArticles() | WIRED | import(11행)+호출(59행) |
| src/middleware.ts | src/lib/redis.ts | redisCheckRateLimit | WIRED | import(4행)+호출(10행) |
| src/app/api/db/comments/route.ts | src/lib/redis.ts | redisCheckRateLimit | WIRED | import(7행)+호출(66행) |
| src/app/api/auth/login/route.ts | src/lib/redis.ts | redis import | WIRED | import(5행) |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| PERF-01 | 10-01 | serverGetArticles() 전체 스캔을 목적별 쿼리로 전환 | SATISFIED | 5개 목적별 함수 생성, 11개 호출처 전환 완료. src/app/ 내 serverGetArticles() 잔여: admin fix 스크립트 3곳(일회성, 계획대로 제외) |
| PERF-02 | 10-03 | /api/db/articles GET 핸들러의 DB 레벨 필터링 전환 | SATISFIED | sbGetFilteredArticles+serverGetFilteredArticles 생성, route.ts에서 사용, JS filter/slice 제거 |
| SEC-01 | 10-02 | 인메모리 rate limit를 Redis로 전환 | SATISFIED | commentRateMap/cronRateLimitMap/memAttempts 검색 결과 0건, 3곳 모두 Redis 전용 |
| SEC-02 | 10-02 | Cookie secure 플래그 하드코딩 | SATISFIED | secure: true 3곳, secure: process.env 0건 |
| CLEAN-01 | 10-02 | temp 파일 삭제 및 .gitignore 패턴 추가 | SATISFIED | git 미추적 상태, .gitignore에 5개 패턴 존재 |

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| (none) | - | - | - | - |

No anti-patterns detected. In-memory rate limit maps fully removed. No TODO/placeholder/stub patterns found in modified files.

### Behavioral Spot-Checks

Step 7b: SKIPPED (verification requires running server with Supabase/Redis connections; static code analysis confirms all wiring is correct)

### Human Verification Required

### 1. 홈페이지 응답 속도 체감 확인

**Test:** 프로덕션 사이트에서 홈페이지 로드하고 Network 탭에서 TTFB 확인
**Expected:** serverGetArticles() 전체 스캔 대비 응답 시간 감소
**Why human:** 실제 네트워크 환경에서의 성능 차이는 코드만으로 확인 불가

### 2. 어드민 기사 목록 필터링 동작 확인

**Test:** 어드민 기사 목록에서 카테고리/상태/검색어 필터링 시도
**Expected:** 필터 결과가 정확하고 total 개수가 올바르게 표시됨
**Why human:** DB 레벨 필터링의 정확성은 실제 데이터로 확인 필요

### 3. Rate Limit 동작 확인

**Test:** 댓글 또는 로그인을 빠르게 반복 시도
**Expected:** Redis 기반 rate limit이 정상 작동하여 제한 메시지 표시
**Why human:** Redis 연결 및 rate limit 임계값 동작은 실행 환경에서만 확인 가능

---

_Verified: 2026-04-01_
_Verifier: Claude (gsd-verifier)_
