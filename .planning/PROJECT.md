# 컬처피플 뉴스 포털

## What This Is

컬처피플(CulturePeople) 뉴스 포털 — 문화/예술 뉴스 자동 수집·AI 편집·발행 시스템. Next.js 15 기반으로, Supabase/D1 데이터 경로와 R2/Supabase 미디어 경로를 함께 운영하며 RSS/보도자료/메일에서 기사를 자동 수집하고 AI가 편집 기준에 맞게 리라이트하여 발행한다. CockroachDB 뉴스와이어 통합, 역할 기반 CMS, 광고/뉴스레터/댓글 커뮤니티, 텔레그램 운영 알림 기능을 갖춘 운영 중인 라이브 사이트.

## Core Value

**모든 기존 기능이 기획 의도대로 정상 작동해야 한다.** 안정성과 신뢰성이 최우선.

## Current Milestone: v5.0 Registry Payload And API Weight Reduction

**Goal:** 1.3MB generated registry payload를 측정/분리 가능한 artifact 구조로 줄이고, API/list/search/detail 경로가 필요한 데이터만 읽도록 단계적으로 전환한다.

**Target features:**
- Registry payload baseline report and CI regression guard.
- Summary/detail/search-index artifact split contract.
- Component list/search/detail service adoption without breaking existing v1 API contracts.
- Build/runtime verification after generated artifact changes.

## Current State

- **v1.0**: 필수 기능 전수 점검 및 게시 기사 2,981건 검수 완료.
- **v2.0**: 성능, 보안, 코드 정리, 테스트, CSP hardening 완료.
- **v3.0**: 보도자료 자동등록 운영 안정화 shipped. D1 관측성, retry/DLQ, Telegram ops, Worker/Queue rollout, Linux CI, Vercel/Worker deploy 검증 완료.
- **v4.0**: SMTP credential hardening complete. Env-first SMTP resolver, safe admin runtime status, env-managed save protection, and Vercel SMTP runbook completed.
- **v5.0**: Registry payload/API weight reduction started. Current generated component registry baseline is 1,316,916 bytes for 1,014 components, with CI guard work in progress.
- **기술 스택**: Next.js 15.5.18, React 19, TypeScript, pnpm 9.12.2, Supabase/D1, R2/Supabase Storage, Vercel + Cloudflare Worker 보조 경로.
- **리눅스 전환**: `/home/arbada/dev/monet-registry-main` 작업본에서 Node 20.20.2, pnpm 9.12.2, Linux native dependencies, LF 줄바꿈 검증 완료.
- **자동화**: auto-news/auto-press/IMAP 수집, CockroachDB 뉴스와이어, D1 기반 auto-press 관측성/대기열 코드 경로가 존재한다. SMTP 발송 경로는 v4.0에서 env-first secret handling으로 정리됐다.

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

- Registry payload baseline and guard — generated registry 크기, gzip 크기, component count, tag/search payload 크기를 측정하고 CI에서 회귀를 차단 — v5.0
- Registry artifact split — list/detail/search가 필요한 데이터만 읽도록 summary/detail/search-index artifact 계약을 설계하고 적용 — v5.0

### Validated In v4.0

- ✓ SMTP credential hardening — 뉴스레터/시스템 SMTP 발송 자격증명을 Vercel 환경변수 중심으로 전환하고 DB 비밀값 노출/덮어쓰기 리스크 제거 — v4.0
- ✓ SMTP 설정 경로 단일화 — newsletter send, publish notify, auto-news failure alert, SMTP test가 공통 서버 helper를 사용 — v4.0
- ✓ 운영자 UX 보강 — 환경변수 관리 상태, DB fallback 상태, 비밀값 마스킹, 테스트 결과를 안전하게 표시 — v4.0

### Out of Scope

- 대규모 리팩토링 — 작동하는 코드 구조 변경 불가
- Registry 컴포넌트 대규모 외부 저장소 분리 — v5.0은 repo split 이전의 generated artifact/API 감량이 우선
- Cloudflare 단독 호스팅 cutover — v4.0은 SMTP 비밀값 hardening이 우선이며 전체 런타임 전환은 별도 milestone에서 다룸

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
| 리눅스 홈 작업본 표준화 | Windows 파티션 개발 시 CRLF/권한/native dependency 문제가 반복됨 | ✓ Good |
| auto-press v3.0은 관측성과 대기열 우선 | 등록 실패보다 실행 상태를 볼 수 없는 구조가 운영 리스크의 핵심 | Active |
| v4.0은 SMTP credential hardening부터 시작 | registry split이나 runtime cutover보다 작고 보안 가치가 즉시 있음 | Complete |
| v5.0은 registry payload baseline guard부터 시작 | 바로 분리하면 API 회귀를 보기 어렵기 때문에 현재 크기와 한계를 먼저 고정 | Active |

## Constraints

- **호스팅**: Vercel Hobby + Cloudflare Worker 보조 경로 — Vercel Cron 제한과 Worker/Queue 경로를 함께 고려
- **배포**: `vercel deploy --prod` 필수
- **패키지 매니저**: pnpm 9.12.2
- **DB**: Supabase PostgreSQL/D1 provider 경로 + CockroachDB (뉴스와이어)
- **언어**: 설명/안내 모두 한글
- **개발 환경**: 리눅스 홈 작업본, Node 20, LF 줄바꿈, Linux native `node_modules`

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
*Last updated: 2026-05-25 — v5.0 registry payload and API weight reduction started*
