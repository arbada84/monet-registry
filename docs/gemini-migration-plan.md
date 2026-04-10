# Gemini 2.0 → 2.5 마이그레이션 계획서

> 작성일: 2026-04-01  
> 상태: **작업 예정**  
> 사유: Google Gemini 2.0 Flash 모델 2026-06-01 서비스 종료 예정

---

## 1. 배경

| 항목 | 내용 |
|------|------|
| 현재 사용 모델 | `gemini-2.0-flash` (전역 기본값) |
| 서비스 종료일 | **2026-06-01** |
| 현재 상태 | 2026-03-06부터 기존 사용자만 사용 가능 (신규 불가) |
| 권장 대체 모델 | `gemini-2.5-flash` (GA) |
| API 키 호환성 | 기존 Gemini API 키 그대로 사용 가능 |

---

## 2. 현황 — Gemini API 사용처 전수 조사

### 2-A. 기본값(fallback) 하드코딩 — `"gemini-2.0-flash"` (총 14곳)

| # | 파일 | 라인 | 용도 | 변경 내용 |
|---|------|------|------|----------|
| 1 | `src/lib/auto-defaults.ts` | 21 | 자동뉴스 기본 설정 `aiModel` | → `gemini-2.5-flash` |
| 2 | `src/lib/auto-defaults.ts` | 89 | 보도자료 기본 설정 `aiModel` | → `gemini-2.5-flash` |
| 3 | `src/lib/ai-prompt.ts` | 175 | `aiEditArticle()` callGemini fallback | → `gemini-2.5-flash` |
| 4 | `src/app/api/ai/route.ts` | 119 | 어드민 AI 편집 API fallback | → `gemini-2.5-flash` |
| 5 | `src/app/api/ai/learn-url/route.ts` | 147 | URL 학습 API fallback | → `gemini-2.5-flash` |
| 6 | `src/app/api/ai/learn-file/route.ts` | 59 | 파일 학습 API fallback | → `gemini-2.5-flash` |
| 7 | `src/app/api/ai/image-search/route.ts` | 75 | 이미지 검색 키워드 추출 (하드코딩) | → `gemini-2.5-flash` |
| 8 | `src/app/api/ai/bulk-generate/route.ts` | 62 | 일괄 생성 API fetch URL fallback | → `gemini-2.5-flash` |
| 9 | `src/app/api/ai/bulk-generate/route.ts` | 106 | 일괄 생성 모델 선택 fallback | → `gemini-2.5-flash` |
| 10 | `src/app/api/cron/auto-news/route.ts` | 205 | Pexels 키워드 추출 (하드코딩) | → `gemini-2.5-flash` |
| 11 | `src/app/api/cron/auto-news/route.ts` | 334 | 자동뉴스 cron AI 모델 fallback | → `gemini-2.5-flash` |
| 12 | `src/app/api/cron/auto-press/route.ts` | 335 | 보도자료 cron AI 모델 fallback | → `gemini-2.5-flash` |
| 13 | `src/app/api/cron/retry-ai-edit/route.ts` | 120 | AI 재시도 cron fallback | → `gemini-2.5-flash` |
| 14 | `src/app/api/mail/register/route.ts` | 67 | 메일 보도자료 AI 편집 fallback | → `gemini-2.5-flash` |

### 2-B. UI 모델 선택 드롭다운 (3개 페이지)

| # | 파일 | 라인 | 현재 상태 | 변경 내용 |
|---|------|------|----------|----------|
| 1 | `src/app/cam/ai-settings/page.tsx` | 20 | 기본값 `gemini-2.0-flash` | → `gemini-2.5-flash` |
| | | 34-38 | `GEMINI_MODELS` 배열: 2.0만 있음 (1.5도 있음) | 2.5 GA 추가, 2.0에 지원종료 라벨 |
| 2 | `src/app/cam/auto-news/page.tsx` | 23 | 기본값 `gemini-2.0-flash` | → `gemini-2.5-flash` |
| | | 358-363 | 드롭다운: 2.0 + 2.5 preview + 1.5 | 2.5 GA로 교체, 2.0 지원종료 라벨 |
| 3 | `src/app/cam/auto-press/page.tsx` | 70 | 기본값 `gemini-2.0-flash` | → `gemini-2.5-flash` |
| | | 415-420 | 드롭다운: 2.0 + 2.5 preview + 1.5 | 2.5 GA로 교체, 2.0 지원종료 라벨 |

### 2-C. 타입 정의

| # | 파일 | 라인 | 내용 |
|---|------|------|------|
| 1 | `src/types/article.ts` | 155 | 주석 `// gemini-2.0-flash, gpt-4o-mini 등` | 주석 업데이트 |

### 2-D. Gemini API 이미지 업로드 여부

**없음** — 모든 Gemini 호출은 텍스트(`parts: [{ text }]`)만 전송. 이미지 바이너리/base64 업로드 없음.

---

## 3. 작업 항목

