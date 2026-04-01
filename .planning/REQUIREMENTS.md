# Requirements: 컬처피플 뉴스 포털

**Defined:** 2026-03-31
**Core Value:** 모든 기존 기능이 기획 의도대로 정상 작동해야 한다

## v2.0 Requirements

v1.0 전수 점검 완료 후 축적된 기술 부채 해소 + 운영 안정성/성능 강화

### 성능 최적화

- [ ] **PERF-01**: serverGetArticles() 전체 테이블 스캔 20곳+을 목적별 쿼리(serverGetRecentArticles, serverGetArticleIds 등)로 전환하여 불필요한 데이터 전송 제거
- [ ] **PERF-02**: /api/db/articles GET 핸들러의 클라이언트 사이드 필터링을 Supabase DB 레벨 필터링(ilike, status, category)으로 전환
- [ ] **PERF-03**: 이미지 업로드 시 자동 리사이즈 및 WebP 변환 적용 (Vercel 이미지 최적화 대안)

### 보안 강화

- [ ] **SEC-01**: 인메모리 rate limit 잔여분(commentRateMap, cronRateLimitMap, memAttempts)을 Upstash Redis로 전환
- [ ] **SEC-02**: Cookie secure 플래그를 NODE_ENV 의존 없이 항상 true로 강제
- [ ] **SEC-03**: CSP nonce 기반 전환 검토 및 적용 (unsafe-inline/unsafe-eval 최소화)

### 코드 정리

- [ ] **CLEAN-01**: 루트 디렉토리 temp 파일 34개+ 삭제 및 .gitignore 패턴 추가 (temp_*, tmp_*, cookies.txt, nul)
- [ ] **CLEAN-02**: MySQL/File DB 폴백 코드 제거 (db-server.ts, mysql-db.ts, file-db.ts 프로덕션 미사용 경로)
- [ ] **CLEAN-03**: 댓글 라우트(comments/route.ts) Supabase REST 클라이언트 중복 구현을 supabase-server-db.ts로 통합
- [ ] **CLEAN-04**: 일회성 migration/test/fix 스크립트 25개+를 scripts/_archive/로 이동, 레거시 SQL/Python 파일 정리

### 테스트

- [ ] **TEST-01**: 핵심 비즈니스 로직 단위 테스트 추가 (cookie-auth 토큰 생성/검증, db-server 기사 CRUD, cron 작업 핵심 함수)
- [ ] **TEST-02**: 어드민 UI 주요 플로우 E2E 테스트 추가 (기사 작성/편집/삭제, 설정 저장)

### 코드 품질

- [ ] **QUAL-01**: ESLint no-explicit-any 규칙을 warn 레벨로 복원하고 주요 위반 점진적 수정
- [ ] **QUAL-02**: 대형 어드민 페이지 리팩토링 (settings 1167줄, edit 934줄 → 커스텀 훅/서브컴포넌트 분리)

### 추가 개선

- [x] **FEAT-01**: auto-press/auto-news 어드민 대시보드에 실행 이력 시각화 (성공/실패 차트, 최근 10회 통계)
- [ ] **FEAT-02**: 기사 검색 성능 개선 — Supabase Full-Text Search(tsvector) 도입으로 DB 레벨 한글 전문검색
- [ ] **FEAT-03**: 어드민 알림 시스템 — 크론 실패/AI 편집 실패/보안 이벤트를 대시보드에서 실시간 확인

## Future Requirements

(v3.0 이후 검토)

- Registry 컴포넌트 14MB 별도 리포지토리 분리
- 어드민 페이지 서버 컴포넌트 전환 (client islands)
- SMTP 자격증명 Vercel 환경변수 이전 (DB settings에서)

## Out of Scope

| Feature | Reason |
|---------|--------|
| Registry 컴포넌트 분리 | 뉴스 포털과 무관, 별도 프로젝트로 검토 |
| 대규모 아키텍처 변경 | v2.0은 점진적 개선, 기존 구조 유지 |
| Vercel Pro 업그레이드 | 비용 대비 효과 검토 필요 |
| 모바일 앱 | 웹 우선, PWA로 충분 |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| PERF-01 | Phase 10 | Pending |
| PERF-02 | Phase 10 | Pending |
| PERF-03 | Phase 12 | Pending |
| SEC-01 | Phase 10 | Pending |
| SEC-02 | Phase 10 | Pending |
| SEC-03 | Phase 14 | Pending |
| CLEAN-01 | Phase 10 | Pending |
| CLEAN-02 | Phase 11 | Pending |
| CLEAN-03 | Phase 11 | Pending |
| CLEAN-04 | Phase 11 | Pending |
| QUAL-01 | Phase 11 | Pending |
| QUAL-02 | Phase 13 | Pending |
| TEST-01 | Phase 13 | Pending |
| TEST-02 | Phase 13 | Pending |
| FEAT-01 | Phase 12 | Complete |
| FEAT-02 | Phase 12 | Pending |
| FEAT-03 | Phase 12 | Pending |

**Coverage:**
- v2.0 requirements: 17 total
- Mapped to phases: 17
- Unmapped: 0

---
*Requirements defined: 2026-03-31*
*Last updated: 2026-03-31 after roadmap creation*
