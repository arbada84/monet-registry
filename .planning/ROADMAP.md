# Roadmap: 컬처피플 뉴스 포털

## Milestones

- ✅ **v1.0 전수 점검 및 수정** — Phases 1-9 (shipped 2026-03-27) → [archive](milestones/v1.0-ROADMAP.md)
- 🚧 **v2.0 운영 최적화 및 코드 품질 개선** — Phases 10-14 (in progress)

## Phases

<details>
<summary>✅ v1.0 전수 점검 및 수정 (Phases 1-9) — SHIPPED 2026-03-27</summary>

- [x] Phase 1: 인증 및 보안 (2/2 plans) — completed 2026-03-26
- [x] Phase 2: 공개 페이지 (2/2 plans) — completed 2026-03-26
- [x] Phase 3: 어드민 CMS (3/3 plans) — completed 2026-03-26
- [x] Phase 4: 자동화 파이프라인 (2/2 plans) — completed 2026-03-26
- [x] Phase 5: 커뮤니티 및 광고 (2/2 plans) — completed 2026-03-26
- [x] Phase 6: SEO, 피드, AI 도구 (2/2 plans) — completed 2026-03-26
- [x] Phase 7: 기사 전수 검수 (2/2 plans) — completed 2026-03-26
- [x] Phase 8: auto-press RSS 전환 (2/2 plans) — completed 2026-03-27
- [x] Phase 9: CockroachDB 통합 연동 (2/2 plans) — completed 2026-03-27

</details>

### v2.0 운영 최적화 및 코드 품질 개선 (In Progress)

**Milestone Goal:** v1.0 전수 점검 완료 후 축적된 기술 부채 해소 + 운영 안정성/성능 강화

- [ ] **Phase 10: 운영 안정성** - 쿼리 최적화, DB 필터링 전환, 보안 잔여분 처리, temp 파일 정리
- [ ] **Phase 11: 코드 정리 및 품질** - 레거시 폴백 제거, 댓글 통합, 스크립트 정리, ESLint 복원
- [ ] **Phase 12: 기능 추가** - 이미지 자동 리사이즈, 자동화 이력 시각화, 전문검색, 알림 시스템
- [ ] **Phase 13: 테스트 및 리팩토링** - 핵심 로직 단위 테스트, E2E 테스트, 대형 페이지 분리
- [ ] **Phase 14: CSP 보안 강화** - CSP nonce 전환으로 unsafe-inline/unsafe-eval 최소화

## Phase Details

### Phase 10: 운영 안정성
**Goal**: 사이트 응답 속도와 운영 안정성이 체감 가능하게 개선된다
**Depends on**: Phase 9 (v1.0 완료)
**Requirements**: PERF-01, PERF-02, SEC-01, SEC-02, CLEAN-01
**Success Criteria** (what must be TRUE):
  1. 홈/카테고리/어드민 목록 페이지가 목적별 쿼리로 필요한 컬럼만 조회하여 응답한다
  2. 어드민 기사 목록의 필터링(상태/카테고리/검색)이 DB 레벨에서 처리되어 대량 기사에서도 빠르게 동작한다
  3. 인메모리 rate limit 잔여분(commentRateMap, cronRateLimitMap, memAttempts)이 모두 Redis로 전환되어 서버리스 인스턴스 간 일관성이 보장된다
  4. 모든 인증 쿠키가 환경에 관계없이 secure 플래그가 설정된다
  5. 루트 디렉토리에 temp/tmp 파일이 없고 .gitignore에 패턴이 추가되어 재발이 방지된다
**Plans**: 3 plans
Plans:
- [ ] 10-01-PLAN.md — 목적별 쿼리 함수 추출 및 호출처 전환 (PERF-01)
- [ ] 10-02-PLAN.md — 인메모리 rate limit Redis 전환 + cookie secure + temp 정리 (SEC-01, SEC-02, CLEAN-01)
- [ ] 10-03-PLAN.md — 어드민 기사 목록 DB 레벨 필터링 전환 (PERF-02)

