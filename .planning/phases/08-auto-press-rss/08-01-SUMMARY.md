---
phase: 08-auto-press-rss
plan: 01
subsystem: api
tags: [newswire, rss, html-parser, auto-press, scraping]

requires:
  - phase: 07-article-audit
    provides: 기사 품질 감사 체계 (중복 검사, 저작권 위험 도메인)
provides:
  - 뉴스와이어 전용 본문/이미지/메타데이터 추출기 (newswire-extract.ts)
  - fetchOriginContent()의 뉴스와이어 URL 자동 분기
  - AutoPressSource 타입에서 netpro 제거
  - 넷프로 경유 소스 5개 기본값 제거
  - DB 설정 런타임 마이그레이션 로직
affects: [08-02, auto-press, press-import]

tech-stack:
  added: []
  patterns: [뉴스와이어 section.article_column 파싱, data-src 원본 이미지 추출, DB 설정 런타임 마이그레이션]

key-files:
  created: [src/lib/newswire-extract.ts]
  modified: [src/app/api/cron/auto-press/route.ts, src/types/article.ts, src/lib/auto-defaults.ts, src/app/cam/auto-press/page.tsx]

key-decisions:
  - "뉴스와이어 전용 파서를 별도 모듈로 분리 (html-extract.ts 수정 없이 확장)"
  - "AutoPressSource.boTable을 string 타입으로 완화 (DB 하위호환성 확보)"
  - "넷프로 소스 DB 마이그레이션을 런타임 자동 처리 (DB 직접 수정 불필요)"
  - "auto-press 관리 페이지에서 netpro UI 완전 제거 (RSS만 추가 가능)"

patterns-established:
  - "뉴스와이어 URL 감지: isNewswireUrl()로 전용 파서 분기"
  - "이미지 고해상도 변환: thumb_*/thumb_480/thumb_640 -> data 경로 치환"

requirements-completed: [RSS-01, RSS-02, RSS-04]

duration: 18min
completed: 2026-03-26
---

# Phase 8 Plan 1: 뉴스와이어 전용 본문 추출기 + 넷프로 소스 제거 Summary

**뉴스와이어 section.article_column 기반 전용 파서로 본문/이미지/메타 정밀 추출, fetchOriginContent 자동 분기, 넷프로 경유 소스 5개 제거 및 DB 런타임 마이그레이션**

## Performance

- **Duration:** 18min
- **Started:** 2026-03-26T06:49:30Z
- **Completed:** 2026-03-26T07:07:30Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments
- 뉴스와이어 전용 본문 추출기 newswire-extract.ts 작성 (section.article_column, data-src 이미지, 바이라인 제거)
- fetchOriginContent()가 뉴스와이어 URL 감지 시 전용 파서를 자동으로 사용하도록 분기 추가
- AutoPressSource 타입에서 fetchType: "netpro" 옵션 완전 제거
- auto-defaults.ts에서 넷프로 경유 5개 소스 (gov_policy, gov_press, nw_all, nw_economy, nw_culture) 제거
- DB에 저장된 기존 netpro 설정을 런타임에 자동 필터링하는 마이그레이션 로직 추가
- 관리 페이지 UI에서 netpro 관련 옵션 완전 제거

## Task Commits

Each task was committed atomically:

1. **Task 1: 뉴스와이어 전용 본문 추출기 작성 + fetchOriginContent 분기** - `f8fbcf1` (feat)
2. **Task 2: AutoPressSource 타입 정리 + 넷프로 경유 소스 기본값 제거 + DB 설정 마이그레이션** - `4f81548` (feat)

## Files Created/Modified
- `src/lib/newswire-extract.ts` - 뉴스와이어 전용 본문/이미지/메타데이터 추출기 (isNewswireUrl, extractNewswireArticle)
- `src/app/api/cron/auto-press/route.ts` - fetchOriginContent에 뉴스와이어 분기 추가 + DB 설정 마이그레이션 로직
- `src/types/article.ts` - AutoPressSource 타입에서 fetchType "netpro" 옵션 제거, boTable string 타입 변경
- `src/lib/auto-defaults.ts` - 넷프로 경유 소스 5개 제거
- `src/app/cam/auto-press/page.tsx` - 관리 UI에서 netpro 옵션 제거, RSS만 추가 가능

## Decisions Made
- 뉴스와이어 전용 파서를 별도 모듈(newswire-extract.ts)로 분리하여 기존 html-extract.ts를 수정하지 않음
- AutoPressSource.boTable을 literal union에서 string으로 완화 (DB 저장된 기존 설정의 "newswire" 값 호환)
- netpro 소스 마이그레이션을 DB 직접 수정 대신 런타임 필터링으로 처리 (배포 즉시 적용, 롤백 용이)
- 관리 페이지 소스 추가에서 netpro 옵션 완전 제거 (새 소스는 RSS만 추가 가능)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] auto-press 관리 페이지 빌드 에러 수정**
- **Found during:** Task 2 (타입 정리)
- **Issue:** auto-press/page.tsx에도 fetchType: "netpro"가 하드코딩되어 있어 타입 변경 후 빌드 실패
- **Fix:** 페이지의 DEFAULT_SOURCES에서 넷프로 5개 소스 제거, UI에서 netpro 관련 옵션/상태 완전 제거
- **Files modified:** src/app/cam/auto-press/page.tsx
- **Verification:** pnpm build 성공
- **Committed in:** 4f81548 (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 bug)
**Impact on plan:** 플랜에 명시되지 않은 관리 페이지 수정이 필요했으나, 타입 변경의 필수 연쇄 수정. 스코프 확장 없음.

## Issues Encountered
None

## Known Stubs
None

## User Setup Required
None - 외부 서비스 설정 불필요.

## Next Phase Readiness
- 뉴스와이어 전용 본문 추출기 완성, 08-02 플랜 (넷프로 API 코드 제거) 진행 준비 완료
- fetchOriginContent()가 뉴스와이어 URL을 자동 감지하므로 기존 RSS 수집 흐름에 즉시 적용 가능

---
*Phase: 08-auto-press-rss*
*Completed: 2026-03-26*
