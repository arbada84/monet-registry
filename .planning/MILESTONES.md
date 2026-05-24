# Milestones

## v1.0 컬처피플 전수 점검 및 수정 (Shipped: 2026-03-27)

**Phases completed:** 9 phases, 19 plans, 36 tasks

**Key accomplishments:**

- Redis 기반 토큰 블랙리스트로 서버리스 인스턴스 간 로그아웃 토큰 무효화 + middleware 블랙리스트 검사 추가
- 검색 sort 파라미터 유지 버그 수정 + 태그 페이지 테마별 accent 색상 CSS 변수 적용 + 20건 더보기 페이지네이션 추가
- 카테고리 페이지 전체 기사 로드(3000건)를 인기 기사 10건 조회로 교체하고, 기사 상세 breadcrumb 카테고리 URL을 encodeURIComponent로 안전 처리
- 작성자 select __unlisted__ 폴백 통일 + 카테고리 삭제 경고 + Phase 03 전체 Vercel 프로덕션 배포
- Commit:
- auto-press self-fetch 제거 + IMAP decrypt 에러 격리 + OG 재귀 방어 + keywords 제한 -- 총 4건 버그 수정 + Vercel 배포
- Commit:
- RSS author 이메일 형식 수정 + 비활성화 피드 필수 요소 추가 + sitemap 정적 페이지(/about, /terms, /privacy) 포함
- 이미지/ZIP/쿠팡 업로드 API에 쿠키 인증 추가, AI content 50,000자 길이 제한, API v1 PUT 상신 상태 허용
- 27건 문제 기사 자동 수정/삭제 (삭제 4건 + 수정 23건) 후 연속 2회 감사 0건 달성, 최종 게시 기사 2,981건
- 뉴스와이어 section.article_column 기반 전용 파서로 본문/이미지/메타 정밀 추출, fetchOriginContent 자동 분기, 넷프로 경유 소스 5개 제거 및 DB 런타임 마이그레이션
- fetchNetproList/fetchNetproDetail 함수 및 netpro API 3개 삭제, 모든 소스 RSS 직접 수집 통합, 어드민 UI 레거시 정리 후 프로덕션 배포
- auto-press 뉴스와이어 소스를 CockroachDB getUnregisteredFeeds() 기반으로 전환하고, 기사 등록 후 markAsRegistered로 중복 등록 원천 차단 + Vercel 환경변수 등록 및 프로덕션 배포 완료

---

## v2.0 운영 최적화 및 코드 품질 개선 (Completed: 2026-05-21)

**Phases completed:** 5 phases, 15 plans

**Key accomplishments:**

- 목적별 article query와 DB 레벨 필터링으로 공개/관리자 목록 조회 부담 완화
- Redis 기반 rate limit, secure cookie 강제, nonce 기반 CSP로 보안 기준 강화
- legacy DB fallback, 중복 comment route, one-off scripts 정리
- 이미지 resize/WebP, auto-press/auto-news 이력, full-text search, dashboard alert 추가
- 핵심 단위 테스트와 admin flow E2E 기반 추가
- dependency audit remediation, maintenance admin API guard, planning consistency guard 추가

---

## v3.0 보도자료 자동등록 운영 안정화 (Completed: 2026-05-25)

**Phases completed:** 5 phases, 10 plans

**Target outcomes:**

- AI 설정/키 오류가 500으로 죽지 않고 `NO_AI_SETTINGS`/`NO_AI_KEY`로 표시
- D1 기반 run/item/event/retry queue/DLQ/source quality 상태를 운영 화면과 텔레그램에서 확인
- 수동 실행이 run ID, continuation, heartbeat, cancel, item retry 흐름으로 추적 가능
- Cloudflare Worker/Queue 경로가 duplicate guard, source scope, DLQ, worker notify, cache revalidation을 보존
- 리눅스 홈 작업본, Node 20, pnpm 9.12.2, LF 줄바꿈, Linux native dependencies를 표준 개발 기준으로 유지

**Key accomplishments:**

- Linux-native Node/pnpm baseline and full CI closure established
- D1 run/item/event/retry/DLQ/source quality observability verified
- Manual run dashboard, health checks, continuation, cancel, and item retry verified
- Telegram commands and daily report now expose actionable Korean operator status
- Worker/Queue dispatch, source scope, notify auth, cache revalidation, and DLQ actions guarded

---
