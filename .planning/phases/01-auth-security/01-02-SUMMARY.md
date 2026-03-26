---
phase: 01-auth-security
plan: 02
subsystem: rate-limiting
tags: [redis, upstash, rate-limiting, middleware, serverless, security, rbac]
dependency-graph:
  requires: [01-01]
  provides: [redis-rate-limiting-all, rbac-verified]
  affects: [middleware.ts, comments-api, newsletter-api, ai-api, hash-api]
tech-stack:
  added: []
  patterns: [redis-first-inmemory-fallback, async-rate-limit]
key-files:
  created: []
  modified:
    - src/middleware.ts
    - src/app/api/db/comments/route.ts
    - src/app/api/newsletter/unsubscribe/route.ts
    - src/app/api/ai/route.ts
    - src/app/api/auth/hash/route.ts
key-decisions:
  - Redis 우선 + 인메모리 폴백 패턴으로 가용성과 보안 동시 확보
  - 함수명 변경(checkAiRateLimit, checkHashRateLimit)으로 import 충돌 방지
  - RBAC 기존 구현 정상 확인 (코드 변경 불필요)
metrics:
  duration: 11min
  completed: "2026-03-26T00:18:00Z"
  tasks: 2
  files: 5
---

# Phase 01 Plan 02: Rate Limiting Redis 전환 + RBAC 검증 Summary

5개 인메모리 Rate Limiting(cron/댓글/뉴스레터/AI/해시)을 모두 Plan 01에서 생성한 공통 Redis 유틸(src/lib/redis.ts)의 checkRateLimit으로 전환하여 서버리스 콜드스타트 후에도 Rate Limiting이 유지되도록 함. RBAC은 기존 구현이 정상임을 코드 리뷰로 확인.

## What Was Done

### Task 1: middleware.ts cron Rate Limiting Redis 전환 + RBAC 검증
- `checkCronRateLimit`을 async로 변경, `redis` import 기반 Redis/인메모리 분기
- 3곳 호출부 모두 `await` 추가 (Promise truthy 버그 방지)
- Redis prefix: `cp:cron:rate:`, 윈도우: 60초, 제한: 분당 5회
- RBAC `REPORTER_ALLOWED_PATHS` 검증 완료 (reporter가 /cam/settings 접근 시 /cam/articles로 리다이렉트)
- **Commit:** `93c4308`

### Task 2: 4개 API 라우트 Rate Limiting Redis 전환
- **comments/route.ts:** `checkCommentRateLimit` async 전환, `cp:comment:rate:` prefix, 600초 윈도우
- **newsletter/unsubscribe/route.ts:** `isRateLimited` async 전환, `cp:newsletter:rate:` prefix, 60초 윈도우 (반환값 반전 주의: checkRateLimit true=허용 -> isRateLimited false)
- **ai/route.ts:** `checkRateLimit` -> `checkAiRateLimit` 함수명 변경 (import 충돌 방지), `cp:ai:rate:` prefix, 60초 윈도우
- **auth/hash/route.ts:** `checkRateLimit` -> `checkHashRateLimit` 함수명 변경, `cp:hash:rate:` prefix, 60초 윈도우
- 모든 호출부에 `await` 추가
- **Commit:** `566980d`

## Decisions Made

| Decision | Rationale |
|----------|-----------|
| Redis 우선 + 인메모리 폴백 패턴 | 프로덕션에서는 Redis로 서버리스 안전, 개발환경/Redis 장애 시 인메모리로 가용성 유지 |
| 함수명 변경 (checkAiRateLimit, checkHashRateLimit) | import한 redisCheckRateLimit과 로컬 함수명 충돌 방지 |
| RBAC 코드 변경 없음 | 기존 REPORTER_ALLOWED_PATHS 로직이 정상 작동 확인 |

## Rate Limiting 전환 현황 (6개 전체)

| 파일 | Redis prefix | 윈도우 | 제한 | 전환 |
|------|-------------|--------|------|------|
| login/route.ts | cp:login:rate: | 60s | 분당 5회 | 기존 Redis (변경 없음) |
| middleware.ts | cp:cron:rate: | 60s | 분당 5회 | Plan 02 Task 1 |
| comments/route.ts | cp:comment:rate: | 600s | 10분에 5개 | Plan 02 Task 2 |
| newsletter/unsubscribe/route.ts | cp:newsletter:rate: | 60s | 분당 10회 | Plan 02 Task 2 |
| ai/route.ts | cp:ai:rate: | 60s | 분당 20회 | Plan 02 Task 2 |
| auth/hash/route.ts | cp:hash:rate: | 60s | 분당 10회 | Plan 02 Task 2 |

## Deviations from Plan

None - plan executed exactly as written.

## Known Stubs

None.

## Verification

- `npx tsc --noEmit`: 에러 0건
- `pnpm build`: 성공 (Middleware 50.2kB)
- `vercel deploy --prod`: 배포 완료 (https://culturepeople.co.kr)
- grep 검증: 5개 파일 모두 Redis prefix 확인

## Self-Check: PASSED

- All 5 modified files exist on disk
- Commits 93c4308, 566980d confirmed in git log
- All 5 Redis prefixes confirmed via grep
