# Phase 12: 기능 추가 - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-01
**Phase:** 12-feature-additions
**Areas discussed:** 이미지 처리, 자동화 이력 시각화, 전문검색 전환, 알림 시스템

---

## 이미지 처리

| Option | Description | Selected |
|--------|-------------|----------|
| API 라우트 (sharp) | 업로드 API에서 sharp로 리사이즈+WebP 변환 후 Supabase 업로드 | ✓ |
| Supabase Edge Function | Supabase에서 이미지 변환 처리. Deno 환경 | |
| 클라이언트 측 압축 | 브라우저 Canvas API로 리사이즈 후 업로드 | |

**User's choice:** API 라우트 (sharp)
**Notes:** Vercel serverless에서 sharp 사용 가능, 추가 비용 없음

| Option | Description | Selected |
|--------|-------------|----------|
| 1200px / 80% | 장변 최대 1200px, WebP 품질 80% | |
| 1600px / 85% | 더 큰 이미지 유지, 고해상도 사진용 | |
| 사용자 선택 | 어드민 설정에서 최대 크기/품질 조정 가능 | ✓ |

**User's choice:** 사용자 선택
**Notes:** 어드민 설정에서 조정 가능하게

| Option | Description | Selected |
|--------|-------------|----------|
| 새 업로드만 | 이후 업로드부터 적용. 기존 이미지 유지 | ✓ |
| 전체 일괄 변환 | 기존 이미지도 배치 리사이즈 | |
| 점진적 변환 | 새 업로드 + cron으로 기존 이미지 조금씩 변환 | |

**User's choice:** 새 업로드만

---

## 자동화 이력 시각화

| Option | Description | Selected |
|--------|-------------|----------|
| 바 차트 | 일별 성공/실패 건수를 바 차트로 표시 | ✓ |
| 라인 차트 | 시계열 트렌드 표시 | |
| 테이블 + 간단 통계 | 최근 10회 테이블 + 성공률 수치 | |

**User's choice:** 바 차트

| Option | Description | Selected |
|--------|-------------|----------|
| 탭으로 분리 | auto-press / auto-news 탭으로 분리 표시 | ✓ |
| 통합 표시 | 한 차트에 두 유형 모두, 색상 구분 | |
| Claude 판단 | Claude가 적합한 방식 결정 | |

**User's choice:** 탭으로 분리

| Option | Description | Selected |
|--------|-------------|----------|
| Recharts | React 네이티브, shadcn/ui 호환 | ✓ |
| Chart.js | 가볍고 Canvas 기반 | |
| CSS 직접 구현 | 라이브러리 없이 CSS로 구현 | |

**User's choice:** Recharts

---

## 전문검색 전환

| Option | Description | Selected |
|--------|-------------|----------|
| 제목 + 본문 | 제목(A가중치) + 본문(B가중치) tsvector 인덱스 | ✓ |
| 제목만 | 제목만 전문검색, 본문은 ILIKE 유지 | |
| 제목 + 본문 + 태그 | 태그까지 포함한 전체 검색 | |

**User's choice:** 제목 + 본문

| Option | Description | Selected |
|--------|-------------|----------|
| tsvector + pg_trgm 병용 | 정확 매칭 + 부분 매칭 병용 | ✓ |
| tsvector만 | simple 파서로 한글 처리 | |
| Claude 판단 | 기술적 최적 조합 Claude 결정 | |

**User's choice:** tsvector + pg_trgm 병용

| Option | Description | Selected |
|--------|-------------|----------|
| 백엔드만 전환 | 기존 UI 유지, 쿼리만 tsvector로 교체 | ✓ |
| UI도 개선 | 하이라이트, 자동완성 등 UI 개선 포함 | |
| Claude 판단 | 기술적 제약에 따라 결정 | |

**User's choice:** 백엔드만 전환

---

## 알림 시스템

| Option | Description | Selected |
|--------|-------------|----------|
| Supabase 테이블 | notifications 테이블에 저장, 대시보드 조회 | ✓ |
| Redis (Upstash) | 임시 저장, 빠르지만 이력 관리 어려움 | |
| 이메일 발송 | 실패 시 어드민 이메일 알림 | |

**User's choice:** Supabase 테이블

| Option | Description | Selected |
|--------|-------------|----------|
| 대시보드 알림 패널 | 대시보드에 패널 + 헤더 배지 아이콘 (폴링) | ✓ |
| 실시간 푸시 | Supabase Realtime WebSocket 연결 | |
| 페이지 로드 시 확인 | 페이지 진입 시 API 호출로 확인 | |

**User's choice:** 대시보드 알림 패널

| Option | Description | Selected |
|--------|-------------|----------|
| 크론 실패 + AI 실패 | auto-press/auto-news 실패, AI 편집 실패 | ✓ |
| 크론 + AI + 보안 | 위 + 로그인 실패, Rate Limit 초과 등 | |
| 전체 이벤트 | 성공/실패 모두 포함한 전체 운영 로그 | |

**User's choice:** 크론 실패 + AI 실패

---

## Claude's Discretion

- sharp 기본 리사이즈 값, 어드민 설정 UI 설계
- Recharts 바 차트 세부 디자인 (색상, 기간 범위)
- tsvector 인덱스 생성 마이그레이션 전략
- 알림 테이블 스키마, 폴링 주기

## Deferred Ideas

None
