---
phase: 08-auto-press-rss
plan: 02
subsystem: api
tags: [netpro, rss, auto-press, cleanup, deployment]

requires:
  - phase: 08-auto-press-rss
    provides: 뉴스와이어 전용 파서 (newswire-extract.ts), fetchOriginContent 분기, netpro UI 제거
provides:
  - netpro 경유 코드 완전 제거 (fetchNetproList, fetchNetproDetail, NetproListItem, NetproDetail)
  - netpro API 3개 라우트 삭제 (list, detail, image)
  - 모든 소스가 RSS 직접 수집으로 통합
  - 어드민 UI에서 레거시 카테고리 코드 제거
affects: [auto-press, press-import]

tech-stack:
  added: []
  patterns: [RssTarget 인터페이스로 통합된 수집 타겟, RSS 전용 수집 경로]

key-files:
  created: []
  modified: [src/app/api/cron/auto-press/route.ts, src/app/cam/auto-press/page.tsx]

key-decisions:
  - "netpro/origin은 유지 (press-import 페이지의 범용 원문 추출 기능으로 사용)"
  - "미들웨어의 /api/netpro 매처도 유지 (origin 보호 필요)"
  - "RssTarget 인터페이스로 PressTarget 단순화 (NetproListItem 의존 제거)"

patterns-established:
  - "모든 auto-press 소스가 RSS 경로로 통합: fetchRssFeed -> fetchOriginContent"
  - "wrIds 형식을 sourceId:link으로 변경 (하위호환 유지)"

requirements-completed: [RSS-03, RSS-05]

duration: 16min
completed: 2026-03-26
---

# Phase 8 Plan 2: 넷프로 경유 코드 완전 제거 + RSS 전용화 배포 Summary

**fetchNetproList/fetchNetproDetail 함수 및 netpro API 3개 삭제, 모든 소스 RSS 직접 수집 통합, 어드민 UI 레거시 정리 후 프로덕션 배포**

## Performance

- **Duration:** 16min
- **Started:** 2026-03-26T07:10:34Z
- **Completed:** 2026-03-26T07:26:34Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments
- route.ts에서 NetproListItem, NetproDetail 인터페이스 및 fetchNetproList, fetchNetproDetail 함수 완전 제거
- PressTarget을 RssTarget 기반으로 단순화 (netpro 수집 분기 제거, 모든 소스 RSS 경로 통합)
- netpro/list, netpro/detail, netpro/image API 라우트 삭제 (origin만 유지)
- 어드민 UI에서 NEWSWIRE_CATEGORIES/RSS_CATEGORIES 레거시 코드 및 boTable 분기 표시 제거
- pnpm build 성공 + vercel deploy --prod 배포 완료

## Task Commits

Each task was committed atomically:

1. **Task 1: route.ts 넷프로 코드 완전 제거 + RSS 전용화** - `2561a07` (refactor)
2. **Task 2: netpro API 삭제 + 어드민 UI 정리 + 배포** - `1e2c8e5` (feat)

## Files Created/Modified
- `src/app/api/cron/auto-press/route.ts` - fetchNetproList/fetchNetproDetail 제거, PressTarget을 RssTarget 기반으로 통합, 모든 수집 분기를 RSS 경로로 단순화
- `src/app/api/netpro/list/route.ts` - 삭제
- `src/app/api/netpro/detail/route.ts` - 삭제
- `src/app/api/netpro/image/route.ts` - 삭제
- `src/app/cam/auto-press/page.tsx` - NEWSWIRE_CATEGORIES/RSS_CATEGORIES 제거, boTable=newswire 분기 표시 제거

## Decisions Made
- netpro/origin 라우트는 삭제하지 않음 (press-import 페이지에서 범용 원문 추출로 사용 중)
- 미들웨어의 /api/netpro 매처는 origin 보호를 위해 유지
- RssTarget 인터페이스에 id/title/date/link 최소 필드만 정의 (NetproListItem의 wr_id/category/writer/detail_url 제거)
- wrIds 옵션의 형식을 sourceId:link으로 전환 (하위호환: boTable 기반 소스 검색도 유지)

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## Known Stubs
None

## User Setup Required
None - 외부 서비스 설정 불필요.

## Next Phase Readiness
- Phase 08 auto-press-rss 완전 완료
- auto-press 시스템이 순수 RSS 직접 수집만 사용하도록 전환됨
- 뉴스와이어 전용 파서 (Plan 01) + 넷프로 코드 제거 (Plan 02) 모두 배포 완료

## Self-Check: PASSED

- 08-02-SUMMARY.md: FOUND
- netpro/list: CONFIRMED DELETED
- netpro/detail: CONFIRMED DELETED
- netpro/image: CONFIRMED DELETED
- netpro/origin: FOUND (maintained)
- Commit 2561a07: FOUND
- Commit 1e2c8e5: FOUND

---
*Phase: 08-auto-press-rss*
*Completed: 2026-03-26*
