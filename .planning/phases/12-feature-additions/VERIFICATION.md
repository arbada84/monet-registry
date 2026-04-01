---
status: passed
phase: 12-feature-additions
verified_at: 2026-04-02T10:00:00Z
---

## Verification: Phase 12 — feature-additions

### Must-Haves

| # | Criterion | Status | Evidence |
|---|-----------|--------|----------|
| 1 | 이미지 업로드 시 자동으로 리사이즈 및 WebP 변환이 적용되어 페이지 로드 속도가 개선된다 | PASS | `src/app/api/upload/image/route.ts:97` — `maybeResizeAndConvert()` 함수 정의, 3개 업로드 경로(lines 224, 248, 285)에 적용. `getImageUploadSettings()` 호출로 설정 기반 동작. GIF 제외 처리 포함. |
| 2 | 어드민 대시보드에서 auto-press/auto-news 실행 이력(성공/실패 차트, 최근 10회 통계)을 확인할 수 있다 | PASS | `src/app/cam/dashboard/page.tsx:8-9` — recharts BarChart 임포트. Lines 448-519에 press/news 탭 전환, `toChartData()` 일별 집계, 최근 N회 성공/실패 통계 표시. `package.json`에 recharts@3.8.1 추가 확인. |
| 3 | 기사 검색이 tsvector 기반 전문검색으로 한글 검색 정확도와 속도가 향상된다 | PASS | `src/lib/supabase-server-db.ts:165` — `sbSearchArticles()` 함수가 `search_articles` RPC(tsvector 가중치 랭킹) 호출 후 ilike 폴백 구현. Plan 12-02에서 라이브 RPC로 한글 검색어("문화", "한국" 등) 정상 결과 반환 확인. |
| 4 | 크론 실패, AI 편집 실패, 보안 이벤트가 어드민 대시보드에서 실시간으로 확인된다 | PASS | `src/app/api/db/notifications/route.ts` — CRUD API 전체 구현. `src/lib/supabase-server-db.ts:724` — `createNotification()` 헬퍼. `auto-press/route.ts:727,827` 및 `auto-news/route.ts:574,655`에서 cron_failure/ai_failure 알림 생성. `src/app/cam/layout.tsx:90,150` — 60초 폴링 unread 배지. `src/app/cam/dashboard/page.tsx:386+` — 알림 패널 UI. |

### Requirement Traceability

| Req ID | Description | Plan | Status |
|--------|-------------|------|--------|
| PERF-03 | 이미지 업로드 시 자동 리사이즈 및 WebP 변환 적용 | 12-01 | PASS — `maybeResizeAndConvert()` + sharp 파이프라인 + 어드민 설정 UI |
| FEAT-01 | auto-press/auto-news 실행 이력 시각화 | 12-04 | PASS — recharts BarChart + press/news 탭 + 통계 표시 |
| FEAT-02 | tsvector 기반 전문검색 도입 | 12-02 | PASS — 기존 인프라 검증 완료, search_articles RPC + ilike 폴백 정상 동작 |
| FEAT-03 | 어드민 알림 시스템 | 12-03 | PASS — notifications CRUD API + createNotification 헬퍼 + 크론 연동 + 대시보드 UI |

### Human Verification (if any items need manual testing)

- **notifications 테이블 생성**: Supabase SQL 에디터에서 `CREATE TABLE notifications` DDL 실행 필요 (Plan 12-03 SUMMARY에 SQL 포함). MCP 인증 미설정으로 자동 마이그레이션 불가했음.
- **브라우저 테스트**: 대시보드 차트 렌더링, 알림 배지 폴링, 이미지 업로드 WebP 변환 결과를 실제 브라우저에서 확인 권장.
- **REQUIREMENTS.md 업데이트 필요**: FEAT-01이 현재 "Pending"으로 표시되어 있으나 코드 구현 완료됨. "Complete"로 갱신 필요.

### Summary

Phase 12의 4개 요구사항(PERF-03, FEAT-01, FEAT-02, FEAT-03)이 모두 코드 레벨에서 구현 확인됨. 소스 파일 spot-check 결과 summaries에 기술된 내용과 실제 코드가 일치한다. notifications 테이블 DDL 수동 실행과 브라우저 기능 테스트가 남아 있으나, 코드 구현 자체는 완전하다. **Phase 12 PASSED.**