### Task 1: DEPRECATED_MODELS 상수 정의
- **위치**: `src/lib/ai-prompt.ts` (또는 새 상수 파일)
- **내용**:
  ```ts
  export const DEPRECATED_GEMINI_MODELS = ["gemini-2.0-flash", "gemini-2.0-flash-lite"];
  export const DEFAULT_GEMINI_MODEL = "gemini-2.5-flash";
  ```
- UI 라벨 + API 에러 감지에서 공통 사용

### Task 2: 기본값 변경 (14곳)
- 2-A 표의 14곳 모두 `gemini-2.0-flash` → `gemini-2.5-flash`
- 가능하면 `DEFAULT_GEMINI_MODEL` 상수 import로 통일

### Task 3: UI 모델 목록 업데이트 (3개 페이지)
- **추가할 모델**:
  - `gemini-2.5-flash` — "Gemini 2.5 Flash (추천)"
  - `gemini-2.5-flash-lite` — "Gemini 2.5 Flash Lite (경량)"
  - `gemini-2.5-pro` — "Gemini 2.5 Pro"
- **기존 모델 라벨 변경**:
  - `gemini-2.0-flash` → "Gemini 2.0 Flash ⚠️ 6/1 지원종료"
  - `gemini-2.0-flash-lite` → "Gemini 2.0 Flash Lite ⚠️ 6/1 지원종료"
- `ai-settings/page.tsx`의 `GEMINI_MODELS` 배열 통일
- `auto-news`, `auto-press` 드롭다운도 동일하게

### Task 4: Deprecated 모델 사용 시 안내 메시지
- **방식**: 시간 체크 X → API 호출 실패(404/400 모델 없음) 시 감지
- **위치**: `callGemini()` 함수 + 직접 fetch 하는 곳
- **동작**:
  1. Gemini API 응답이 모델 관련 에러(404, `model not found` 등)이면
  2. 에러 메시지에 안내 포함: **"선택된 AI 모델이 지원 종료되었습니다. [AI 설정]에서 Gemini 2.5 Flash로 변경해주세요."**
  3. 자동 변경하지 않음 — 사용자가 직접 설정 페이지에서 변경
- **영향 범위**: `callGemini()` 공통함수 1곳 + 직접 fetch 5곳

---

## 4. 영향받는 기능 목록

| 기능 | API 경로 | 설명 |
|------|----------|------|
| 어드민 AI 편집 | `/api/ai` | 기사 본문 리라이트/요약/제목 |
| URL 학습 | `/api/ai/learn-url` | AI 스킬 URL 학습 |
| 파일 학습 | `/api/ai/learn-file` | AI 스킬 파일 학습 |
| 이미지 검색 | `/api/ai/image-search` | Pexels 키워드 추출 |
| 일괄 생성 | `/api/ai/bulk-generate` | 다수 기사 일괄 AI 처리 |
| 자동 뉴스 | `/api/cron/auto-news` | RSS 뉴스 자동 수집+AI 편집 |
| 보도자료 | `/api/cron/auto-press` | 보도자료 자동 수집+AI 편집 |
| AI 재시도 | `/api/cron/retry-ai-edit` | 실패 기사 AI 재편집 |
| 메일 보도자료 | `/api/mail/register` | IMAP 메일 → AI 편집 → 등록 |
| AI 설정 페이지 | `/cam/ai-settings` | 모델 선택 UI |
| 자동뉴스 설정 | `/cam/auto-news` | 모델 선택 드롭다운 |
| 보도자료 설정 | `/cam/auto-press` | 모델 선택 드롭다운 |

---

## 5. 모델 비교 (참고)

| 모델 | Input (1M tokens) | Output (1M tokens) | 속도 | 비고 |
|------|--------------------|---------------------|------|------|
| gemini-2.0-flash | 무료/유료 | 무료/유료 | 빠름 | **6/1 종료** |
| gemini-2.5-flash | $0.15 | $0.60 | 빠름 | GA, 추천 |
| gemini-2.5-flash-lite | $0.02 | $0.10 | 매우 빠름 | 경량 대안 |
| gemini-2.5-pro | $1.25 | $10.00 | 보통 | 고품질 |

---

## 6. 작업 순서 (권장)

1. **Task 1** — 상수 정의 (의존성 없음, 먼저 작업)
2. **Task 2** — 기본값 변경 14곳 (상수 import)
3. **Task 3** — UI 드롭다운 업데이트 3페이지
4. **Task 4** — deprecated 모델 에러 안내 로직
5. 테스트 — AI 편집 정상 동작 확인
6. `vercel deploy --prod` 배포

---

## 7. 참고 자료

- [Gemini 공식 deprecation 문서](https://ai.google.dev/gemini-api/docs/deprecations)
- [Gemini 모델 목록](https://ai.google.dev/gemini-api/docs/models)
- [Gemini 2.0 종료 포럼](https://discuss.ai.google.dev/t/gemini-2-0-flash-discontinuation-date/131389)
