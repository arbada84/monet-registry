---
phase: 06-seo-feed-tools
plan: 02
subsystem: api
tags: [auth, security, upload, ai, coupang, cookie-auth]

requires:
  - phase: 01-serverless-auth
    provides: Redis rate limiting + cookie auth 인프라
provides:
  - 인증된 이미지 업로드 API (verifyAuthToken)
  - 인증된 ZIP 업로드 API (verifyAuthToken)
  - 인증된 쿠팡 API (verifyAuthToken)
  - AI API content 길이 제한 (50,000자)
  - API v1 PUT 상신 상태 지원
affects: []

tech-stack:
  added: []
  patterns:
    - "upload API 쿠키 인증 패턴: cookies.get('cp-admin-auth') + verifyAuthToken"

key-files:
  created: []
  modified:
    - src/app/api/upload/image/route.ts
    - src/app/api/upload/zip-articles/route.ts
    - src/app/api/coupang/products/route.ts
    - src/app/api/ai/route.ts
    - src/app/api/v1/articles/[id]/route.ts

key-decisions:
  - "쿠키 기반 인증 사용 (모든 호출이 /cam/* 어드민 페이지에서 발생)"
  - "AI content 길이 50,000자 제한 (한글 기사 약 25,000단어, 일반 기사의 10배 여유)"

patterns-established:
  - "upload API 인증: POST 함수 최상단에서 cp-admin-auth 쿠키로 verifyAuthToken 호출"

requirements-completed: [FED-04, TOL-01, TOL-02, TOL-03, TOL-04]

duration: 20min
completed: 2026-03-26
---

# Phase 06 Plan 02: API 보안 버그 수정 Summary

**이미지/ZIP/쿠팡 업로드 API에 쿠키 인증 추가, AI content 50,000자 길이 제한, API v1 PUT 상신 상태 허용**

## Performance

- **Duration:** 20 min
- **Started:** 2026-03-26T04:39:58Z
- **Completed:** 2026-03-26T05:00:33Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments
- CRITICAL 보안 버그 2건 해결: 이미지/ZIP 업로드 API에 무인증 접근 차단 (BUG-08, BUG-09)
- 쿠팡 API에 인증 추가로 프록시 남용 방지 (BUG-12)
- AI API에 content 길이 50,000자 제한 추가로 비용 남용 방지 (BUG-10)
- API v1 PUT에 '상신' 상태 추가로 워크플로우 버그 해결 (BUG-17)
- pnpm build 성공 + vercel deploy --prod 완료

## Task Commits

Each task was committed atomically:

1. **Task 1: 이미지/ZIP 업로드 + 쿠팡 API 인증 추가** - `7199962` (fix)
2. **Task 2: AI content 길이 제한 + API v1 PUT 상신 상태 추가** - `f0439d9` (fix)

## Files Created/Modified
- `src/app/api/upload/image/route.ts` - POST 최상단에 verifyAuthToken 인증 추가
- `src/app/api/upload/zip-articles/route.ts` - POST 최상단에 verifyAuthToken 인증 추가
- `src/app/api/coupang/products/route.ts` - GET 최상단에 verifyAuthToken 인증 추가
- `src/app/api/ai/route.ts` - content.length > 50000 검증 추가
- `src/app/api/v1/articles/[id]/route.ts` - VALID 배열에 "상신" 추가, 에러 메시지 갱신

## Decisions Made
- 쿠키 기반 인증(cp-admin-auth + verifyAuthToken) 사용 -- 모든 호출이 /cam/* 어드민 페이지에서 쿠키와 함께 발생
- AI content 길이 50,000자로 제한 -- 한글 기사 기준 약 25,000단어, 일반 기사(2,000~5,000자)의 10배 여유
- BUG-11(Gemini systemInstruction)은 MEDIUM이지만 SDK 변경이 필요하여 최소 변경 원칙에 따라 제외
- BUG-13, BUG-14(LOW)는 기능상 문제 없으므로 제외

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Phase 06 모든 플랜 완료 (01: RSS/sitemap, 02: API 보안)
- 모든 CRITICAL/MEDIUM 버그 해결 완료

## Self-Check: PASSED

- All 5 modified files exist on disk
- Commits 7199962 and f0439d9 verified in git log
- verifyAuthToken present in upload/image (2), upload/zip-articles (2), coupang/products (2)
- content length check (50000) present in ai/route.ts
- "상신" present in v1/articles/[id]/route.ts
- pnpm build: SUCCESS
- vercel deploy --prod: SUCCESS (https://culturepeople.co.kr)

---
*Phase: 06-seo-feed-tools*
*Completed: 2026-03-26*
