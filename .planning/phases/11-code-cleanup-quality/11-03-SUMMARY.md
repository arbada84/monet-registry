---
phase: 11-code-cleanup-quality
plan: "03"
subsystem: scripts, eslint
tags: [cleanup, archive, eslint, code-quality]
dependency_graph:
  requires: ["11-01", "11-02"]
  provides: ["scripts/_archive/ directory", "no-explicit-any warn rule"]
  affects: ["eslint.config.mjs", "src/lib/search/index.ts"]
tech_stack:
  added: []
  patterns: ["eslint-disable for complex generics", "script archival convention"]
key_files:
  created:
    - scripts/_archive/README.md
  modified:
    - eslint.config.mjs
    - src/lib/search/index.ts
decisions:
  - "package.json scripts 참조 스크립트 12개는 활성으로 유지 (validate-metadata, query-metadata 등)"
  - "Registry 컴포넌트에 no-explicit-any: off 명시 추가 (1000+ 파일 warn 방지)"
  - "Orama<any>는 eslint-disable 주석으로 예외 처리 (내부 제네릭 타입 복잡)"
metrics:
  duration: "9min"
  completed: "2026-04-01T08:34:00Z"
  tasks_completed: 2
  tasks_total: 2
  files_changed: 58
---

# Phase 11 Plan 03: Script Archive + ESLint Quality Summary

일회성 스크립트 54개를 scripts/_archive/로 아카이브하고, 루트 레거시 SQL/Python 파일을 정리하며, ESLint no-explicit-any를 warn으로 활성화

## Tasks Completed

### Task 1: 일회성 스크립트 아카이브 + 레거시 SQL/Python 정리
**Commit:** f72a742

- scripts/_archive/ 디렉토리 생성 및 54개 일회성 스크립트 이동 (git mv 사용)
  - 기사 전수검수 스크립트 9개 (audit-*)
  - 배치 재편집 2개 (batch-reedit-*)
  - 블로그 마이그레이션 5개 (blog-*)
  - 섹션 캡처 4개 (*-section-capture*)
  - 크롤링/테스트 15개 (test-*, crawl-*)
  - 수정 스크립트 7개 (fix-*)
  - 기타 일회성 12개
- 루트 레거시 파일 정리:
  - migration.sql -> scripts/_archive/ (아카이브)
  - mysql-schema.sql -> git rm (MySQL 미사용)
  - migrate_db.py -> scripts/_archive/ (아카이브)
  - migrate_import.py -> scripts/_archive/ (아카이브)
- scripts/_archive/README.md 생성
- supabase-schema.sql은 현재 DB 스키마 참조용으로 유지
- package.json에서 참조하는 스크립트 19개는 활성 유지

### Task 2: ESLint no-explicit-any warn 활성화 + 위반 수정
**Commit:** 0a2bae2

- eslint.config.mjs: no-explicit-any "off" -> "warn" 변경
- Registry 컴포넌트(src/components/registry/**)에 no-explicit-any: "off" 오버라이드 추가
- src/lib/search/index.ts: Orama<any>에 eslint-disable 주석 추가
- pnpm build 성공, pnpm lint 에러 0건 확인

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing] Registry 컴포넌트 no-explicit-any 오버라이드 누락**
- **Found during:** Task 2
- **Issue:** 글로벌 규칙을 warn으로 변경하면 1000+개 registry 컴포넌트에서 대량 경고 발생
- **Fix:** Registry 파일 패턴에 no-explicit-any: "off" 오버라이드 추가
- **Files modified:** eslint.config.mjs
- **Commit:** 0a2bae2

**2. [Rule 3 - Blocking] package.json 참조 스크립트 아카이브 방지**
- **Found during:** Task 1
- **Issue:** 계획의 아카이브 대상 중 query-metadata.ts, search-metadata.ts, stats-metadata.ts, validate-metadata.ts, add-draft-field.ts, set-draft-by-page.ts가 package.json scripts에서 참조됨
- **Fix:** 이 6개 파일을 아카이브 대상에서 제외하여 활성 유지
- **Files modified:** 없음 (이동하지 않음)
- **Commit:** f72a742

## Decisions Made

1. **package.json 참조 스크립트 보존**: 계획에서 아카이브 대상이었지만 package.json scripts에서 참조하는 파일(validate-metadata.ts 등 6개)은 활성 유지
2. **Registry 컴포넌트 별도 규칙**: 글로벌 warn 활성화 시 registry 1000+개 파일 경고 방지를 위해 off 오버라이드 추가
3. **Orama 타입 예외 처리**: 복잡한 내부 제네릭으로 인해 eslint-disable 주석 사용 (방법 B)

## Known Stubs

None - 모든 변경사항이 완전히 적용됨.

## Verification Results

- scripts/_archive/: 55개 파일 (README 포함)
- 활성 scripts/: 19개 파일 + scrape/, screenshot/ 디렉토리
- 루트 레거시 파일: 모두 제거됨 (migration.sql, mysql-schema.sql, migrate_db.py, migrate_import.py)
- supabase-schema.sql: 유지됨
- ESLint: no-explicit-any warn 활성, 에러 0건
- 빌드: pnpm build 성공
- 린트: pnpm lint 성공 (에러 0건)

## Self-Check: PASSED

- scripts/_archive/ directory: FOUND
- scripts/_archive/README.md: FOUND
- eslint.config.mjs: FOUND
- src/lib/search/index.ts: FOUND
- SUMMARY.md: FOUND
- Commit f72a742: FOUND
- Commit 0a2bae2: FOUND
