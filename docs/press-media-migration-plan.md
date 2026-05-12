# 보도자료 이미지 및 마이그레이션 운영 계획

작성일: 2026-05-01

## 결론

보도자료 목록 크롤링은 이미지 파일을 직접 저장하지 않고 URL과 본문 HTML만 저장한다. 실제 저장소 용량이 늘어나는 구간은 보도자료를 기사로 등록할 때와 Supabase Storage 이미지를 R2로 복사할 때다.

현재 로컬 환경 기준 미디어 저장소는 `MEDIA_STORAGE_PROVIDER`가 설정되지 않아 Supabase 기본값으로 동작한다. Supabase 제한이 풀린 뒤 이 상태로 자동등록을 돌리면 다시 Supabase Storage 용량을 소비할 수 있으므로, 운영 전 R2 전환이 우선이다.

## 현재 확인된 흐름

| 구간 | 이미지 파일 다운로드 | 저장소 업로드 | 용량 위험 | 설명 |
| --- | --- | --- | --- | --- |
| 뉴스와이어 크롤링 | 없음 | 없음 | 낮음 | `press_feeds`에 `body_html`, `thumbnail`, `images` URL만 저장 |
| 보도자료 수동 등록 | 있음 | 있음 | 중간 | 본문 이미지와 썸네일을 `/api/upload/image`로 재업로드 |
| 보도자료 자동 등록 | 있음 | 있음 | 높음 | 본문 이미지 전체를 재업로드하려고 했고, 아이콘류가 섞일 수 있었음 |
| Supabase export 준비 | 없음 | 없음 | 낮음 | `media-manifest.json` 생성 및 URL rewrite 계획만 작성 |
| R2 media copy apply | 있음 | 있음 | 높음 | `copy-r2-media-from-manifest --apply` 시 실제 파일 복사 |

## 확인 근거

- `scripts/crawl-newswire.mjs`는 이미지 파일을 저장하지 않고 이미지 URL 배열을 JSON 문자열로 저장한다.
- `src/app/api/cron/auto-press/route.ts`는 기사 등록 직전 본문 이미지를 `serverUploadImageUrl()`로 재업로드한다.
- `src/app/cam/press-import/page.tsx`는 수동 등록 시 `reuploadImagesInHtml()`과 `reuploadImageUrl()`을 호출한다.
- `scripts/prepare-d1-import.mjs`는 R2 복사 대상 manifest만 만들고, 실제 복사는 `scripts/copy-r2-media-from-manifest.mjs`가 담당한다.
- 현재 D1 조회 결과는 전체 기사 5개, 활성 기사 0개, 삭제 기사 5개이며 활성 기사 이미지 참조는 없다.

## 주요 위험

| 등급 | 위험 | 영향 | 대응 |
| --- | --- | --- | --- |
| P0 | Supabase 기본 미디어 저장소 유지 | 제한 해제 후 다시 Storage 초과 가능 | Vercel Production에 R2 provider/env 설정 |
| P0 | R2 복사 전 용량 미예측 | 대량 복사로 비용/시간 예측 실패 | `cloudflare:r2:estimate-media` 선실행 |
| P1 | 정부 보도자료 UI 아이콘 혼입 | 기사 본문 품질 저하, 불필요 업로드 | 공통 이미지 정책으로 아이콘/로고/버튼 제거 |
| P1 | 본문 이미지 무제한 업로드 | 기사 1건당 저장소 급증 | 기본 기사당 최대 3장으로 제한 |
| P2 | `.env.vercel.local` 빈 토큰이 로컬 토큰 덮음 | 스크립트별 Cloudflare 조회 실패 | 빈 비밀값 제거 또는 env 로딩 우선순위 정리 |
| P2 | 복사 실패 이미지 처리 불명확 | 본문 이미지 누락 또는 외부 hotlink 유지 | copy report와 budget report를 기준으로 재시도 |

## 이번 고도화 반영 사항

