# 컬처피플 뉴스 포털

## What This Is

컬처피플(CulturePeople) 뉴스 포털 — 문화/예술 뉴스 자동 수집·AI 편집·발행 시스템. Next.js 15 + Supabase 기반으로, RSS/보도자료/메일에서 기사를 자동 수집하고, AI가 편집 기준에 맞게 리라이트하여 발행한다. CockroachDB 뉴스와이어 통합, 역할 기반 CMS, 광고/뉴스레터/댓글 커뮤니티 기능을 갖춘 운영 중인 라이브 사이트.

## Core Value

**모든 기존 기능이 기획 의도대로 정상 작동해야 한다.** 안정성과 신뢰성이 최우선.

## Current Milestone: v2.0 운영 최적화 및 코드 품질 개선

**Goal:** v1.0 전수 점검 완료 후 축적된 기술 부채 해소 + 운영 안정성/성능 강화

**Target features:**
- 성능 최적화: serverGetArticles() 목적별 쿼리 전환, DB 레벨 필터링, 이미지 자동 리사이즈
- 보안 강화: 인메모리 rate limit Redis 전환, Cookie secure 강제, CSP nonce 검토
- 코드 정리: 루트 temp 파일 정리, MySQL/File DB 폴백 제거, 댓글 클라이언트 통합, 스크립트 archive
- 테스트: 핵심 로직 단위 테스트, 어드민 UI E2E 테스트
- 코드 품질: ESLint 규칙 복원, 대형 페이지 리팩토링
- 추가 개선: auto-press 이력 시각화, Full-Text Search, 어드민 알림 시스템

## Current State (v1.0 shipped)

- **게시 기사**: 2,981건 (전수 검수 완료)
- **기술 스택**: Next.js 15.5.14, TypeScript, pnpm 9.12.2, Supabase, Vercel Hobby
- **보안**: Redis 기반 토큰 블랙리스트 + Rate Limiting 6곳 전환 완료
- **자동화**: RSS 직접 수집 + CockroachDB 뉴스와이어 통합 완료
- **코드**: 125개 파일, +15,679줄 변경 (v1.0 마일스톤)

## Requirements

### Validated

- ✓ 인증/보안 — Redis 토큰 블랙리스트, Rate Limiting 6곳, RBAC — v1.0
- ✓ 공개 페이지 — 홈/기사상세/카테고리/태그/검색 정상 렌더링 — v1.0
- ✓ 어드민 CMS — 기사 CRUD, 설정, 사용자관리, 상신/승인 — v1.0
- ✓ 자동화 — auto-news/auto-press/IMAP 수집, 중복 방지 — v1.0
- ✓ 커뮤니티 — 댓글(답글/연쇄삭제), 뉴스레터(구독/발송/해지) — v1.0
- ✓ 광고 — AdSense 자동광고, 쿠팡 추천 — v1.0
- ✓ SEO/피드 — RSS/sitemap/OG메타태그, API v1 — v1.0
- ✓ AI 도구 — 리라이트/번역/요약, 이미지 업로드, 쿠팡 API — v1.0
- ✓ 기사 전수 검수 — 저작권 이미지 정리, 중복 삭제, 편집 규칙 수정 — v1.0
- ✓ RSS 직접 수집 — 뉴스와이어 전용 파서, 넷프로 경유 제거 — v1.0
- ✓ CockroachDB 통합 — press-import/auto-press 연동 — v1.0

### Active

- 성능 최적화 — serverGetArticles() 목적별 쿼리, DB 레벨 필터링, 이미지 리사이즈 — v2.0
- 보안 강화 — 인메모리 rate limit Redis 전환, Cookie secure, CSP nonce — v2.0
- 코드 정리 — temp 파일, MySQL/File DB 폴백 제거, 댓글 통합, 스크립트 archive — v2.0
- 테스트 — 핵심 로직 단위 테스트, 어드민 E2E — v2.0
- 코드 품질 — ESLint 규칙 복원, 대형 페이지 리팩토링 — v2.0
- 추가 개선 — auto-press 이력 시각화, Full-Text Search, 어드민 알림 — v2.0

### Out of Scope

- 대규모 리팩토링 — 작동하는 코드 구조 변경 불가
- Registry 컴포넌트 (1014개) — 뉴스 포털과 무관 (분리는 별도 검토)

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Redis 공통 유틸(redis.ts) 추출 | 서버리스 인메모리 상태 문제 해결 | ✓ Good |
| 코드 리뷰 + 브라우저 테스트 병행 | 코드만으로는 실제 동작 확인 불가 | ✓ Good |
| 버그 발견 즉시 수정 | 목록 정리 후 수정보다 효율적 | ✓ Good |
| 최소 변경 원칙 | 작동하는 코드 건드리지 않음 | ✓ Good |
| AI 편집 3회 재시도 (5분 대기 제거) | Vercel 60초 타임아웃 대응 | ✓ Good |
| CockroachDB 싱글톤 Pool | 서버리스 커넥션 폭발 방지 | ✓ Good |
| 뉴스와이어만 CockroachDB (정부 보도자료 RSS 유지) | 점진적 전환, 안정성 우선 | ✓ Good |

## Constraints

- **호스팅**: Vercel Hobby — cron 1일1회, 이미지 최적화 제한
- **배포**: `vercel deploy --prod` 필수
- **패키지 매니저**: pnpm 9.12.2
- **DB**: Supabase PostgreSQL (RLS 적용) + CockroachDB (뉴스와이어)
- **언어**: 설명/안내 모두 한글

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
*Last updated: 2026-03-31 — v2.0 milestone started*