### Phase 11: 코드 정리 및 품질
**Goal**: 프로덕션에서 사용하지 않는 레거시 코드가 제거되고 코드 일관성이 향상된다
**Depends on**: Phase 10
**Requirements**: CLEAN-02, CLEAN-03, CLEAN-04, QUAL-01
**Success Criteria** (what must be TRUE):
  1. MySQL/File DB 관련 폴백 코드(db-server.ts, mysql-db.ts, file-db.ts)가 제거되고 Supabase 단일 경로만 존재한다
  2. 댓글 API가 supabase-server-db.ts의 공통 함수를 사용하여 중복 구현이 없다
  3. 일회성 마이그레이션/테스트/수정 스크립트가 scripts/_archive/로 이동되고 레거시 SQL/Python 파일이 정리된다
  4. ESLint no-explicit-any 규칙이 warn 레벨로 활성화되고 주요 위반이 수정된다
**Plans**: TBD

### Phase 12: 기능 추가
**Goal**: 운영 효율을 높이는 새 기능이 추가되어 어드민과 사용자 경험이 향상된다
**Depends on**: Phase 11
**Requirements**: PERF-03, FEAT-01, FEAT-02, FEAT-03
**Success Criteria** (what must be TRUE):
  1. 이미지 업로드 시 자동으로 리사이즈 및 WebP 변환이 적용되어 페이지 로드 속도가 개선된다
  2. 어드민 대시보드에서 auto-press/auto-news 실행 이력(성공/실패 차트, 최근 10회 통계)을 확인할 수 있다
  3. 기사 검색이 tsvector 기반 전문검색으로 한글 검색 정확도와 속도가 향상된다
  4. 크론 실패, AI 편집 실패, 보안 이벤트가 어드민 대시보드에서 실시간으로 확인된다
**Plans**: TBD
**UI hint**: yes

### Phase 13: 테스트 및 리팩토링
**Goal**: 핵심 로직의 자동 테스트가 구축되고 대형 파일이 유지보수 가능한 크기로 분리된다
**Depends on**: Phase 12
**Requirements**: TEST-01, TEST-02, QUAL-02
**Success Criteria** (what must be TRUE):
  1. cookie-auth 토큰 생성/검증, db-server 기사 CRUD, cron 핵심 함수에 대한 단위 테스트가 통과한다
  2. 어드민 기사 작성/편집/삭제, 설정 저장 플로우에 대한 E2E 테스트가 통과한다
  3. settings 페이지와 edit 페이지가 커스텀 훅/서브컴포넌트로 분리되어 각 파일이 300줄 이하이다
**Plans**: TBD
**UI hint**: yes

### Phase 14: CSP 보안 강화
**Goal**: Content Security Policy가 nonce 기반으로 전환되어 XSS 방어가 강화된다
**Depends on**: Phase 13
**Requirements**: SEC-03
**Success Criteria** (what must be TRUE):
  1. CSP 헤더에서 unsafe-inline이 nonce 기반으로 대체되고 모든 인라인 스크립트가 nonce를 포함한다
  2. 광고(AdSense), 분석(GA), 외부 스크립트가 CSP nonce 환경에서 정상 동작한다
**Plans**: TBD

## Progress

**Execution Order:**
Phases execute in numeric order: 10 → 11 → 12 → 13 → 14

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 1. 인증 및 보안 | v1.0 | 2/2 | Complete | 2026-03-26 |
| 2. 공개 페이지 | v1.0 | 2/2 | Complete | 2026-03-26 |
| 3. 어드민 CMS | v1.0 | 3/3 | Complete | 2026-03-26 |
| 4. 자동화 파이프라인 | v1.0 | 2/2 | Complete | 2026-03-26 |
| 5. 커뮤니티 및 광고 | v1.0 | 2/2 | Complete | 2026-03-26 |
| 6. SEO, 피드, AI 도구 | v1.0 | 2/2 | Complete | 2026-03-26 |
| 7. 기사 전수 검수 | v1.0 | 2/2 | Complete | 2026-03-26 |
| 8. auto-press RSS 전환 | v1.0 | 2/2 | Complete | 2026-03-27 |
| 9. CockroachDB 통합 연동 | v1.0 | 2/2 | Complete | 2026-03-27 |
| 10. 운영 안정성 | v2.0 | 0/3 | Planning | - |
| 11. 코드 정리 및 품질 | v2.0 | 0/? | Not started | - |
| 12. 기능 추가 | v2.0 | 0/? | Not started | - |
| 13. 테스트 및 리팩토링 | v2.0 | 0/? | Not started | - |
| 14. CSP 보안 강화 | v2.0 | 0/? | Not started | - |
