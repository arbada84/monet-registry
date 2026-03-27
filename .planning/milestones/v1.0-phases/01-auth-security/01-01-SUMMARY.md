---
phase: 01-auth-security
plan: 01
subsystem: auth
tags: [redis, upstash, token-blacklist, middleware, serverless, security]

# Dependency graph
requires: []
provides:
  - "src/lib/redis.ts: 공통 Redis 인스턴스 + checkRateLimit 유틸"
  - "cookie-auth.ts: async 토큰 블랙리스트 (Redis 우선, 인메모리 폴백)"
  - "middleware.ts: getAuthState에서 블랙리스트 검사 포함"
affects: [01-02-PLAN]

# Tech tracking
tech-stack:
  added: []
  patterns: ["Redis 우선 + 인메모리 폴백 패턴", "SHA-256 해시 접두어 Redis 키 (cp:blacklist:)"]

key-files:
  created: [src/lib/redis.ts]
  modified: [src/lib/cookie-auth.ts, src/middleware.ts, src/app/api/auth/login/route.ts]

key-decisions:
  - "공통 redis.ts 모듈로 Redis 인스턴스 추출 (login/route.ts 중복 제거 가능)"
  - "토큰 전체 대신 SHA-256 해시 앞 16자를 Redis 키로 사용"
  - "Redis 장애 시 인메모리 폴백 유지 (가용성 우선)"
  - "블랙리스트 TTL 24h = 토큰 만료 시간과 동일"

patterns-established:
  - "Redis 초기화: src/lib/redis.ts에서 공통 인스턴스 export"
  - "checkRateLimit(ip, prefix, max, windowSec): 공통 Rate Limiting 유틸"
  - "Redis 키 네임스페이스: cp:{기능}:{세부} 패턴"

requirements-completed: [SEC-01, SEC-02, SEC-05]

# Metrics
duration: 12min
completed: 2026-03-26
---

# Phase 01 Plan 01: Redis 토큰 블랙리스트 Summary

**Redis 기반 토큰 블랙리스트로 서버리스 인스턴스 간 로그아웃 토큰 무효화 + middleware 블랙리스트 검사 추가**

## Performance

- **Duration:** 12 min
- **Started:** 2026-03-25T23:52:55Z
- **Completed:** 2026-03-26T00:05:07Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments
- src/lib/redis.ts 공통 Redis 인스턴스 + checkRateLimit 유틸 생성
- cookie-auth.ts의 invalidateToken/isTokenBlacklisted를 async + Redis 전환 (인메모리 폴백 유지)
- middleware.ts getAuthState에 블랙리스트 검사 추가로 모든 보호 경로에서 로그아웃 토큰 차단
- 프로덕션 배포 완료 (culturepeople.co.kr)

## Task Commits

Each task was committed atomically:

1. **Task 1: Redis 공통 유틸 생성 + cookie-auth.ts 블랙리스트 async/Redis 전환** - `e7b9ba5` (feat)
2. **Task 2: middleware.ts getAuthState에 블랙리스트 검사 추가** - `e94a172` (feat)

## Files Created/Modified
- `src/lib/redis.ts` - 공통 Redis 인스턴스 + checkRateLimit 유틸 (신규)
- `src/lib/cookie-auth.ts` - invalidateToken/isTokenBlacklisted async+Redis 전환, isAuthenticated await 추가
- `src/middleware.ts` - getAuthState에 isTokenBlacklisted 검사 추가
- `src/app/api/auth/login/route.ts` - DELETE 핸들러 await invalidateToken 추가

## Decisions Made
- 공통 redis.ts 모듈로 Redis 초기화 패턴 추출 (login/route.ts와 cookie-auth.ts에서 재사용 가능)
- SHA-256 해시 앞 16자를 Redis 키로 사용 (전체 토큰 저장 방지, 충돌 확률 무시 가능)
- Redis 장애 시 인메모리 폴백 유지 (가용성 우선 원칙)
- 블랙리스트 TTL을 토큰 만료 시간(24h)과 동일하게 설정

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - Redis 환경변수(UPSTASH_REDIS_REST_URL, UPSTASH_REDIS_REST_TOKEN)는 이미 Vercel에 설정됨.

## Next Phase Readiness
- redis.ts 공통 유틸이 준비되어 01-02-PLAN(Rate Limiting 전환)에서 바로 import하여 사용 가능
- checkRateLimit 함수가 이미 구현되어 있으므로 각 API의 인메모리 Rate Limit 전환이 단순화됨

## Self-Check: PASSED

All files exist, all commits verified.

---
*Phase: 01-auth-security*
*Completed: 2026-03-26*
