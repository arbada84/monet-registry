---
phase: 10-operational-stability
plan: 02
subsystem: auth, security
tags: [redis, rate-limit, cookie, security, upstash]

requires:
  - phase: null
    provides: "src/lib/redis.ts 공통 Redis 유틸 (v1.0에서 구축)"
provides:
  - "인메모리 rate limit 3곳 완전 제거 — Redis 전용 전환"
  - "Cookie secure: true 하드코딩 — 환경 분기 없음"
affects: [auth, middleware, comments]

tech-stack:
  added: []
  patterns: ["Redis 전용 rate limit (인메모리 폴백 금지)", "Cookie secure 하드코딩 패턴"]

key-files:
  created: []
  modified:
    - src/middleware.ts
    - src/app/api/db/comments/route.ts
    - src/app/api/auth/login/route.ts

key-decisions:
  - "login/route.ts 로컬 Redis 인스턴스 제거 → 공통 redis.ts import 사용"
  - "checkRateLimit → checkLoginRateLimit 함수명 변경 (import 충돌 방지)"
  - "temp 파일: 이미 git 미추적 + .gitignore 패턴 존재 확인 (삭제 불필요)"

patterns-established:
  - "Redis 전용 rate limit: 인메모리 Map 폴백 사용 금지 — Redis 없으면 허용(가용성 우선)"
  - "Cookie secure: true 하드코딩 — process.env.NODE_ENV 분기 사용 금지"

requirements-completed: [SEC-01, SEC-02, CLEAN-01]

duration: 20min
completed: 2026-04-01
---

# Phase 10 Plan 02: Security Hardening Summary

**인메모리 rate limit 3곳을 Redis 전용으로 전환하고 Cookie secure 플래그를 하드코딩하여 서버리스 환경 일관성 보장**

## Performance

- **Duration:** 20 min
- **Started:** 2026-03-31T17:31:12Z
- **Completed:** 2026-03-31T17:50:43Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments
- middleware.ts: cronRateLimitMap 인메모리 Map 제거, redisCheckRateLimit 직접 호출로 전환
- comments/route.ts: commentRateMap + COMMENT_WINDOW_MS + lastRateCleanup 인메모리 코드 완전 제거
- login/route.ts: 로컬 Redis 인스턴스 생성 코드 + memAttempts + getMemEntry + evictExpired 완전 제거, 공통 redis.ts import 사용
- login/route.ts: Cookie secure: process.env.NODE_ENV === "production" 3곳을 secure: true로 하드코딩
- 총 132줄 삭제, 20줄 추가 (순 112줄 감소)

## Task Commits

Each task was committed atomically:

1. **Task 1: 인메모리 rate limit 3곳 Redis 전용 전환** - `ea2d35a` (feat)
2. **Task 2: Cookie secure 하드코딩 + temp 파일 확인** - `d64fe5b` (fix)

## Files Created/Modified
- `src/middleware.ts` - cronRateLimitMap 제거, Redis 전용 checkCronRateLimit
- `src/app/api/db/comments/route.ts` - commentRateMap 제거, Redis 전용 checkCommentRateLimit
- `src/app/api/auth/login/route.ts` - 로컬 Redis + memAttempts 제거, 공통 redis.ts 사용, secure: true 하드코딩

## Decisions Made
- login/route.ts의 로컬 Redis 인스턴스를 공통 redis.ts의 싱글톤으로 교체 (중복 연결 방지)
- checkRateLimit을 checkLoginRateLimit으로 이름 변경 (redis.ts의 checkRateLimit import와 충돌 방지)
- temp 파일은 이미 git 미추적 상태이고 .gitignore 패턴도 존재하여 추가 작업 불필요

## Deviations from Plan

### Task 2 - Temp 파일 정리

**Plan:** `git rm -f` 로 7개 파일 삭제
**Actual:** 파일이 git에 추적되지 않는 상태이고 .gitignore에 패턴이 이미 존재. 물리적 파일은 메인 저장소 루트에 있으나 git 추적 대상이 아님.
**Impact:** 없음. 목표(깨끗한 git 상태)는 이미 달성된 상태.

---

**Total deviations:** 1 (temp 파일 이미 정리된 상태 확인)
**Impact on plan:** 없음. 모든 목표 달성.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- 인메모리 rate limit 완전 제거로 서버리스 인스턴스 간 일관된 rate limiting 보장
- Cookie secure 하드코딩으로 환경 무관 보안 보장
- Phase 10 Plan 03 진행 가능

---
*Phase: 10-operational-stability*
*Completed: 2026-04-01*
