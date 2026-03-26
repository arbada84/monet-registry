---
phase: 02-public-pages
plan: 02
subsystem: ui
tags: [nextjs, supabase, performance, category, breadcrumb]

requires:
  - phase: 01-critical-infra
    provides: Redis rate limiting + token blacklist
provides:
  - 카테고리 페이지 사이드바 인기 기사 10건 최적화 쿼리
  - 기사 상세 breadcrumb URL-safe 카테고리 링크
affects: []

tech-stack:
  added: []
  patterns:
    - serverGetTopArticles(10) 사이드바용 인기 기사 조회 패턴

key-files:
  created: []
  modified:
    - src/app/category/[slug]/page.tsx
    - src/app/article/[id]/page.tsx

key-decisions:
  - "카테고리 페이지 allArticles를 serverGetTopArticles(10)으로 교체 (DB 레벨 limit, 3000건 -> 10건)"
  - "breadcrumb 카테고리에 encodeURIComponent + null 폴백 적용"

patterns-established:
  - "사이드바 인기 기사: serverGetTopArticles(limit) 사용 (전체 기사 로드 금지)"

requirements-completed: [PUB-01, PUB-02, PUB-03]

duration: 8min
completed: 2026-03-26
---

# Phase 02 Plan 02: 카테고리/기사상세 페이지 최적화 Summary

**카테고리 페이지 전체 기사 로드(3000건)를 인기 기사 10건 조회로 교체하고, 기사 상세 breadcrumb 카테고리 URL을 encodeURIComponent로 안전 처리**

## Performance

- **Duration:** 8 min
- **Started:** 2026-03-26T00:33:12Z
- **Completed:** 2026-03-26T00:41:00Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments
- 카테고리 페이지 ISR 재생성 시 Supabase 불필요 전체 기사 호출 제거 (3000건 -> 10건)
- 기사 상세 breadcrumb 카테고리 링크 URL 인코딩으로 특수문자 안전 처리
- 미사용 searchParams Props 인터페이스 정리
- pnpm build 전체 성공 확인

## Task Commits

Each task was committed atomically:

1. **Task 1: 카테고리 페이지 allArticles 최적화 + searchParams 제거** - `6dfa40c` (fix)
2. **Task 2: 기사 상세 breadcrumb 카테고리 URL 인코딩 + 빌드 검증** - `7ccd587` (fix)

## Files Created/Modified
- `src/app/category/[slug]/page.tsx` - serverGetArticles() -> serverGetTopArticles(10) 교체, searchParams 제거
- `src/app/article/[id]/page.tsx` - breadcrumb 카테고리 링크에 encodeURIComponent 적용

## Decisions Made
- serverGetTopArticles(10)은 이미 db-server.ts에 존재하는 함수를 활용 (신규 코드 작성 불필요)
- encodeURIComponent에 || "" 폴백을 추가하여 null/undefined 방어

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
- pnpm build 첫 시도 시 .next 캐시 손상으로 ENOENT 에러 발생 -> .next 삭제 후 클린 빌드로 해결 (코드 변경과 무관한 캐시 문제)

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- 공개 페이지 최적화 완료, 다음 phase 진행 가능
- 홈페이지 전체 기사 로드(BUG-01), 태그 페이지 하드코딩 색상(BUG-03) 등은 별도 plan에서 처리 필요

## Self-Check: PASSED

- [x] src/app/category/[slug]/page.tsx - FOUND
- [x] src/app/article/[id]/page.tsx - FOUND
- [x] Commit 6dfa40c - FOUND
- [x] Commit 7ccd587 - FOUND
- [x] serverGetArticles() not in category page - VERIFIED
- [x] serverGetTopArticles(10) in category page - VERIFIED
- [x] encodeURIComponent in article breadcrumb - VERIFIED

---
*Phase: 02-public-pages*
*Completed: 2026-03-26*
