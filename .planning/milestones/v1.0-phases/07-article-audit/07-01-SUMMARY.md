---
phase: 07-article-audit
plan: 01
subsystem: scripts
tags: [audit, data-quality, articles]
dependency_graph:
  requires: []
  provides: [audit-script-v2, audit-result-v2]
  affects: [07-02-PLAN]
tech_stack:
  added: []
  patterns: [supabase-rest-paging, memory-dedup, regex-audit]
key_files:
  created:
    - scripts/audit-articles-v2.mjs
    - scripts/audit-result-v2.json
  modified: []
decisions:
  - 23개 유형 감사 (기존 14 + 신규 9)
  - 중복 검사는 메모리에서 source_url + normalizeTitle 이중 수행
  - 저작권 위험 이미지 도메인 48개 적용
metrics:
  duration: 3min
  completed: "2026-03-26T06:10:00Z"
---

# Phase 7 Plan 1: 강화 감사 스크립트 v2 작성 및 전수 감사 Summary

기존 14유형 + 신규 9유형 = 23유형 감사 스크립트(audit-articles-v2.mjs)를 작성하고 전체 2,985건 기사를 전수 감사하여 27건 문제를 탐지함

## Results

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | 강화 감사 스크립트 v2 작성 | f124cbd | scripts/audit-articles-v2.mjs |
| 2 | 감사 결과 분석 및 수정 전략 확정 | 95cba9f | scripts/audit-result-v2.json |

## Key Outcomes

### 감사 결과 요약

- **총 기사:** 2,985건
- **문제 기사:** 27건 (0.9%)
- **정상 기사:** 2,958건 (99.1%)

### 유형별 현황

| 유형 | 건수 | 분류 |
|------|------|------|
| RISKY_IMAGE (저작권 위험 이미지) | 17 | 수정 |
| DUPLICATE_SOURCE_URL (source_url 중복) | 3 | 삭제 |
| NEWSWIRE (뉴스와이어 잔재) | 3 | 수정 |
| UI_REMNANT (UI 잔재) | 2 | 수정 |
| SHORT_BODY (본문 부족) | 1 | 삭제 |
| BASE64_IMG (base64 이미지) | 1 | 수정 |

### Plan 02 수정 범위

- **삭제 대상:** 4건 (SHORT_BODY 1, DUPLICATE_SOURCE_URL 3)
- **수정 대상:** 23건 (RISKY_IMAGE 17, NEWSWIRE 3, UI_REMNANT 2, BASE64_IMG 1)
- **보류:** 0건

### 기존 14유형 0건 확인

ENCODING, OTHER_MEDIA, COPYRIGHT, HTML_ENTITY, EMPTY_TAGS, OTHER_REPORTER, AD_PROMO, EXTERNAL_LINK, WRONG_AUTHOR, TITLE_MEDIA, HTML_CLASS, SUMMARY_ENTITY, MISSING_CONTENT, BLOCKED_KEYWORD, FORBIDDEN_EXPR -- 모두 0건으로 이전 수정 작업의 효과가 유지됨

## Decisions Made

1. **23개 유형 감사 체계:** 기존 14유형(audit-articles.mjs) + 신규 9유형(RISKY_IMAGE, DUPLICATE_SOURCE_URL, DUPLICATE_TITLE, DUPLICATE_TITLE_DIFF_DATE, NEWSWIRE, UI_REMNANT, NAMECARD, BASE64_IMG, TRACKING_PIXEL, BLOCKED_KEYWORD, FORBIDDEN_EXPR)
2. **중복 검사 이중 기준:** source_url 동일 + 정규화 제목+날짜 동일 두 가지 방식 병행
3. **저작권 위험 도메인 48개:** 통신사/종합일간지/경제지/방송사/스포츠연예/해외 6개 카테고리

## Deviations from Plan

None -- 플랜 그대로 실행됨

## Known Stubs

None

## Self-Check: PASSED
