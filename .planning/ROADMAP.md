# Roadmap: 컬처피플 전수 점검 및 수정

## Overview

운영 중인 컬처피플 뉴스 포털의 모든 기능을 6단계에 걸쳐 전수 점검한다. 인증/보안을 먼저 검증하여 테스트 기반을 확보하고, 공개 페이지 -> 어드민 CMS -> 자동화 -> 커뮤니티/광고 -> SEO/AI 도구 순으로 진행한다. 각 단계에서 발견된 버그는 즉시 수정하고 배포한다.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [ ] **Phase 1: 인증 및 보안** - 로그인/세션/RBAC/Rate Limiting 등 보안 기반 점검
- [x] **Phase 2: 공개 페이지** - 홈/기사상세/카테고리/태그/검색 페이지 정상 렌더링 점검 (completed 2026-03-26)
- [ ] **Phase 3: 어드민 CMS** - 대시보드/기사 CRUD/설정/사용자관리 등 32개 관리 페이지 점검
- [ ] **Phase 4: 자동화 파이프라인** - auto-news/auto-press/IMAP 수집 및 중복 방지 점검
- [x] **Phase 5: 커뮤니티 및 광고** - 댓글/뉴스레터/AdSense/쿠팡 추천 점검 (completed 2026-03-26)
- [ ] **Phase 6: SEO, 피드, AI 도구** - RSS/sitemap/OG태그/API v1/AI 편집/이미지/쿠팡 API 점검

## Phase Details

### Phase 1: 인증 및 보안
**Goal**: 인증과 보안 메커니즘이 서버리스 환경에서 정상 작동하여, 이후 단계의 점검이 안전하게 진행될 수 있다
**Depends on**: Nothing (first phase)
**Requirements**: SEC-01, SEC-02, SEC-03, SEC-04, SEC-05
**Success Criteria** (what must be TRUE):
  1. 사용자가 이메일/비밀번호로 로그인하면 세션이 유지되고, 로그아웃하면 즉시 만료된다
  2. 세션 만료 시 어드민 페이지 접근이 자동으로 로그인 페이지로 리다이렉트된다
  3. reporter 역할 사용자가 superadmin 전용 페이지에 접근하면 차단된다
  4. 동일 IP에서 단시간 대량 요청 시 Rate Limiting이 작동하여 429 응답을 반환한다
  5. 로그아웃된 토큰으로 API 호출 시 인증이 거부된다
**Plans**: 2 plans

Plans:
- [x] 01-01-PLAN.md — Redis 공통 유틸 + 토큰 블랙리스트 Redis/async 전환 + middleware 블랙리스트 검사 (SEC-01, SEC-02, SEC-05)
- [x] 01-02-PLAN.md — 5개 Rate Limiting Redis 전환 (cron/댓글/뉴스레터/AI/해시) + RBAC 검증 (SEC-03, SEC-04)

### Phase 2: 공개 페이지
**Goal**: 방문자가 사이트의 모든 공개 페이지에서 기사를 정상적으로 탐색하고 검색할 수 있다
**Depends on**: Phase 1
**Requirements**: PUB-01, PUB-02, PUB-03, PUB-04, PUB-05
**Success Criteria** (what must be TRUE):
  1. 홈페이지가 컬처피플 테마로 최신 기사 목록을 정상 렌더링한다
  2. 기사 상세 페이지에서 본문, 대표이미지, 기자명, 날짜 등 메타데이터가 모두 표시된다
  3. 카테고리 페이지에서 해당 카테고리 기사만 필터링되어 표시된다
  4. 태그 페이지에서 해당 태그 기사만 필터링되어 표시된다
  5. 검색어 입력 시 관련 기사가 반환되고, 결과가 많을 경우 페이지네이션이 작동한다
**Plans**: 2 plans
**UI hint**: yes

Plans:
- [x] 02-01-PLAN.md — 검색 sort 파라미터 수정 + 태그 페이지 accent/페이지네이션 (PUB-04, PUB-05)
- [x] 02-02-PLAN.md — 카테고리 allArticles 최적화 + 기사 상세 breadcrumb 인코딩 + 빌드 검증 (PUB-01, PUB-02, PUB-03)

### Phase 3: 어드민 CMS
**Goal**: 관리자가 어드민 페이지에서 기사의 전체 라이프사이클(작성~삭제)과 사이트 설정을 관리할 수 있다
**Depends on**: Phase 1
**Requirements**: ADM-01, ADM-02, ADM-03, ADM-04, ADM-05, ADM-06, ADM-07, ADM-08, ADM-09, ADM-10
**Success Criteria** (what must be TRUE):
  1. 대시보드에서 기사 수, 조회수 등 통계가 실제 DB 데이터와 일치하게 표시된다
  2. 기사 목록에서 제목 검색, 카테고리 필터, 상태 필터가 정상 작동한다
  3. 기사 작성 시 에디터에서 본문 입력, 이미지 삽입, 카테고리 선택, 상태 변경 후 저장이 성공한다
  4. 기사 수정 시 모든 필드(제목/본문/이미지/카테고리/태그)가 정상 로드되고 저장된다
  5. 설정(사이트/SEO/광고), AI 설정, 사용자 관리, 카테고리 관리, 상신/승인이 모두 정상 작동한다
