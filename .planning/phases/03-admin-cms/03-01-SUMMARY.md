---
phase: 03-admin-cms
plan: 01
subsystem: admin-settings, article-edit
tags: [bugfix, smtp, loading-state, isDirty, ux]
dependency_graph:
  requires: []
  provides: [smtp-password-safety, edit-page-loading, isDirty-fix]
  affects: [cam/settings, cam/articles/edit]
tech_stack:
  added: []
  patterns: [smtpPassChanged-tracking, isLoadedRef-pattern, pageLoading-guard]
key_files:
  created: []
  modified:
    - src/app/cam/settings/page.tsx
    - src/app/cam/articles/[id]/edit/page.tsx
decisions:
  - smtpPassChanged boolean 상태로 비밀번호 변경 추적 (ref 대신 state 사용 — UI 연동 필요)
  - isLoadedRef + setTimeout(0)으로 초기 로드 vs 사용자 편집 구분
metrics:
  duration: 21min
  completed: "2026-03-26T01:21:10Z"
---

# Phase 03 Plan 01: CRITICAL/HIGH 버그 수정 Summary

SMTP 비밀번호 마스킹 값 저장 방지 + 편집 페이지 로딩 상태 및 isDirty 오작동 수정

## What Was Done

### Task 1: SMTP 비밀번호 마스킹 값 전송 방지 (BUG-01/10)
- `smtpPassChanged` 상태 추가하여 사용자가 실제로 비밀번호를 변경했는지 추적
- 비밀번호 미변경 시 마스킹 값(`"--------"`)을 그대로 전송하여 PUT API 방어 로직이 기존 값 유지
- 비밀번호 변경 시에만 새 값 전송
- 비밀번호 input에 `placeholder="저장된 비밀번호 있음"` 표시 (마스킹 문자열 대신 빈 필드)
- SMTP 테스트 버튼도 동일 패턴 적용
- **Commit:** `5941bc7`

### Task 2: 편집 페이지 로딩 상태 + isDirty 수정 (BUG-03/07)
- `pageLoading` 상태 추가로 데이터 로드 전 빈 폼 노출 차단
- 로딩 중 "기사 데이터를 불러오는 중..." UI 표시
- `isLoadedRef` + `setTimeout(0)` 패턴으로 초기 데이터 로드 시 isDirty false 유지
- 사용자 편집 이후에만 isDirty true 설정 (불필요한 미저장 경고 제거)
- 저장/게시 버튼에 `pageLoading` 비활성화 조건 추가
- **Commit:** `f3d2f67`

## Commits

| Task | Hash | Message |
|------|------|---------|
| 1 | 5941bc7 | fix(03-01): SMTP 비밀번호 마스킹 값 전송 방지 (BUG-01/10) |
| 2 | f3d2f67 | fix(03-01): 편집 페이지 로딩 상태 + isDirty 오작동 수정 (BUG-03/07) |

## Deviations from Plan

None - plan executed exactly as written.

## Known Stubs

None.

## Verification

- pnpm build: SUCCESS (exit 0)
- smtpPassChanged 상태 추가 확인
- pageLoading 상태 + isLoadedRef 추가 확인

## Self-Check: PASSED

- settings/page.tsx: FOUND (smtpPassChanged x5)
- edit/page.tsx: FOUND (pageLoading/isLoadedRef x9)
- Commit 5941bc7: FOUND
- Commit f3d2f67: FOUND
