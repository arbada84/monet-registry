---
phase: 04-automation
plan: 01
subsystem: cron-automation
tags: [bugfix, security, cron, ai-edit, dedup]
dependency_graph:
  requires: []
  provides: [ai-edit-safe, timing-safe-cron, cache-ttl, fail-retry, unicode-normalize]
  affects: [auto-news, auto-press, publish, ai-prompt]
tech_stack:
  added: []
  patterns: [timing-safe-equal, unicode-property-escapes, ttl-cache]
key_files:
  created: []
  modified:
    - src/lib/ai-prompt.ts
    - src/app/api/cron/auto-news/route.ts
    - src/app/api/cron/auto-press/route.ts
    - src/app/api/cron/publish/route.ts
decisions:
  - AI 편집 5분 대기 완전 제거 (3회 시도 후 즉시 반환, Vercel 60초 타임아웃 안전)
  - normalizeTitle에 유니코드 속성 이스케이프(\p{L}\p{N}) 적용으로 다국어 지원
metrics:
  duration: 24min
  completed: "2026-03-26T02:08:00Z"
---

# Phase 04 Plan 01: 자동화 파이프라인 CRITICAL 버그 수정 Summary

AI 편집 5분 대기 제거(CRITICAL), GET secret timing-safe 교체, DB 캐시 TTL, fail 기사 재시도, 다국어 normalizeTitle -- 총 6건 버그 수정

## What Was Done

### Task 1: BUG-01 AI 5분 대기 제거 + BUG-02 GET secret timing-safe 교체
**Commit:** `65c10e9`

- **ai-prompt.ts**: 1차 3회 실패 후 5분(300초) 대기 + 2차 2회 시도 루프 전체 제거. 이제 3회 시도 후 즉시 null 반환 (최대 ~15초 소요, Vercel 60초 타임아웃 내 안전)
- **auto-news/auto-press/publish GET**: `url.searchParams.get("secret") === cronSecret`을 `timingSafeEqual(url.searchParams.get("secret") ?? "", cronSecret)`으로 교체. 타이밍 공격 방어

### Task 2: BUG-04 캐시 TTL + BUG-10 fail 재시도 + BUG-11 normalizeTitle 다국어
**Commit:** `4fe7b6c`

- **auto-news DB 캐시 TTL**: `_dbArticlesCache`에 `ts: number` 필드 + `DB_CACHE_TTL = 30분` 추가 (auto-press와 동일 패턴)
- **fail 기사 재시도**: auto-news/auto-press의 `isDuplicate()`에서 `status === "fail"` 조건 제거. 실패 기사가 다음 cron에서 재시도 가능
- **normalizeTitle 다국어**: `[^\w가-힣]` -> `[^\p{L}\p{N}]` (유니코드 속성 이스케이프). 일본어/중국어 등 다국어 제목 정규화 정상 작동
- **reviewNote 메시지 수정**: auto-news의 "5회 재시도 소진" -> "3회 재시도 소진" (실제 횟수 반영)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] auto-news reviewNote "5회" -> "3회" 메시지 수정**
- **Found during:** Task 2
- **Issue:** BUG-01에서 재시도를 3회로 줄였는데, auto-news의 reviewNote에 "5회 재시도 소진"이라는 메시지가 남아있었음
- **Fix:** "3회 재시도 소진"으로 수정
- **Files modified:** src/app/api/cron/auto-news/route.ts
- **Commit:** 4fe7b6c

## Verification Results

1. `pnpm build` -- 성공 (타입 에러 없음)
2. `grep "5 * 60 * 1000" ai-prompt.ts` -- 결과 없음 (5분 대기 제거 확인)
3. `grep 'searchParams.get("secret") ===' src/app/api/cron/` -- 결과 없음 (timing-safe 교체 확인)
4. `grep 'status === "fail"' isDuplicate` -- 중복 판정에서 제거 확인
5. Vercel 배포 성공: https://culturepeople.co.kr

## Known Stubs

None -- 모든 수정이 완전히 적용됨.

## Self-Check: PASSED

- All 4 modified files exist
- Commits 65c10e9 and 4fe7b6c verified in git log