**Plans**: 3 plans
**UI hint**: yes

Plans:
- [x] 03-01-PLAN.md — SMTP 비밀번호 마스킹 안전화 + 편집 페이지 로딩/isDirty 수정 (ADM-04, ADM-06)
- [x] 03-02-PLAN.md — 휴지통 카운트 + 복제 createdAt + 대시보드 body 제외 + 유지보수 버튼 접기 (ADM-01, ADM-02, ADM-05)
- [x] 03-03-PLAN.md — 작성자 select 동기화 + 카테고리 삭제 경고 + 빌드/배포 (ADM-03, ADM-07, ADM-08, ADM-09, ADM-10)

### Phase 4: 자동화 파이프라인
**Goal**: 뉴스 자동 수집 시스템(RSS, 보도자료, 메일)이 기사를 중복 없이 자동으로 등록한다
**Depends on**: Phase 3
**Requirements**: AUT-01, AUT-02, AUT-03, AUT-04
**Success Criteria** (what must be TRUE):
  1. auto-news cron 실행 시 RSS 소스에서 새 기사를 수집하고 AI 편집 후 DB에 등록한다
  2. auto-press cron 실행 시 보도자료를 수집하고 AI 편집 후 DB에 등록한다
  3. IMAP 동기화 실행 시 새 메일을 파싱하여 보도자료 기사로 등록한다
  4. 이미 등록된 기사와 동일한 소스의 기사는 중복 등록되지 않는다
**Plans**: 2 plans

Plans:
- [x] 04-01-PLAN.md — AI 5분 대기 제거 + timing-safe GET 교체 + 캐시 TTL + fail 재시도 + normalizeTitle (AUT-01, AUT-04)
- [x] 04-02-PLAN.md — mail/sync 함수 추출 + auto-press 직접 호출 + decrypt 에러 격리 + OG 방어 + 배포 (AUT-02, AUT-03)

### Phase 5: 커뮤니티 및 광고
**Goal**: 댓글, 뉴스레터, 광고 시스템이 방문자와의 상호작용과 수익화를 정상 지원한다
**Depends on**: Phase 2
**Requirements**: COM-01, COM-02, COM-03, COM-04, COM-05, COM-06
**Success Criteria** (what must be TRUE):
  1. 기사 상세 페이지에서 댓글 작성, 수정, 삭제가 정상 작동한다
  2. 댓글에 대한 답글이 정상적으로 달리고 트리 구조로 표시된다
  3. 뉴스레터 구독 신청 후 이메일이 발송되고, 해지 링크가 정상 작동한다
  4. AdSense 자동광고와 쿠팡 추천 상품이 페이지에 정상 표시된다
**Plans**: 2 plans
**UI hint**: yes

Plans:
- [x] 05-01-PLAN.md — 뉴스레터 HTML 인젝션 수정 + 재구독 토큰 갱신 + Redis rate limit + 라우트 인증 (COM-03, COM-04)
- [x] 05-02-PLAN.md — 댓글 부모 삭제 시 자식 연쇄 삭제 + articleId 검증 + 스키마 동기화 + 광고 확인 (COM-01, COM-02, COM-05, COM-06)

### Phase 6: SEO, 피드, AI 도구
**Goal**: 검색엔진 최적화 요소와 AI 기반 편집 도구, 외부 API가 모두 정상 작동한다
**Depends on**: Phase 2
**Requirements**: FED-01, FED-02, FED-03, FED-04, TOL-01, TOL-02, TOL-03, TOL-04
**Success Criteria** (what must be TRUE):
  1. /rss, /atom, /feed.json 이 유효한 피드 XML/JSON을 반환한다
  2. sitemap.xml이 전체 기사 URL을 포함하고, OG 메타태그가 기사별로 정확히 생성된다
  3. API v1 엔드포인트(/api/v1/articles, /api/v1/categories 등)가 인증 포함 정상 응답한다
  4. AI 기사 편집(리라이트/번역/요약)이 정상 결과를 반환한다
  5. 이미지 업로드가 Supabase Storage에 저장되고, OG 이미지 자동추출과 쿠팡 API 검색이 작동한다
**Plans**: 2 plans

Plans:
- [ ] 06-01-PLAN.md — RSS XML 스펙 준수 + sitemap 정적 페이지 추가 (FED-01, FED-02, FED-03)
- [ ] 06-02-PLAN.md — 이미지/ZIP/쿠팡 인증 추가 + AI 길이 제한 + API v1 PUT 상신 (FED-04, TOL-01, TOL-02, TOL-03, TOL-04)

## Progress

**Execution Order:**
Phases execute in numeric order: 1 -> 2 -> 3 -> 4 -> 5 -> 6

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. 인증 및 보안 | 0/2 | Planning complete | - |
| 2. 공개 페이지 | 2/2 | Complete   | 2026-03-26 |
| 3. 어드민 CMS | 0/3 | Planning complete | - |
| 4. 자동화 파이프라인 | 0/2 | Planning complete | - |
| 5. 커뮤니티 및 광고 | 2/2 | Complete   | 2026-03-26 |
| 6. SEO, 피드, AI 도구 | 0/2 | Planning complete | - |
