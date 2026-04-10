# Phase 13 Research: 테스트 및 리팩토링

## 개요
Phase 13의 목표는 핵심 비즈니스 로직의 안정성을 확보하기 위한 자동화 테스트를 구축하고, 유지보수가 어려운 대형 어드민 페이지를 구조적으로 개선하는 것입니다.

## 1. 단위 테스트 대상 분석 (TEST-01)

### 1.1 `src/lib/cookie-auth.ts`
인증 및 보안의 핵심 로직으로, 독립적인 테스트가 용이함.
- **테스트 대상 함수:**
    - `generateAuthToken` / `verifyAuthToken`: 토큰 생성 및 검증의 정확성, 만료 처리.
    - `toBase64Url` / `fromBase64Url`: 인코딩/디코딩 정합성.
    - `timingSafeEqual`: 상수 시간 비교 작동 여부.
    - `isTokenBlacklisted`: Redis 연동(모킹 필요) 및 인메모리 폴백 검증.

### 1.2 `src/lib/db-server.ts`
기사 생성 및 수정 시의 데이터 정제(Sanitization) 로직 검증.
- **테스트 대상 함수:**
    - `serverCreateArticle`: 제목/태그 길이 제한, 본문 세정(이미지 출처 제거, base64 제거), 썸네일 자동 추출 로직.
    - `getNextArticleNo`: 번호 생성 로직의 원자성 및 폴백(sb-db 연동 모킹).
    - `serverAddViewLog`: 5분 내 중복 로그 방지 로직.

### 1.3 `src/app/api/cron/publish/route.ts`
예약 발행 및 휴지통 관리의 핵심 스케줄링 로직.
- **테스트 대상 로직:**
    - `runPublish`: 예약 시간 경과 기사 필터링 및 상태 변경 로직.
    - 휴지통 보관 기간(`retentionDays`) 계산 및 영구 삭제 로직.

## 2. E2E 테스트 시나리오 (TEST-02)

- **어드민 기사 관리 플로우:**
    1. 로그인 -> 기사 작성 페이지 진입.
    2. 제목, 본문 입력 및 썸네일 설정 -> 임시저장 -> 목록 확인.
    3. 기사 편집 -> 상태를 '게시'로 변경 -> 실제 기사 페이지 노출 확인.
    4. 기사 삭제 -> 휴지통 이동 확인 -> 휴지통에서 영구 삭제.
- **설정 저장 플로우:**
    1. 사이트 설정 변경 (사이트명 등) -> 저장 -> 새로고침 후 유지 확인.
    2. 워터마크 설정 변경 -> 저장 -> 이미지 업로드 시 워터마크 적용 확인(선택적).

## 3. 리팩토링 대상 분석 (QUAL-02)

### 3.1 `src/app/cam/settings/page.tsx` (1278줄)
- **문제점:** 단일 파일에 사이트, SMTP, 워터마크, 이미지, 댓글 등 모든 설정 로직과 UI가 집중됨.
- **개선 방향:**
    - `useSettings` 커스텀 훅: 설정 로딩 및 저장 로직 통합.
    - 섹션별 컴포넌트 분리: `BrandSettings`, `SmtpSettings`, `WatermarkSettings`, `ImageSettings`, `CommentSettings`.

### 3.2 `src/app/cam/articles/[id]/edit/page.tsx` (943줄)
- **문제점:** 기사 편집 상태 관리와 복잡한 제출 로직(이미지 이관, 타이머 등)이 뒤섞여 있음.
- **개선 방향:**
    - `useArticleEditor` 커스텀 훅: 기사 상태, 초안 자동 저장, 제출 로직 캡슐화.
    - UI 컴포넌트 분리: `ArticleForm`, `ArticleThumbnail`, `ArticleSidebar`, `ArticlePreview`.

## 4. 기술적 제약 및 고려사항
- **테스트 환경:** `vitest`를 기반으로 하며, DB 연동 부분은 모킹하거나 테스트용 DB 사용 검토.
- **E2E 도구:** 기존 `puppeteer` 활용 또는 `Playwright` 도입 여부 결정 필요 (현재 `vitest.e2e.config.mts` 기반).
- **리팩토링 원칙:** 기존 기능을 깨뜨리지 않는 점진적 분리 (최소 변경 원칙).
