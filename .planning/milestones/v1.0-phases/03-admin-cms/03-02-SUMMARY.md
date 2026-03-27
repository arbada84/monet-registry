---
phase: 03-admin-cms
plan: 02
subsystem: admin-articles-dashboard
tags: [bugfix, ux, performance]
dependency_graph:
  requires: []
  provides: [trash-count-display, duplicate-createdAt, dashboard-body-strip, maintenance-collapse]
  affects: [src/app/cam/articles/page.tsx, src/app/cam/dashboard/page.tsx]
tech_stack:
  added: []
  patterns: [collapsible-ui, body-strip-memory-optimization]
key_files:
  created: []
  modified:
    - src/app/cam/articles/page.tsx
    - src/app/cam/dashboard/page.tsx
decisions:
  - 휴지통 카운트는 초기 로드 시 getDeletedArticles()로 별도 요청하여 trashCount 상태에 저장
  - body 제거는 클라이언트 측 메모리 절약만 (서버사이드 select는 PERF-01 v2 범위)
  - 유지보수 버튼 3개만 접기 대상 (예약 발행은 일반 작업으로 유지)
metrics:
  duration: 21min
  completed: "2026-03-26T01:20:43Z"
  tasks: 2
  files: 2
---

# Phase 03 Plan 02: 기사 목록/대시보드 MEDIUM/HIGH 버그 4건 수정 Summary

휴지통 카운트 초기 표시(BUG-04), 복제 createdAt 설정(BUG-12), 대시보드 body 메모리 제거(BUG-05), 유지보수 버튼 접기(BUG-11) -- 4건 버그 수정

## What Was Done

### Task 1: 휴지통 카운트 초기 로드 + 복제 createdAt (BUG-04/12)
- **BUG-04**: 초기 useEffect의 Promise.allSettled에 `getDeletedArticles()` 추가, `trashCount` 상태로 관리
- 휴지통 버튼 표시를 `trashArticles.length` 대신 `trashCount` 사용
- 삭제/복원/영구삭제 시 trashCount 동기화
- **BUG-12**: `handleDuplicate`에서 복제 기사 객체에 `createdAt: new Date().toISOString()` 추가
- **Commit:** a8c6806

### Task 2: 대시보드 body 제외 로드 + 유지보수 버튼 접기 (BUG-05/11)
- **BUG-05**: getArticles() 결과에서 body 필드를 destructuring으로 제거하여 클라이언트 메모리 절약
- **BUG-11**: 유지보수 도구 3개 버튼(일련번호 할당, 썸네일 중복 제거, 외부 이미지 재업로드)을 접기/펼치기 토글로 감쌈 (기본 접힌 상태)
- **Commit:** 2a17d46

## Deviations from Plan

None - plan executed exactly as written.

## Verification

- `pnpm build` 성공 (두 태스크 모두)
- articles/page.tsx에 trashCount 상태 및 초기 로드 확인
- dashboard/page.tsx에 showMaintenance 상태 및 body 제거 확인

## Known Stubs

None.
