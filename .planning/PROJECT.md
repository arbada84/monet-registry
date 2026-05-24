# 컬처피플 뉴스 포털

## What This Is

컬처피플(CulturePeople) 뉴스 포털 — 문화/예술 뉴스 자동 수집·AI 편집·발행 시스템. Next.js 15 기반으로, Supabase/D1 데이터 경로와 R2/Supabase 미디어 경로를 함께 운영하며 RSS/보도자료/메일에서 기사를 자동 수집하고 AI가 편집 기준에 맞게 리라이트하여 발행한다. CockroachDB 뉴스와이어 통합, 역할 기반 CMS, 광고/뉴스레터/댓글 커뮤니티, 텔레그램 운영 알림 기능을 갖춘 운영 중인 라이브 사이트.

## Core Value

**모든 기존 기능이 기획 의도대로 정상 작동해야 한다.** 안정성과 신뢰성이 최우선.

## Current Milestone: v3.0 보도자료 자동등록 운영 안정화

**Goal:** 보도자료 자동등록을 실행 상태가 보이고, 실패 사유가 남고, 안전하게 재시도 가능한 운영 흐름으로 정리한다.

**Target features:**
- AI 설정 없음/키 없음 같은 운영 오류가 500으로 죽지 않고 구조화된 실패 항목으로 남는다.
- `auto_press_runs`, `auto_press_items`, `auto_press_events`, `auto_press_retry_queue` 기반으로 실행/기사별 상태를 조회한다.
- 수동 실행은 작업 생성, 짧은 배치 처리, heartbeat, cancel, continuation 흐름으로 운영자가 추적할 수 있다.
- AI 재시도 대기열, Dead Letter Queue, 텔레그램 운영 리포트가 같은 실패 사유 코드 체계를 사용한다.
- Cloudflare Worker/Queue 경로는 대량 처리와 재시도를 위한 장기 백그라운드 처리 경로로 검증한다.
- 리눅스 개발 환경을 기준으로 Node 20, pnpm 9.12.2, LF 줄바꿈, Linux native dependencies를 유지한다.

## Current State

- **v1.0**: 필수 기능 전수 점검 및 게시 기사 2,981건 검수 완료.
- **v2.0**: 성능, 보안, 코드 정리, 테스트, CSP hardening 완료.
- **기술 스택**: Next.js 15.5.18, React 19, TypeScript, pnpm 9.12.2, Supabase/D1, R2/Supabase Storage, Vercel + Cloudflare Worker 보조 경로.
- **리눅스 전환**: `/home/arbada/dev/monet-registry-main` 작업본에서 Node 20.20.2, pnpm 9.12.2, Linux native dependencies, LF 줄바꿈 검증 완료.
- **자동화**: auto-news/auto-press/IMAP 수집, CockroachDB 뉴스와이어, D1 기반 auto-press 관측성/대기열 코드 경로가 존재한다. v3.0은 이를 운영 기준으로 검증하고 닫는다.

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

- 보도자료 자동등록 운영 안정화 — 구조화된 실패 사유, D1 실행 이력, 기사별 상태, AI 대기열, DLQ, 텔레그램 리포트 — v3.0
- Cloudflare Worker/Queue 경로 검증 — 대량 처리, retry, duplicate guard, worker notify, revalidation — v3.0
- 관리자 검수 강화 — `/cam/auto-press`, `/cam/accounts`, `/cam/mail-press`, `/cam/telegram`, `/cam/articles` 핵심 운영 흐름 smoke 기준 정리 — v3.0

### Out of Scope

- 대규모 리팩토링 — 작동하는 코드 구조 변경 불가
- Registry 컴포넌트 (1014개) — 뉴스 포털과 무관 (분리는 별도 검토)
- Cloudflare 단독 호스팅 cutover — v3.0은 auto-press 운영 안정화가 우선이며 전체 런타임 전환은 별도 milestone에서 다룸

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
*Last updated: 2026-05-24 — v3.0 milestone started*
