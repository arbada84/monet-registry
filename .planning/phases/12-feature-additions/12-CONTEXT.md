# Phase 12: 기능 추가 - Context

**Gathered:** 2026-04-01
**Status:** Ready for planning

<domain>
## Phase Boundary

운영 효율을 높이는 새 기능 4가지를 추가한다:
1. 이미지 업로드 시 자동 리사이즈/WebP 변환
2. auto-press/auto-news 실행 이력 시각화 (어드민 대시보드)
3. tsvector 기반 전문검색 전환 (한글 검색 정확도/속도 개선)
4. 어드민 알림 시스템 (크론 실패/AI 실패 알림)

</domain>

<decisions>
## Implementation Decisions

### 이미지 처리
- **D-01:** API 라우트에서 sharp 라이브러리로 리사이즈 + WebP 변환 후 Supabase Storage에 업로드
- **D-02:** 어드민 설정에서 최대 크기/품질을 사용자가 조정 가능하게 구현 (기본값 설정 필요)
- **D-03:** 기존 업로드 이미지는 변환하지 않음 — 새 업로드부터만 적용

### 자동화 이력 시각화
- **D-04:** Recharts 라이브러리로 바 차트 구현 (일별 성공/실패 건수)
- **D-05:** auto-press / auto-news를 탭으로 분리하여 각각 이력 표시
- **D-06:** 어드민 대시보드에 이력 패널 추가 (기존 distribute-logs API 활용)

### 전문검색 전환
- **D-07:** tsvector 인덱스 대상: 제목(가중치 A) + 본문(가중치 B)
- **D-08:** pg_trgm(trigram) 병용하여 한글 부분 매칭 지원
- **D-09:** 기존 검색 UI 유지, 백엔드 쿼리만 tsvector로 전환
- **D-10:** 기존 supabase-server-db.ts의 tsvector 코드 확장하여 구현

### 알림 시스템
- **D-11:** Supabase notifications 테이블에 알림 저장
- **D-12:** 어드민 대시보드에 알림 패널 추가 + 헤더에 배지 아이콘 (폴링 방식)
- **D-13:** 초기 알림 유형: 크론 실패(auto-press/auto-news), AI 편집 실패. 보안 이벤트는 이후 추가

### Claude's Discretion
- sharp 리사이즈 기본값 (크기/품질) 설정
- Recharts 바 차트 세부 디자인 (색상, 기간 범위)
- tsvector 인덱스 생성 마이그레이션 구체 전략
- 알림 테이블 스키마 설계, 폴링 주기

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### 이미지 업로드
- `src/app/api/upload/image/route.ts` — 현재 이미지 업로드 API
- `src/lib/supabase-server-db.ts` — Supabase Storage 접근 패턴

### 자동화 로그
- `src/app/api/db/distribute-logs/route.ts` — 현재 자동화 로그 API
- `src/app/api/cron/auto-press/route.ts` — auto-press 크론 라우트
- `src/app/api/cron/auto-news/route.ts` — auto-news 크론 라우트
- `src/types/article.ts` — DistributeLog 타입 정의

### 전문검색
- `src/lib/supabase-server-db.ts` — 기존 tsvector 전문검색 코드 (161줄 부근)
- `supabase-schema.sql` — 현재 DB 스키마

### 알림
- `src/app/cam/` — 어드민 대시보드 페이지 구조
- `src/lib/cookie-auth.ts` — 인증 패턴

### 프로젝트 규약
- `.claude/skills/culturepeople-master/SKILL.md` — 인프라/DB/API 개발 규약

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `distribute-logs` API: 자동화 로그 CRUD 이미 존재 — 이력 시각화에서 활용
- `supabase-server-db.ts`: tsvector 전문검색 코드 일부 존재 — 확장하여 사용
- `DistributeLog` 타입: 이미 정의됨
- shadcn/ui 컴포넌트: 탭, 카드 등 UI 빌딩 블록 활용 가능
- `cookie-auth.ts` + `verifyAuthToken`: 어드민 API 인증 패턴

### Established Patterns
- DB 접근: db-server.ts → supabase-server-db.ts 위임 패턴 (Phase 11에서 정리 완료)
- API 라우트: NextResponse JSON 반환, verifyAuthToken 인증
- 어드민 페이지: `/cam/` 경로, 컬처피플 테마

### Integration Points
- 이미지 업로드: `src/app/api/upload/image/route.ts` 수정
- 자동화 이력: `/cam/` 대시보드에 새 섹션/탭 추가
- 전문검색: `supabase-server-db.ts` 검색 함수 교체
- 알림: 크론 라우트에 실패 시 알림 생성 로직 삽입

</code_context>

<specifics>
## Specific Ideas

- Vercel Hobby 플랜의 이미지 최적화 쿼터 제한으로 서버사이드 sharp 처리 필수
- 어드민 설정에서 이미지 크기/품질 조정 가능하게 (운영자 유연성)
- 한글 검색은 tsvector simple 파서 + pg_trgm 병용이 가장 효과적
- 알림은 폴링 방식으로 시작 (Supabase Realtime은 이후 고려)

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 12-feature-additions*
*Context gathered: 2026-04-01*
