---
phase: 05-community-ads
plan: 01
subsystem: newsletter
tags: [security, bug-fix, rate-limit, auth]
dependency_graph:
  requires: [src/lib/redis.ts, src/lib/cookie-auth.ts]
  provides: [newsletter-html-escape, newsletter-redis-rate-limit, newsletter-route-auth]
  affects: [newsletter-subscribe, newsletter-send, newsletter-delete]
tech_stack:
  added: []
  patterns: [redis-rate-limit, route-level-auth, html-escape]
key_files:
  created: []
  modified:
    - src/app/api/db/newsletter/route.ts
    - src/app/api/newsletter/send/route.ts
decisions:
  - Redis checkRateLimit 공용 함수로 뉴스레터 구독 rate limit 통일
  - 재구독 시 토큰 갱신 + 웰컴 이메일 재발송
  - DELETE/send 라우트에 verifyAuthToken 심층 방어 추가
metrics:
  duration: 22min
  completed: "2026-03-26T02:55:52Z"
  tasks: 2
  files: 2
---

# Phase 05 Plan 01: Newsletter Bug Fixes Summary

뉴스레터 웰컴 이메일 HTML 인젝션 차단 + 재구독 토큰 갱신 + Redis rate limit 통일 + 라우트 인증 심층 방어 5건 수정

## Changes Made

### Task 1: 뉴스레터 구독 API 버그 4건 수정 (BUG-N01~N04)
**Commit:** `38ffe39`
**File:** `src/app/api/db/newsletter/route.ts`

- **BUG-N01 (HIGH):** `sendWelcomeEmail`에서 `settings.welcomeBody`와 `settings.footerText`에 `escHtml()` 적용. 관리자 계정 탈취 시 구독자에게 악성 HTML/JS 발송 가능한 취약점 차단.
- **BUG-N02 (MEDIUM):** 재구독(unsubscribed -> active) 시 `token: crypto.randomUUID()`로 갱신. 이전 해지 링크가 무효화되어 재구독 즉시 해제되는 문제 해결. 재구독자에게 웰컴 이메일도 발송.
- **BUG-N03 (MEDIUM):** 인메모리 `subRateLimitMap` 제거, `checkRateLimit` (Redis) 함수로 교체. 서버리스 콜드 스타트에도 rate limit 유지됨.
- **BUG-N04 (LOW):** DELETE 핸들러에 `verifyAuthToken` 인증 검사 추가. 미들웨어와 이중 검증.

### Task 2: 뉴스레터 발송 라우트 인증 추가 + 배포 (BUG-N05)
**Commit:** `cd5a6a2`
**File:** `src/app/api/newsletter/send/route.ts`

- **BUG-N05 (LOW):** POST 핸들러에 `verifyAuthToken` 심층 방어 인증 검사 추가.
- `pnpm build` 성공 확인
- `vercel deploy --prod` 배포 완료 (https://culturepeople.co.kr)

## Deviations from Plan

None - plan executed exactly as written.

## Verification Results

- escHtml이 welcomeBody, footerText 양쪽에 적용됨 (grep 확인)
- subRateLimitMap 완전 제거, redisCheckRateLimit 사용 (grep 확인)
- DELETE 핸들러에 verifyAuthToken 존재 (grep 확인)
- send POST 핸들러에 verifyAuthToken 존재 (grep 확인)
- 재구독 시 crypto.randomUUID() 토큰 갱신 존재 (grep 확인)
- pnpm build 성공 (TypeScript 오류 없음)
- vercel deploy --prod 성공

## Known Stubs

None.

## Self-Check: PASSED

- [x] src/app/api/db/newsletter/route.ts exists
- [x] src/app/api/newsletter/send/route.ts exists
- [x] .planning/phases/05-community-ads/05-01-SUMMARY.md exists
- [x] Commit 38ffe39 found
- [x] Commit cd5a6a2 found
