---
phase: 09-press-import-auto-press-cockroachdb
plan: 02
subsystem: auto-press-cockroachdb
tags: [cockroachdb, auto-press, press-feeds, cron, vercel]
dependency_graph:
  requires:
    - phase: 09-01
      provides: cockroach-db-layer (getUnregisteredFeeds, markAsRegistered)
  provides:
    - auto-press CockroachDB 하이브리드 수집 (뉴스와이어 DB + 정부 보도자료 RSS)
    - 기사 등록 후 press_feeds.registered 상태 업데이트
  affects: [press-feeds-crawler, auto-press-settings]
tech_stack:
  added: []
  patterns: [hybrid-source-collection, db-first-with-rss-fallback]
key_files:
  created: []
  modified:
    - src/app/api/cron/auto-press/route.ts
key_decisions:
  - "뉴스와이어 소스만 CockroachDB 전환, 정부 보도자료는 기존 RSS 유지"
  - "CockroachDB 조회 실패 시 뉴스와이어도 RSS fallback으로 무중단 보장"
  - "markAsRegistered 실패해도 기사 저장에 영향 없음 (try/catch 격리)"
  - "DB body_html 존재 시 fetchOriginContent 건너뛰기로 네트워크 절감"
patterns_established:
  - "하이브리드 소스 수집: DB 우선 + RSS fallback 패턴"
  - "PressTarget 확장: _feedId, _bodyHtml 등 DB 메타 필드 추가"
requirements_completed: [CDB-03, CDB-04]
duration: 23min
completed: 2026-03-27
---

# Phase 09 Plan 02: auto-press CockroachDB 연동 + Vercel 배포 Summary

**auto-press 뉴스와이어 소스를 CockroachDB getUnregisteredFeeds() 기반으로 전환하고, 기사 등록 후 markAsRegistered로 중복 등록 원천 차단 + Vercel 환경변수 등록 및 프로덕션 배포 완료**

## Performance

- **Duration:** 23min
- **Started:** 2026-03-26T16:01:29Z
- **Completed:** 2026-03-26T16:24:30Z
- **Tasks:** 2
- **Files modified:** 1

## Accomplishments
- auto-press 뉴스와이어 소스를 CockroachDB 미등록 건 조회로 전환 (정부 보도자료는 RSS 유지)
- DB body_html이 있으면 fetchOriginContent 건너뛰어 네트워크 비용 및 시간 절감
- 기사 등록 후 markAsRegistered(feedId, articleId)로 중복 등록 원천 차단
- CockroachDB 조회 실패 시 기존 RSS fallback으로 무중단 보장
- Vercel 환경변수 COCKROACH_DATABASE_URL 전 환경(production/preview/development) 등록 + 프로덕션 배포 완료

## Task Commits

1. **Task 1: auto-press 뉴스와이어 소스를 CockroachDB 연동으로 전환** - `fef28ff` (feat)
2. **Task 2: Vercel 환경변수 등록 + 프로덕션 배포** - Vercel CLI로 수행 (코드 변경 없음)

## Files Created/Modified
- `src/app/api/cron/auto-press/route.ts` - CockroachDB import 추가, PressTarget 확장, 하이브리드 소스 수집, DB 본문 우선 상세 수집, markAsRegistered 호출

## Decisions Made

| Decision | Rationale |
|----------|-----------|
| 뉴스와이어 소스 판별 기준: rssUrl에 "newswire.co.kr" 또는 id에 "newswire" 포함 | 기존 소스 설정과 호환되는 안전한 판별 방법 |
| CockroachDB 실패 시 RSS fallback | DB 장애가 전체 auto-press를 중단시키지 않도록 방어 |
| markAsRegistered를 try/catch로 격리 | 기사는 이미 Supabase에 저장됨, CockroachDB 상태 업데이트 실패가 기사 등록을 rollback하면 안 됨 |
| Vercel 환경변수 3개 환경 모두 등록 | production/preview/development 전부 동일한 CockroachDB 연결 필요 |

## Deviations from Plan

None - 플랜 그대로 실행 완료.

## Issues Encountered

None

## Known Stubs

None - 모든 연동이 실제 DB 쿼리 및 상태 업데이트를 수행하며 스텁 없음.

## User Setup Required

None - Vercel 환경변수 등록 및 배포 모두 자동 완료.

## Next Phase Readiness
- Phase 09 전체 완료: CockroachDB press_feeds 공통 레이어 + press-feed API + auto-press 연동
- press-import 뉴스와이어 탭: DB 조회 (Plan 01)
- auto-press 뉴스와이어 소스: DB 미등록 건 조회 + 등록 완료 표시 (Plan 02)
- 정부 보도자료: 기존 RSS 로직 100% 유지

---
*Phase: 09-press-import-auto-press-cockroachdb*
*Completed: 2026-03-27*
