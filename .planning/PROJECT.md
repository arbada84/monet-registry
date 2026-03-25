# 컬처피플 뉴스 포털 — 전체 기능 전수 점검 및 수정

## What This Is

컬처피플(CulturePeople) 뉴스 포털의 모든 기존 기능을 전수 점검하고, 기획 의도와 다르게 개발되었거나 작동하지 않는 기능을 발견하여 모두 수정하는 프로젝트. 코드 리뷰와 실제 브라우저 테스트를 병행하여 철저하게 검증한다.

## Core Value

**모든 기존 기능이 기획 의도대로 정상 작동해야 한다.** 새 기능 추가가 아닌, 현재 있는 것이 제대로 동작하는 것이 최우선.

## Requirements

### Validated

- ✓ Next.js 15 App Router 기반 뉴스 포털 — existing
- ✓ Supabase DB + Storage 인프라 — existing
- ✓ 쿠키 기반 인증 (로그인/로그아웃/세션) — existing
- ✓ 역할 기반 접근 제어 (superadmin/admin/reporter) — existing
- ✓ 기사 CRUD (작성/수정/삭제/조회) — existing
- ✓ 기사 번호 시스템 (no) — existing
- ✓ 멀티 테마 시스템 (culturepeople/insightkorea/netpro) — existing
- ✓ ISR 캐시 (1시간 revalidate) — existing
- ✓ 보안 헤더 (CSP/HSTS/X-Frame-Options) — existing
- ✓ 봇 차단 미들웨어 — existing

### Active

- [ ] 공개 페이지 전수 점검 — 홈, 기사 상세, 카테고리, 태그, 검색 페이지가 정상 렌더링되고 데이터를 올바르게 표시하는지 확인 및 수정
- [ ] 어드민(CMS) 전수 점검 — 대시보드, 기사 관리, 설정, AI 설정, 자동수집 등 32개 admin 페이지의 모든 기능이 정상 작동하는지 확인 및 수정
- [ ] 자동 뉴스 수집(auto-news) 점검 — Vercel cron → RSS 수집 → AI 편집 → 기사 등록 파이프라인 전체 정상 동작 확인
- [ ] 자동 보도자료(auto-press) 점검 — cron → 보도자료 수집 → AI 편집 → 등록 파이프라인 정상 동작 확인
- [ ] 메일 보도자료(IMAP) 점검 — 메일 동기화 → 파싱 → AI 편집 → 등록 파이프라인 정상 동작 확인
- [ ] 댓글 시스템 점검 — 작성/수정/삭제/답글/신고 기능이 실제로 작동하는지 확인
- [ ] 뉴스레터 시스템 점검 — 구독/발송/해지가 정상 작동하는지 확인
- [ ] 광고 시스템 점검 — AdSense 자동광고, 쿠팡 추천, 배너 광고가 정상 표시되는지 확인
- [ ] 검색 기능 점검 — 기사 검색, 검색 결과 페이지네이션, 최근 검색어가 정상인지 확인
- [ ] 인증/보안 점검 — 로그인, 로그아웃, 세션 만료, Rate Limiting, 토큰 블랙리스트가 실제로 작동하는지 확인
- [ ] SEO/피드 점검 — RSS, Atom, JSON Feed, sitemap.xml, robots.txt, OG 메타태그 정상 확인
- [ ] 이미지 업로드/관리 점검 — 이미지 업로드, OG 이미지 자동추출, 워터마크 기능 확인
- [ ] AI 기능 점검 — AI 기사 편집, 번역, 요약, 이미지 검색 등 AI API 정상 동작 확인
- [ ] 쿠팡 API 점검 — 상품 검색 및 자동 추천 기능 정상 작동 확인
- [ ] API v1 점검 — 외부 API (articles, badge, categories, stats 등) 정상 응답 확인
- [ ] 크리티컬 버그 수정 — 서버리스 환경 인메모리 상태 문제, 취약 의존성 등 CONCERNS.md에서 식별된 Critical 이슈 수정

### Out of Scope

- 새 기능 추가 — 이번 프로젝트는 기존 기능 안정화에 집중
- 대규모 리팩토링 — 작동하는 코드의 구조 변경은 하지 않음 (버그 수정에 필요한 최소 변경만)
- 레거시 코드 정리 — 마이그레이션 스크립트, 루트 임시 파일 등의 정리는 별도 프로젝트
- Registry 컴포넌트(1014개) — 뉴스 포털과 무관한 컴포넌트 레지스트리는 점검 대상 아님
- MySQL/File DB 폴백 — 프로덕션 미사용 백엔드는 점검 대상 아님

## Context

- **운영 중인 사이트**: 약 4,000건의 기사가 등록된 라이브 뉴스 포털
- **8차에 걸친 품질 점검** 완료 (2026-03-25까지) — 보안, 접근성, 성능, CSP 등 67건 수정 이력
- **코드베이스 매핑 완료**: `.planning/codebase/` 7개 문서 (STACK, ARCHITECTURE, STRUCTURE, INTEGRATIONS, CONVENTIONS, TESTING, CONCERNS)
- **CONCERNS.md에서 식별된 Critical 이슈**: 서버리스 인메모리 상태, 의존성 취약점 19건
- **검증 방법**: 코드 리뷰 + Playwright 브라우저 테스트 병행
- **어드민 32개 페이지**, **API 라우트 30+개**, **공개 페이지 5+개** 대상

## Constraints

- **호스팅**: Vercel Hobby — cron 1일1회, 이미지 최적화 제한
- **배포**: `vercel deploy --prod` 필수 (코드 변경 시 자동 배포)
- **패키지 매니저**: pnpm 9.12.2
- **DB**: Supabase PostgreSQL (RLS 적용)
- **언어**: 설명/안내 모두 한글

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| 코드 리뷰 + 브라우저 테스트 병행 | 코드만으로는 실제 동작 확인 불가, 실제 사이트 테스트 필수 | — Pending |
| 버그 발견 즉시 수정 | 목록 정리 후 수정이 아닌, 발견-수정-검증 반복 | — Pending |
| 최소 변경 원칙 | 작동하는 코드는 건드리지 않고, 안 되는 것만 고침 | — Pending |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd:transition`):
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `/gsd:complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-03-26 after initialization*
