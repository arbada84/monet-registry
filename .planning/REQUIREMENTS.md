# Requirements: 컬처피플 전수 점검 및 수정

**Defined:** 2026-03-26
**Core Value:** 모든 기존 기능이 기획 의도대로 정상 작동해야 한다

## v1 Requirements

### 공개 페이지

- [x] **PUB-01**: 홈페이지가 테마에 맞게 기사 목록을 정상 렌더링한다
- [x] **PUB-02**: 기사 상세 페이지가 본문/이미지/메타데이터를 올바르게 표시한다
- [x] **PUB-03**: 카테고리 페이지가 해당 카테고리 기사만 정확히 필터링한다
- [x] **PUB-04**: 태그 페이지가 해당 태그 기사만 정확히 필터링한다
- [x] **PUB-05**: 검색이 키워드에 맞는 결과를 반환하고 페이지네이션이 작동한다

### 어드민 CMS

- [x] **ADM-01**: 대시보드가 통계 데이터를 정확히 표시한다
- [x] **ADM-02**: 기사 목록/검색/필터가 정상 작동한다
- [x] **ADM-03**: 기사 작성(에디터+이미지+카테고리+상태)이 정상 동작한다
- [x] **ADM-04**: 기사 수정이 모든 필드에서 정상 저장된다
- [x] **ADM-05**: 기사 삭제(소프트 삭제)가 정상 작동한다
- [x] **ADM-06**: 설정 페이지(사이트/SEO/SNS/광고)가 정상 저장/로드된다
- [x] **ADM-07**: AI 설정 페이지가 정상 작동한다
- [x] **ADM-08**: 사용자 관리(역할 변경/추가/삭제)가 정상 작동한다
- [x] **ADM-09**: 카테고리 관리가 정상 작동한다
- [x] **ADM-10**: 상신/승인 워크플로우가 정상 작동한다

### 자동화

- [x] **AUT-01**: auto-news cron이 RSS에서 뉴스를 수집하고 AI 편집 후 등록한다
- [x] **AUT-02**: auto-press cron이 보도자료를 수집하고 AI 편집 후 등록한다
- [x] **AUT-03**: IMAP 메일 동기화가 보도자료를 파싱하여 등록한다
- [x] **AUT-04**: 중복 기사 방지 로직이 정상 작동한다

### 댓글/뉴스레터/광고

- [x] **COM-01**: 댓글 작성/수정/삭제가 정상 작동한다
- [x] **COM-02**: 댓글 답글이 정상 작동한다
- [x] **COM-03**: 뉴스레터 구독/해지가 정상 작동한다
- [x] **COM-04**: 뉴스레터 발송이 정상 작동한다
- [x] **COM-05**: AdSense 자동광고가 정상 표시된다
- [x] **COM-06**: 쿠팡 추천 상품이 정상 표시된다

### 인증/보안

- [x] **SEC-01**: 로그인/로그아웃이 정상 작동한다
- [x] **SEC-02**: 세션 만료 시 자동 리다이렉트가 작동한다
- [x] **SEC-03**: Rate Limiting이 실제로 작동한다 (서버리스 환경 포함)
- [x] **SEC-04**: RBAC가 역할별 접근 제한을 정확히 수행한다
- [x] **SEC-05**: 토큰 블랙리스트가 서버리스에서도 유효하다

### SEO/피드/API

- [ ] **FED-01**: RSS 피드가 올바른 XML을 반환한다
- [ ] **FED-02**: sitemap.xml이 모든 기사를 포함한다
- [ ] **FED-03**: OG 메타태그가 기사별로 정확히 생성된다
- [ ] **FED-04**: API v1 엔드포인트들이 정상 응답한다

### AI/이미지/쿠팡

- [ ] **TOL-01**: AI 기사 편집(리라이트/번역/요약)이 정상 작동한다
- [ ] **TOL-02**: 이미지 업로드가 Supabase Storage에 정상 저장된다
- [ ] **TOL-03**: OG 이미지 자동추출이 정상 작동한다
- [ ] **TOL-04**: 쿠팡 API 상품 검색이 정상 작동한다

## v2 Requirements

### 성능 최적화

- **PERF-01**: serverGetArticles() 풀 테이블 스캔을 목적별 쿼리로 교체
- **PERF-02**: /api/db/articles 클라이언트 사이드 필터링을 DB 레벨로 전환

### 코드 품질

- **QUAL-01**: 인메모리 Rate Limiting을 Upstash Redis로 전면 전환
- **QUAL-02**: 댓글 라우트 중복 Supabase 클라이언트를 통합
- **QUAL-03**: 취약 의존성 업데이트 (axios 등)

## Out of Scope

| Feature | Reason |
|---------|--------|
| 새 기능 추가 | 기존 기능 안정화에 집중 |
| 대규모 리팩토링 | 작동하는 코드 구조 변경 불가, 최소 변경 원칙 |
| 레거시 코드 정리 | 마이그레이션 스크립트/임시 파일 정리는 별도 프로젝트 |
| Registry 컴포넌트 (1014개) | 뉴스 포털과 무관 |
| MySQL/File DB 폴백 | 프로덕션 미사용 |
| 단위 테스트 작성 | 점검/수정이 목표, 테스트 코드 작성은 별도 |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| SEC-01 | Phase 1 | Complete |
| SEC-02 | Phase 1 | Complete |
| SEC-03 | Phase 1 | Complete |
| SEC-04 | Phase 1 | Complete |
| SEC-05 | Phase 1 | Complete |
| PUB-01 | Phase 2 | Complete |
| PUB-02 | Phase 2 | Complete |
| PUB-03 | Phase 2 | Complete |
| PUB-04 | Phase 2 | Complete |
| PUB-05 | Phase 2 | Complete |
| ADM-01 | Phase 3 | Complete |
| ADM-02 | Phase 3 | Complete |
| ADM-03 | Phase 3 | Complete |
| ADM-04 | Phase 3 | Complete |
| ADM-05 | Phase 3 | Complete |
| ADM-06 | Phase 3 | Complete |
| ADM-07 | Phase 3 | Complete |
| ADM-08 | Phase 3 | Complete |
| ADM-09 | Phase 3 | Complete |
| ADM-10 | Phase 3 | Complete |
| AUT-01 | Phase 4 | Complete |
| AUT-02 | Phase 4 | Complete |
| AUT-03 | Phase 4 | Complete |
| AUT-04 | Phase 4 | Complete |
| COM-01 | Phase 5 | Complete |
| COM-02 | Phase 5 | Complete |
| COM-03 | Phase 5 | Complete |
| COM-04 | Phase 5 | Complete |
| COM-05 | Phase 5 | Complete |
| COM-06 | Phase 5 | Complete |
| FED-01 | Phase 6 | Pending |
| FED-02 | Phase 6 | Pending |
| FED-03 | Phase 6 | Pending |
| FED-04 | Phase 6 | Pending |
| TOL-01 | Phase 6 | Pending |
| TOL-02 | Phase 6 | Pending |
| TOL-03 | Phase 6 | Pending |
| TOL-04 | Phase 6 | Pending |

**Coverage:**
- v1 requirements: 35 total
- Mapped to phases: 35
- Unmapped: 0

---
*Requirements defined: 2026-03-26*
*Last updated: 2026-03-26 after roadmap creation*
