---
phase: 09-press-import-auto-press-cockroachdb
plan: 01
subsystem: press-feed-cockroachdb
tags: [cockroachdb, press-feeds, api, database]
dependency_graph:
  requires: []
  provides: [cockroach-db-layer, press-feed-db-integration]
  affects: [press-import-ui, auto-press]
tech_stack:
  added: [pg-types]
  patterns: [singleton-pool, db-first-fallback]
key_files:
  created:
    - src/lib/cockroach-db.ts
  modified:
    - src/app/api/press-feed/route.ts
    - src/app/api/press-feed/detail/route.ts
    - package.json
    - pnpm-lock.yaml
decisions:
  - "싱글톤 Pool 패턴으로 서버리스 커넥션 폭발 방지 (max: 5)"
  - "뉴스와이어 탭만 CockroachDB 전환, 정부 보도자료 탭은 기존 RSS 유지"
  - "CockroachDB 연결 실패 시 기존 RSS fallback으로 무중단 보장"
  - "detail API에서 DB body_html 우선 조회 후 원문 fetch fallback"
metrics:
  duration: 47min
  completed: "2026-03-27T00:00:00Z"
---

# Phase 09 Plan 01: CockroachDB 공통 DB 레이어 + press-feed API 연동 Summary

CockroachDB press_feeds 테이블을 공통 데이터 소스로 활용하는 DB 레이어를 생성하고, press-feed 목록/상세 API를 DB 우선 조회 + RSS fallback 패턴으로 전환 완료

## Tasks Completed

### Task 1: CockroachDB 공통 DB 레이어 생성 + @types/pg 설치
- **Commit:** 8d0c054
- **Files:** src/lib/cockroach-db.ts (신규), package.json, pnpm-lock.yaml
- **Details:**
  - 싱글톤 Pool 패턴 (docs/cockroachdb-guide.md 기반)
  - PressFeed 인터페이스 정의 (16개 필드)
  - 5개 함수 export: getPool, getPressFeeds, getPressFeedByUrl, getUnregisteredFeeds, markAsRegistered
  - safeJsonArray로 images/tags JSON 안전 파싱
  - COCKROACH_DATABASE_URL 미설정 시 명확한 에러 메시지
  - 파라미터 바인딩($1, $2) 기반 SQL 인젝션 방지

### Task 2: press-feed 목록 API + detail API CockroachDB 연동
- **Commit:** eeea06e
- **Files:** src/app/api/press-feed/route.ts, src/app/api/press-feed/detail/route.ts
- **Details:**
  - 뉴스와이어 탭: getPressFeeds() 호출로 CockroachDB 조회
  - CockroachDB 실패 시 기존 NEWSWIRE_FEEDS RSS fallback 자동 전환
  - 정부 보도자료(rss) 탭: 기존 RSS_FEEDS + fetchRssFeed 로직 완전 유지
  - detail API: getPressFeedByUrl() 우선 조회 후 body_html 반환
  - DB에 body_html 없거나 조회 실패 시 원문 fetch + 뉴스와이어/범용 파서 fallback

## Deviations from Plan

None - 플랜 그대로 실행 완료.

## Decisions Made

| Decision | Rationale |
|----------|-----------|
| 뉴스와이어 탭만 DB 전환 | press_feeds에 뉴스와이어 데이터만 존재, 정부 보도자료는 크롤러 미구현 |
| DB 실패 시 RSS fallback | COCKROACH_DATABASE_URL 미설정/연결 실패 시 기존 동작 보장으로 무중단 |
| try/catch 감싸기 | CockroachDB 장애가 전체 API를 중단시키지 않도록 방어 |
| NEWSWIRE_FEEDS 상수 유지 | fallback용으로 남겨둠 (삭제하면 DB 장애 시 완전 불능) |

## Verification

- pnpm build 성공 (타입 에러 0, warning만 기존 img 태그 관련)
- src/lib/cockroach-db.ts에서 5개 함수 export 확인
- API 응답 형태 기존 FeedItem과 동일 (press-import/page.tsx 호환)

## Known Stubs

None - 모든 함수가 실제 DB 쿼리를 수행하며 스텁 없음.

## Self-Check: PASSED

- cockroach-db.ts: FOUND
- press-feed/route.ts: FOUND
- press-feed/detail/route.ts: FOUND
- Commit 8d0c054: FOUND
- Commit eeea06e: FOUND