1. 보도자료 이미지 정책을 공통 모듈로 분리했다.
2. 자동 보도자료 등록에서 아이콘, 로고, 버튼, RSS, SNS, pixel/tracking 이미지를 제외한다.
3. 수동 보도자료 등록에서도 같은 정책을 적용한다.
4. 기사당 업로드 후보 이미지를 기본 3장으로 제한한다.
5. R2 media manifest 용량 예측 스크립트를 추가했다.
6. D1 마이그레이션 rehearsal 과정에 media budget estimate 단계를 연결했다.

## 운영 권장 설정

Vercel Production 환경에는 아래 방향으로 설정한다. 실제 값은 대시보드에서만 관리하고 문서나 로그에 노출하지 않는다.

```env
MEDIA_STORAGE_PROVIDER=r2
STORAGE_PROVIDER=r2
R2_ACCOUNT_ID=...
R2_ACCESS_KEY_ID=...
R2_SECRET_ACCESS_KEY=...
R2_BUCKET=culturepeople-media-prod
R2_PUBLIC_BASE_URL=https://media.culturepeople.co.kr
PRESS_IMAGE_MAX_PER_ARTICLE=3
```

R2 public domain이 아직 없다면 `R2_PUBLIC_BASE_URL`은 확정된 공개 URL로 설정해야 한다. 공개 URL이 없으면 D1 import가 R2 URL로 rewrite하지 못한다.

## 18일 이후 마이그레이션 실행 순서

1. Supabase 제한이 풀리면 즉시 export를 실행한다.

```bash
pnpm supabase:export-for-d1
```

2. R2 공개 URL을 지정해 D1 import SQL과 media manifest를 만든다.

```bash
pnpm cloudflare:d1:rehearse-migration -- --media-base-url https://media.culturepeople.co.kr
```

3. manifest 구조와 중복 object key를 검증한다.

```bash
pnpm cloudflare:r2:validate-manifest
```

4. 실제 복사 전에 HEAD 기반 용량 예측을 한다.

```bash
pnpm cloudflare:r2:estimate-media -- --limit 200
```

5. 예측치와 실패/unknown 비율이 허용 범위면 R2 복사를 dry-run으로 확인한다.

```bash
pnpm cloudflare:r2:copy-media
```

6. 최종 승인 후 실제 복사를 실행한다.

```bash
pnpm cloudflare:r2:copy-media -- --apply
```

7. D1 SQL import와 사이트 smoke test를 진행한다.

```bash
pnpm cloudflare:d1:apply-sql -- --http-api --apply
pnpm cloudflare:d1:verify-import
pnpm cloudflare:migration:smoke -- --expect-live-database-provider d1 --expect-live-media-provider r2
```

## 이미지 정책

기본 정책은 “기사 품질에 필요한 대표 이미지 중심”이다.

- 기본 업로드 후보는 기사당 최대 3장이다.
- `icon`, `logo`, `button`, `badge`, `pixel`, `tracking`, `rss`, `sns` 계열 URL은 제외한다.
- `korea.kr/images/icon`, `korea.kr/images/v5/common`, `open_type` 계열 정부 사이트 UI 이미지는 제외한다.
- 이미 Supabase/R2/CulturePeople 도메인에 있는 이미지는 재업로드하지 않는다.
- 업로드 실패 시 등록 자체를 무조건 실패시키지는 않고, 품질 검수와 리포트로 추적한다.

## 다음 개발 후보

| 우선순위 | 항목 | 이유 |
| --- | --- | --- |
| P0 | Vercel env R2 전환 확인 API 보강 | 라이브가 Supabase로 업로드하지 않도록 배포 전 차단 |
| P1 | 텔레그램 일일 Storage/D1 사용량 리포트 | 무료/저가 플랜 유지에 필요 |
| P1 | 보도자료 등록 화면에 이미지 후보 미리보기/제외 표시 | 자동 필터 오탐을 운영자가 확인 가능 |
| P2 | R2 copy report 재시도 명령 자동 생성 | 마이그레이션 실패 복구 시간 단축 |
| P2 | 이미지 원본 URL별 content hash 중복 제거 | URL만 다른 동일 이미지 중복 저장 방지 |
