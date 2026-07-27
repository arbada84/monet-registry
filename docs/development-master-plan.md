# CulturePeople Development Master Plan

작성일: 2026-06-27  
기준 문서: `docs/post-portal-operations-improvement-plan.md`, `docs/next-priority-implementation-plan.md`, `docs/local-backup-runbook.md`, `docs/portal-auto-registration-plan.md`, `docs/press-media-migration-plan.md`

## 1. 목적

컬처피플 개발은 당분간 "새 기능 확장"보다 "운영 데이터 안전성, 비용 통제, 자동화 품질, 포털/검색 유입 준비"에 집중한다.

현재 검색 색인 자동화, RSS/sitemap/news-sitemap, IndexNow, portal-review, 보도자료 작성자 정리, 기본 로컬 백업 구조는 1차 구현 완료 상태다. 다음 마스터 플랜은 남은 병목을 개발 우선순위로 재정렬한다.

2026-07-09 기준 Linux Mint 운영 백업 루트는 repo 안의
`/media/arbada/96B82074B8205551/Users/Documents/monet-registry-main/culturepeople-backups`다.
`$HOME/culturepeople-backups`는 호환용 symlink로만 유지하며, 스크립트 기본값과 systemd는
`CULTUREPEOPLE_BACKUP_ROOT` 또는 repo-local 백업 루트를 사용한다.

## 2. 현재 운영 상태

2026-06-27 로컬 확인 기준:

- 최신 로컬 백업: `2026-06-25T18-45-30-022Z`
- 백업 freshness: 정상
- 통합 기사: `3626건`
- D1/Supabase raw rows: `31423/3095`
- Supabase source: `local_fallback`
- Supabase fallback age: `38.3일`, stale
- 이미지 백업: `4034/8059`, 남은 `4025`
- 이미지 백필: 최근 24시간 신규 저장 `+0`, Supabase host pause/defer 상태
- 로컬 백업 디스크 여유: 약 `29.9GB`
- IndexNow candidates/authFailed: `0/0`
- 네이버뉴스/다음뉴스: 이번 개발 범위에서 심사/제휴 준비와 자동 송고 모두 제외

## 3. 개발 원칙

- 서비스 중단 없이 진행한다.
- 운영 DB와 외부 서비스에는 대량 호출하지 않는다.
- 백업/이미지 작업은 단일 concurrency, cooldown, dry-run 우선으로 유지한다.
- Linux를 기본 개발 환경으로 하되 Windows 복귀가 가능하도록 shell/systemd 전용 의존은 대체 명령을 문서화한다.
- 포털 뉴스 입점은 심사 승인 전까지 가짜 자동 송고 기능을 만들지 않는다.
- Supabase가 살아나기 전에는 fresh export나 이미지 대량 재시도를 강행하지 않는다.
- 기존 작업/변경사항은 되돌리지 않고, 필요한 파일만 좁게 수정한다.

## 4. 목표 아키텍처

### 데이터

- 운영 primary DB는 현재 구조대로 Cloudflare D1을 중심으로 유지한다.
- Supabase DB/Storage는 legacy source, 이미지 복구 source, 다운로드 source로 취급한다.
- Supabase가 복구되면 fresh export를 1회 확보하고, 이후 장기 의존도를 낮춘다.
- 로컬 통합 백업은 `culturepeople.sqlite`를 기준으로 D1/Supabase 원천 export를 함께 보관한다.

### 이미지

- 현재 Supabase Storage 이미지가 pause/defer 상태이므로 대량 재시도하지 않는다.
- 복구 또는 다운로드 가능 시점에 원본 이미지를 모두 로컬 확보한다.
- 장기 저장소는 R2 또는 동급 저비용 object storage로 이전하는 방향을 기본값으로 둔다.
- 본문/대표 이미지 URL rewrite는 dry-run 리포트, 샘플 검증, rollback mapping 확보 후 진행한다.

### 유입

- 현재 가능한 자동화는 IndexNow, RSS, sitemap, news-sitemap, 구조화 데이터, Search Console/Bing 연동이다.
- 네이버뉴스/다음뉴스는 심사/제휴 전 자동 송고 대상이 아니다.
- 현재 개발 목표는 포털 뉴스 업로드가 아니라 검색 색인 품질, 백업 안정성, 운영 리포트 강화다.

### 운영

- 로컬 백업은 primary local copy, second local/external copy, 선택적 offsite copy의 3단계로 확장한다.
- 운영 증빙은 `.deploy-logs`, `.portal-backfill-runs`, backup manifest, media manifest, ops audit report를 보관한다.
- 관리자 UI는 운영자가 확인해야 할 상태만 보여주고, secret 원문이나 local-only 경로는 노출하지 않는다.

## 5. 성공 지표

### 백업/RPO

- 로컬 백업 RPO: 24시간 이내.
- Supabase 복구 후 fallback age 목표: 3일 이내.
- primary backup과 second copy의 latest timestamp 차이: 24시간 이내.
- `backup:local:restore-check`는 primary와 second copy에서 모두 통과.
- 디스크 여유 기준:
  - 30GB 이하: warning.
  - 20GB 이하: danger.
  - 10GB 이하: 신규 대량 백업/이미지 작업 block.

### 이미지

- 현재 기준 이미지 백업률 `4034/8059`를 기준선으로 기록한다.
- Supabase 복구 전에는 이미지 백필 `+0`을 장애가 아니라 blocked 상태로 표시한다.
- Supabase 복구 후에는 24시간 내 신규 백필 증가가 있어야 한다.
- 최종 목표는 원본 이미지 100% 로컬 확보와 신규 이미지의 장기 저장소 전환이다.

### 검색/포털

- `ops:audit` 기준 IndexNow candidates/authFailed는 `0/0`을 유지한다.
- `/rss.xml`, `/feed.xml`, `/sitemap.xml`, `/news-sitemap.xml`, `/{indexNowKey}.txt`, `/ads.txt`는 배포 후 검증 대상이다.
- portal-review CSV/JSON은 월 1회 이상 최신 상태로 추출 가능해야 한다.

### 배포/품질

- 배포 전 `ci:typecheck`, 관련 Vitest, `verify:portal`, `ops:audit`를 통과한다.
- 관리자 핵심 화면 smoke는 major 변경 또는 운영 기능 변경 전에 실행한다.
- auto-press는 게시 성공만이 아니라 제외 사유, source tag, IndexNow 결과까지 추적한다.

## 6. 의사결정 게이트

### Gate A. Supabase 복구/결제/다운로드

- 조건: dashboard에서 프로젝트 resume, 결제, 또는 다운로드 경로 확인.
- 통과 후: `supabase:recovery-check`, `backup:local:quiet`, `restore-check`, `status` 순서로 진행.
- 통과 전: fresh export, 이미지 대량 backfill, storage migration apply 금지.

### Gate B. 이미지 저장소 결정

- 조건: 전체 후보 이미지 수, 용량, 비용, 공개 URL 정책, 캐시 정책이 리포트로 확인됨.
- 통과 후: 샘플 업로드와 공개 URL 검증.
- 통과 전: production URL rewrite 금지.

### Gate C. 포털 뉴스 송고

- 이번 개발 범위에서는 네이버뉴스/다음뉴스 심사, 제휴 신청 준비, 자동 송고 구현을 제외한다.
- 현재 가능한 범위는 검색 색인, RSS/sitemap/news-sitemap, IndexNow, 내부 운영 리포트다.
- 자동 송고 버튼, 가짜 업로드 로그, 성공처럼 보이는 UI는 만들지 않는다.

### Gate D. 대량 URL rewrite

- 조건: mapping 파일, dry-run 영향 기사 수, 샘플 기사 검증, rollback 절차가 모두 존재.
- 통과 후: 작은 batch apply부터 진행.
- 통과 전: 운영 DB 전체 update 금지.

### Gate E. 운영 대시보드 확장

- 조건: local-only 상태를 서버로 올릴 때 redaction, 인증, 보관 기간이 정리됨.
- 통과 후: `/cam`에 요약 상태 표시.
- 통과 전: 로컬 경로, secret, raw manifest 직접 노출 금지.

## 7. 세부 백로그

### CP-M0. 백업 안전성

- `CP-M0-001`: `backup:local:sync-copy` 구현. (완료)
- `CP-M0-002`: `backup:local:status`에 second copy freshness 표시. (완료)
- `CP-M0-003`: 디스크 압박 리포트와 오래된 로그/백업 후보 정리 dry-run.
- `CP-M0-004`: primary/second copy restore-check 일괄 실행 명령. (완료)
- `CP-M0-005`: stale fallback 3일 초과, 이미지 백필 +0, lock 장기 유지 경고 정리.

### CP-M1. Supabase 복구

- `CP-M1-001`: `ops:supabase-recovered-backup` 명령 추가. (완료)
- `CP-M1-002`: Supabase dashboard 수동 확인 체크리스트를 recovery runbook에 연결.
- `CP-M1-003`: Supabase 다운로드 파일 import 절차와 검증 명령 추가.
- `CP-M1-004`: Supabase service role/project ref 변경 시 secret drift 진단.

### CP-M2. 이미지 이전

- `CP-M2-001`: media migration dry-run report 강화. (완료: `cloudflare:r2:media-readiness`)
- `CP-M2-002`: R2 샘플 업로드/공개 URL 검증.
- `CP-M2-003`: 기사 본문/대표 이미지 URL rewrite planner.
- `CP-M2-004`: rollback mapping 보관과 검증.
- `CP-M2-005`: 신규 auto-press 이미지가 legacy Supabase로 쌓이지 않는 guard.

### CP-M3. 자동 보도자료

- `CP-M3-001`: auto-press quality scoring. (완료: report-only 점수)
- `CP-M3-002`: source exclusion/dashboard 보강.
- `CP-M3-003`: 보도자료 자동등록 후 게시/IndexNow/로그 연결 회귀 테스트.
- `CP-M3-004`: 비문화성 source 필터와 재검토 workflow.
- `CP-M3-005`: auto-news는 명시적으로 paused 상태를 유지하는 운영 표시.

### CP-M4. 포털/검색

- `CP-M4-001`: portal-review를 내부 검색 유입 운영 리포트로 강화. (완료)
- `CP-M4-002`: Search Console/Bing/AdSense 수동 확인 체크리스트.
- `CP-M4-003`: RSS fullContent 운영값 audit.
- `CP-M4-004`: NewsArticle 구조화 데이터 회귀 테스트.
- `CP-M4-005`: 네이버/다음 심사·제휴·자동송고 제외 범위를 UI와 문서에서 분리.

### CP-M5. 배포/검증

- `CP-M5-001`: `predeploy:ops-check` 명령 추가. (완료)
- `CP-M5-002`: 관리자 핵심 화면 smoke 정착.
- `CP-M5-003`: Vercel/Cloudflare rollback runbook 링크.
- `CP-M5-004`: 배포 로그 보관 위치와 실패 분류 자동 요약.

### CP-M6. 개발 환경

- `CP-M6-001`: `.env.vercel.local` 빈 secret 덮어쓰기 guard. (완료: `ops:env-drift-check`)
- `CP-M6-002`: Linux/Windows 백업/검증 명령 동등성 문서화.
- `CP-M6-003`: CRLF noise와 실변경 diff 분리 명령 문서화.
- `CP-M6-004`: `node_modules` OS 전환 시 재설치 점검 문서화.
- `CP-M6-005`: master plan, runbook, next-priority 문서 상태 동기화.

## 8. 대표자 수동 작업과 개발 작업 분리

### 대표자 수동 작업

- Supabase `images` 프로젝트 resume, 결제, 다운로드 중 하나를 결정한다.
- Supabase project ref, service role key, storage bucket 접근 가능 여부를 dashboard에서 확인한다.
- Google Search Console, Bing Webmaster Tools, AdSense 상태를 확인한다.
- 네이버뉴스/다음뉴스 제휴 심사 준비는 이번 개발/운영 범위에서 제외한다.
- R2 또는 대체 storage 결제/도메인 정책을 승인한다.

### 개발 작업

- 수동 확인 결과를 안전하게 검증하는 명령을 만든다.
- 로컬 백업과 second copy를 자동 검증한다.
- Supabase 복구 후 fresh export와 restore-check를 묶는다.
- 이미지 이전 dry-run, 샘플 업로드, URL rewrite planner를 만든다.
- 내부 검색 유입/운영 품질 리포트를 CSV/JSON으로 만든다.
- 실제 권한 없는 포털 자동 송고 기능은 만들지 않는다.

## 9. 배포/검증 정책

- 모든 대량 작업은 dry-run을 먼저 만든다.
- dry-run report에는 대상 수, 예상 변경량, 실패 가능성, rollback 파일 위치가 있어야 한다.
- 운영 DB 쓰기 작업은 작은 batch와 재개 가능한 cursor를 사용한다.
- 라이브 URL 검증은 소량 `curl` 또는 `verify:portal` 수준으로 제한한다.
- 배포 전 기본 명령:

```bash
pnpm ci:typecheck
pnpm ops:audit -- --root "$CULTUREPEOPLE_BACKUP_ROOT"
pnpm verify:portal -- --base https://culturepeople.co.kr
pnpm backup:local:restore-check -- --root "$CULTUREPEOPLE_BACKUP_ROOT"
```

- 관련 기능 변경 시 추가 명령:

```bash
pnpm test:unit
pnpm check:auto-press-agent-loop
SMOKE_ADMIN_OPS_PAGES=1 pnpm smoke:browser -- --admin-ops-pages
```

## 10. 위험도 매트릭스

| 위험 | 가능성 | 영향 | 대응 |
| --- | --- | --- | --- |
| Supabase 프로젝트 미복구 | 높음 | 높음 | 복구/결제/다운로드 gate 전 대량 작업 금지 |
| 로컬 백업 단일 위치 의존 | 높음 | 높음 | second copy와 restore-check 즉시 구현 |
| 디스크 20GB 이하 하락 | 중간 | 높음 | warning/danger/block 기준 도입 |
| 이미지 4025개 미확보 | 높음 | 중간 | Supabase 복구 후 저부하 백필, 이전 전 dry-run |
| 포털 자동 송고 오해 | 중간 | 중간 | 심사 전 불가를 UI/문서에 명확히 표시 |
| production URL 대량 rewrite 실패 | 낮음 | 높음 | mapping, 샘플, rollback, small batch |
| env token 덮어쓰기 | 중간 | 중간 | 프로젝트명 prefix와 빈 secret guard |
| Windows/Linux 전환 runtime 깨짐 | 중간 | 중간 | OS별 node_modules 재설치/CRLF 점검 문서화 |

## 11. 운영 리듬

### 매일

- `backup:local:status` 확인.
- 이미지 백필 신규 저장 수와 stale fallback 상태 확인.
- auto-press 실패/제외 사유 확인.

### 매주

- `backup:local:restore-check` 실행.
- second copy 최신성 확인.
- `ops:audit`로 IndexNow, RSS/sitemap, backup warning 확인.
- 디스크 여유와 오래된 로그 보관 상태 확인.

### 매월

- portal-review CSV/JSON export.
- 포털/검색 콘솔 제출 상태 확인.
- 백업 보관 정책과 외장/오프사이트 copy 상태 확인.
- 자동 보도자료 source 품질 리포트 검토.

### 주요 배포 전

- `ci:typecheck`, 관련 Vitest, `verify:portal`, `ops:audit`, 관리자 smoke 실행.
- Vercel/Cloudflare rollback 절차 확인.
- env secret drift와 `.env.vercel.local` 빈 값 덮어쓰기 확인.

## 12. 마스터 로드맵

### M0. 데이터 안전성 즉시 안정화

**목표**

이 컴퓨터 하나에만 의존하는 백업 구조를 벗어나고, Supabase stale fallback 상태를 명확히 관리한다.

**개발 작업**

1. `culturepeople-backups` 2중화 스크립트 추가. (완료)
   - 외장하드 또는 두 번째 로컬 경로로 Node 기반 복제.
   - Linux/Windows 모두 같은 `pnpm backup:local:sync-copy` 명령을 사용한다.
   - 복제 후 manifest, SQLite, media-url-index 기본 검증.
2. `backup:local:status`에 2중화 대상 최신성 표시. (완료)
3. 디스크 여유 30GB warning, 20GB danger, 10GB block 기준 표시. (완료)
4. Supabase 복구 후 실행할 원클릭 백업 명령 추가. (완료)
   - 예: `pnpm ops:supabase-recovered-backup`
   - 순서: `supabase:recovery-check` -> `backup:local:quiet` -> `restore-check` -> `status`.

**완료 기준**

- 원본 백업과 2차 백업의 latest backup timestamp가 일치한다.
- 2차 백업에서도 `backup:local:restore-check`가 통과한다.
- Supabase가 계속 blocked여도 운영자가 stale/fallback과 2중화 상태를 한눈에 구분한다.

**검증**

```bash
pnpm backup:local:status -- --root "$CULTUREPEOPLE_BACKUP_ROOT"
pnpm backup:local:restore-check -- --root "$CULTUREPEOPLE_BACKUP_ROOT"
pnpm ops:audit -- --root "$CULTUREPEOPLE_BACKUP_ROOT"
```

### M1. Supabase 복구/다운로드 대응

**목표**

Supabase 프로젝트가 결제/Resume 또는 다운로드 가능 상태가 되는 즉시 최신 DB와 Storage object를 로컬로 확보한다.

**대표자 수동 작업**

- Supabase dashboard에서 `images` 프로젝트 Resume/결제/다운로드 상태 확인.
- project ref `ifducnfrjarmlpktrjkj` 유지 여부 확인.
- service role key 변경 여부 확인.

**개발 작업**

1. Supabase 복구 후 원클릭 백업 명령 구현.
2. Supabase live export 성공 시 `exports/supabase` fallback snapshot을 최신으로 갱신.
3. Storage 접근이 복구되면 이미지 백필을 저부하로 재개.
4. 8월 25일 이후 다운로드 방식으로만 접근 가능해질 경우, 다운로드 파일을 `exports/supabase-downloads/`로 받아 local backup 구조에 편입하는 import 절차 작성.

**완료 기준**

- `supabase:recovery-check -- --require-storage`가 통과하거나, 다운로드 파일 기반 복원 경로가 문서화/검증된다.
- `backup:local:status`에서 Supabase source가 `live_rest`로 바뀌거나, 다운로드 기반 snapshot의 생성일이 최신으로 표시된다.
- 이미지 백업 진행률이 `50.1%`에서 증가한다.

### M2. 이미지 저장소 이전 및 비용 통제

**목표**

Supabase Storage pause 리스크를 줄이고, 이미지 저장/전송 비용을 예측 가능한 구조로 이전한다.

**개발 작업**

1. R2 또는 저가 저장소 후보를 확정하기 전 dry-run 리포트 작성.
   - 기존 `media-url-index.json`, `media-candidates.json`, R2 manifest를 기준으로 후보 목록 산출.
   - URL rewrite 영향 범위 CSV/JSON 출력.
2. R2 readiness와 비용 추정 명령을 마스터 검증 루틴에 연결.
3. 실제 copy는 batch/delay/limit 기반으로만 진행.
4. 기사 본문/썸네일 URL 변경은 dry-run -> staging 검증 -> production apply 순서로 분리.
5. 자동 보도자료 신규 이미지 업로드는 R2 전환 전 Supabase로 다시 쌓이지 않도록 predeploy guard를 강화.

**완료 기준**

- 이전 대상 이미지 수, 예상 용량, 예상 비용, rewrite 대상 기사 수가 리포트로 나온다.
- R2 또는 대체 저장소에 샘플 업로드/공개 URL 검증이 통과한다.
- production URL rewrite 전 롤백 가능한 mapping 파일이 보관된다.

**검증**

```bash
pnpm cloudflare:r2:check
pnpm cloudflare:r2:validate-manifest
pnpm cloudflare:r2:estimate-media -- --limit 200
pnpm cloudflare:r2:copy-media
```

### M3. 자동 보도자료 품질/부하 관리

**목표**

auto-press가 정상 게시되는 것을 넘어, 문화/예술/콘텐츠와 무관한 보도자료를 줄이고 서버 부하를 낮춘다.

**개발 작업**

1. source quality report 강화.
   - 정치/외교/일반 산업성 보도자료 비율.
   - `SKIPPED_OUT_OF_SCOPE_SOURCE`, `SKIPPED_NO_IMAGE`, `DUPLICATE_SOURCE` 추세.
   - 기자/작성자, source tag, IndexNow 결과 연결.
2. 자동 게시 전 품질 점수 기준 도입.
   - 문화 관련성 점수.
   - 이미지 품질 점수.
   - 중복 가능성 점수.
3. `/cam/auto-press`에 최근 제외 사유와 재검토 flow 보강.
4. Cloudflare worker/queue/dlq 상태를 운영자가 한 화면에서 확인하게 정리.
5. 보도자료 자동등록은 게시 상태로 저장하되, 자동 뉴스(auto-news)는 현재처럼 멈춘 상태를 유지한다.

**완료 기준**

- 운영자가 "왜 등록/제외됐는지"를 `/cam/auto-press`에서 확인할 수 있다.
- 비문화성 기사 유입 발견 시 설정/규칙으로 바로 보강 가능하다.
- auto-press 관련 테스트와 `check:auto-press-agent-loop`가 통과한다.

### M4. 검색 유입과 운영 리포트

**목표**

검색 색인 자동화는 유지하고, 네이버뉴스/다음뉴스 심사/제휴 준비는 제외한 채 내부 운영 품질 리포트와 검색 유입 점검에 집중한다.

**개발 작업**

1. `/cam/portal-review` 리포트 유지/보강.
   - 최근 6개월 발행량.
   - 자체기사/보도자료/AI 생성 비율.
   - 기자별 발행량.
   - 카테고리별 발행량.
   - 대표 이미지/본문 길이/중복 출처 품질 지표.
2. 내부 운영 점검용 CSV/JSON export 유지.
   - CSV/JSON.
   - 매체 소개 체크리스트.
   - 편집방침/윤리강령/청소년보호/정정반론 안내 링크 상태.
3. RSS fullContent 운영 확인을 정기 감사에 포함.
4. IndexNow backfill은 현재 `0/0` 상태를 유지하는지만 확인하고 대량 재제출하지 않는다.

**대표자 수동 작업**

- Google Search Console sitemap/news-sitemap 제출 상태 확인.
- Bing Webmaster Tools IndexNow 수신 확인.
- AdSense `/ads.txt` 상태 확인.

**완료 기준**

- `/cam/portal-review`에서 내부 운영 품질 자료를 SQL 없이 추출할 수 있다.
- 네이버/다음 뉴스 자동 송고와 심사 준비가 현재 범위에서 제외됐음이 명확하다.

### M5. 관리자 회귀검증과 배포 안전장치

**목표**

배포 전에 관리자 핵심 화면이 깨지는 문제를 자동으로 잡는다.

**개발 작업**

1. `SMOKE_ADMIN_OPS_PAGES=1 pnpm smoke:browser -- --admin-ops-pages`를 배포 전 루틴으로 문서화/스크립트화.
2. 대상 화면:
   - `/cam/articles`
   - `/cam/auto-press`
   - `/cam/distribute`
   - `/cam/rss`
   - `/cam/seo`
   - `/cam/portal-review`
   - `/cam/ads`
3. 저장/수정 flow는 mock 또는 테스트 계정에서만 확장.
4. `predeploy:safety`, `verify:portal`, `ops:audit`를 묶은 배포 전 체크 명령 추가.

**완료 기준**

- 배포 전 한 명령으로 타입체크, 주요 단위 테스트, portal surface, 관리자 smoke, ops audit를 실행한다.
- 실패 화면/명령이 명확히 출력된다.

### M6. 개발 환경/문서 정리

**목표**

Linux Mint 중심 개발을 유지하되 Windows로 돌아갈 수 있는 프로젝트 상태를 보장한다.

**개발 작업**

1. CRLF/noise 점검 명령 문서화.
2. `.env.vercel.local`의 빈 secret이 `.env.local` 값을 덮는 문제 정리.
3. systemd timer와 Windows Task Scheduler 대체 절차 동기화.
4. 운영 문서의 오래된 날짜/상태를 현재 상태 기준으로 주기 갱신.
5. master plan과 세부 runbook 간 링크 추가.

**완료 기준**

- Linux/Windows 양쪽에서 백업, 검증, 배포 준비 명령을 찾을 수 있다.
- 다음 작업자가 대화 기억 없이도 `docs/development-master-plan.md`에서 우선순위를 이해한다.

## 13. 30/60/90일 실행 순서

### 30일: 데이터 안전성

1. 백업 2중화 스크립트와 상태 표시 구현.
2. 디스크 여유 30GB 이하 warning 강화.
3. Supabase 복구 후 원클릭 백업 명령 구현.
4. 관리자 smoke를 배포 전 체크에 연결.

### 60일: 이미지/비용 구조

1. Supabase Resume/다운로드 후 최신 DB/Storage 확보.
2. 이미지 이전 dry-run 리포트 작성.
3. R2 또는 대체 저장소 샘플 업로드/공개 URL 검증.
4. 자동 보도자료 이미지 정책과 저장소 guard 강화.

### 90일: 운영 품질과 유입

1. auto-press 품질 지표와 제외 사유 UI 보강.
2. portal-review 내부 운영 리포트 완성.
3. 포털/검색 콘솔 제출 상태를 운영 체크리스트로 관리.
4. 배포 전 통합 검증 명령 정착.

## 14. 바로 착수할 개발건

**1순위: 백업 2중화**

이유:

- Supabase는 아직 stale fallback이고 이미지도 50.1%에서 멈춰 있다.
- 로컬 백업 자체는 정상이나 이 컴퓨터 한 곳에 집중되어 있다.
- 디스크 여유가 약 29.9GB까지 내려와 있으므로 2차 위치와 보관 정책이 필요하다.

권장 구현:

- `scripts/sync-local-backup-copy.mjs` 추가.
- package script: `backup:local:sync-copy`.
- 기능:
  - source root와 target root 지정.
  - latest backup, `_media-store`, `media-url-index.json`, `_logs` 선택 복제.
  - dry-run 기본.
  - apply 시 rsync/robocopy 호환 안내 또는 Node 기반 복제.
  - 복제 후 manifest/SQLite 존재 확인.
- 문서:
  - `docs/local-backup-runbook.md`에 Linux/Windows 명령 추가.

구현 후 검증:

```bash
pnpm backup:local:sync-copy -- --source "$CULTUREPEOPLE_BACKUP_ROOT" --target "/path/to/second-backup" --dry-run
pnpm backup:local:sync-copy -- --source "$CULTUREPEOPLE_BACKUP_ROOT" --target "/path/to/second-backup" --apply
pnpm backup:local:restore-check -- --root "/path/to/second-backup"
```

## 15. 다음 구현 프롬프트

아래 프롬프트로 다음 개발을 바로 시작한다.

```text
docs/development-master-plan.md 기준으로 CP-M0-001 백업 2중화부터 구현해줘.

진행 방식:
- 더 묻지 말고 현재 코드와 docs/local-backup-runbook.md, docs/post-portal-operations-improvement-plan.md를 먼저 읽어.
- 기존 변경사항은 되돌리지 말고 필요한 파일만 좁게 수정해.
- Linux Mint를 기본으로 하되 Windows 복귀 가능하도록 OS 종속 구현을 피하고 대체 명령을 문서화해.
- 서비스 중단과 라이브 대량 호출 없이 로컬 파일/단위 테스트 중심으로 검증해.

반드시 처리할 것:
- `scripts/sync-local-backup-copy.mjs` 또는 기존 패턴에 맞는 백업 2중화 스크립트를 추가해.
- package script `backup:local:sync-copy`를 추가해.
- 기본은 dry-run이고, `--apply`가 있을 때만 실제 복제하게 해.
- primary backup root와 target backup root를 인자로 받게 해.
- latest backup, manifest, SQLite, media manifest, media-url-index, logs 등 필요한 운영 증빙을 복제 대상으로 정리해.
- 복제 후 target에서 `backup:local:restore-check` 가능한 구조인지 검증해.
- `docs/local-backup-runbook.md`에 Linux/Windows 사용법을 추가해.

검증:
- 관련 단위 테스트를 추가/수정하고 실행해.
- `pnpm backup:local:sync-copy -- --source "$CULTUREPEOPLE_BACKUP_ROOT" --target "/tmp/culturepeople-backups-copy" --dry-run`
- 가능하면 작은 샘플 target으로 `--apply` 검증.
- `pnpm backup:local:restore-check -- --root "/tmp/culturepeople-backups-copy"`
- `pnpm ci:typecheck`
```

## 16. 보류할 개발

- 네이버뉴스/다음뉴스 자동 송고: 심사/제휴 승인 전 보류.
- Supabase 이미지 대량 재시도: 프로젝트 Resume/다운로드 가능 전 보류.
- production 대량 URL rewrite: 이미지 이전 dry-run과 mapping 검증 전 보류.
- 운영 대시보드에 로컬 백업 직접 노출: 로컬 백업 요약 업로드/redaction 설계 전 보류.

## 17. 정기 검증 명령

```bash
pnpm backup:local:status -- --root "$CULTUREPEOPLE_BACKUP_ROOT"
pnpm backup:local:restore-check -- --root "$CULTUREPEOPLE_BACKUP_ROOT"
pnpm ops:audit -- --root "$CULTUREPEOPLE_BACKUP_ROOT"
pnpm verify:portal -- --base https://culturepeople.co.kr
pnpm supabase:recovery-check -- --require-storage
pnpm check:local-backup
pnpm check:auto-press-agent-loop
pnpm ci:typecheck
```

Supabase가 계속 paused/unreachable이면 `supabase:recovery-check` 실패는 expected blocked로 기록하고, fresh export와 이미지 대량 백필은 실행하지 않는다.

## 18. 현실화 상세 보강

보강일: 2026-06-27

이 섹션은 실제 코드와 `package.json` 기준으로 "이미 실행 가능한 명령"과 "신규 구현 필요"를 구분한다. 2026-06-27 기준 CP-M0~CP-M6의 1차 구현은 반영됐으며, 다음 작업자는 이 문서만 보고 운영 검증 범위와 blocked 조건을 판단할 수 있어야 한다.

### 확인된 기존 명령

현재 `package.json`에 존재하는 운영/검증 명령:

```bash
pnpm backup:local
pnpm backup:local:test
pnpm backup:local:sqlite
pnpm backup:local:verify
pnpm backup:local:restore-check
pnpm backup:local:status
pnpm backup:local:quiet
pnpm backup:local:media-backfill
pnpm check:local-backup
pnpm ops:audit
pnpm supabase:recovery-check
pnpm cloudflare:r2:check
pnpm cloudflare:r2:validate-manifest
pnpm cloudflare:r2:estimate-media
pnpm cloudflare:r2:copy-media
pnpm cloudflare:r2:verify-media
pnpm predeploy:safety
pnpm verify:portal
pnpm check:auto-press-agent-loop
pnpm smoke:browser
pnpm ci:typecheck
pnpm test:unit
```

### 구현 완료 명령

아래 명령은 이번 구현으로 `package.json`에 추가됐다.

```bash
pnpm backup:local:sync-copy
pnpm backup:local:restore-check-all
pnpm ops:supabase-recovered-backup
pnpm ops:env-drift-check
pnpm cloudflare:r2:media-readiness
pnpm predeploy:ops-check
```

### 아직 신규 구현 필요 명령

아래 명령은 아직 별도 구현 대상이다.

```bash
pnpm ops:disk-pressure-report         # 신규 구현 필요
pnpm media:url-rewrite:plan           # 신규 구현 필요
```

## 19. 현실 우선순위 재정렬

### P0. 데이터 유실 방지

1. 백업 2중화와 second copy 복원 검증.
2. 최신 백업의 restore-check 유지.
3. Supabase paused/unreachable 상태를 명확히 blocked로 표시.
4. Supabase 복구 후 fresh export를 안전하게 1회 실행할 절차 준비.
5. 디스크 여유가 부족할 때 대량 백업/이미지 작업을 멈추는 기준 정리.

P0에서는 신규 서비스 기능을 만들지 않는다. 목표는 "이미 있는 데이터를 잃지 않는 것"이다.

### P1. 이미지 복구/이전 준비

1. 이미지 4025개 미확보 상태를 대량 재시도 없이 추적.
2. Supabase 복구/다운로드 후 이미지 원본 확보 절차 준비.
3. R2 또는 대체 object storage 이전 dry-run 리포트 작성.
4. production URL rewrite 금지 조건과 해제 조건 명확화.
5. 디스크 압박 리포트와 보관 정책 정리.

### P2. 운영 품질/유입 준비

1. auto-press 품질 점수와 제외 사유 리포트 강화.
2. portal-review 내부 운영 리포트 CSV/JSON 보강.
3. 네이버뉴스/다음뉴스 심사·제휴·자동송고는 제외하고 가능한 검색 유입 개선만 진행.
4. RSS fullContent, NewsArticle 구조화 데이터, sitemap/news-sitemap 정기 감사.
5. 박영래 기자 author 정규화 유지 점검.

### P3. 회귀검증/문서 정리

1. 관리자 핵심 화면 smoke를 배포 전 루틴에 연결.
2. `predeploy:ops-check` 통합 명령 설계.
3. Linux/Windows 동시 개발 주의사항 문서화.
4. secret/env redaction과 빈 env 덮어쓰기 방지.
5. 관련 runbook의 오래된 상태 정리.

## 20. CP 백로그 상세 카드

### CP-M0. 백업 안전성

| 항목 | 내용 |
| --- | --- |
| 목적 | 로컬 백업이 한 컴퓨터/한 경로에만 있는 위험을 줄이고, 복원 가능한 second copy를 만든다. |
| 현재 상태 | `backup:local:status`, `backup:local:restore-check`, `ops:audit`, `backup:local:sync-copy`, `backup:local:restore-check-all`이 존재한다. |
| 개발 범위 | 백업 root 복제, latest backup/manifest/SQLite/media index/log 증빙 복제, second copy restore-check, 상태 출력 연동. |
| 제외 범위 | Supabase 복구 자체, 운영 DB 쓰기, 이미지 대량 다운로드, cloud/offsite 자동 업로드. |
| 필요한 파일/스크립트 후보 | `scripts/sync-local-backup-copy.mjs` 신규, `scripts/local-culturepeople-backup-status.mjs` 보강, `package.json` script 추가, `docs/local-backup-runbook.md`는 추후 연동 문서 보강 필요. |
| 대표자 수동 작업 | second copy 위치 결정. 예: 외장 SSD, 다른 내장 디스크, NAS, 동기화 폴더. |
| 검증 명령 | `pnpm backup:local:sync-copy -- --source "$CULTUREPEOPLE_BACKUP_ROOT" --target "/path/to/second-copy" --dry-run`, `pnpm backup:local:restore-check-all -- --root "$CULTUREPEOPLE_BACKUP_ROOT" --second-copy "/path/to/second-copy"`. |
| 완료 기준 | primary와 second copy의 latest timestamp 일치, second copy restore-check 통과, status에서 second copy lag 표시. |
| 실패/blocked 조건 | target 경로 쓰기 불가, 여유 공간 부족, SQLite/manifest 누락, 복제 중 lock 충돌. |
| 예상 리스크 | 너무 넓은 복제로 오래된 backup까지 모두 복사하면 디스크가 빠르게 찰 수 있음. 기본은 latest와 공유 media store 중심으로 시작한다. |

### CP-M1. Supabase 복구

| 항목 | 내용 |
| --- | --- |
| 목적 | Supabase live export/storage 접근을 복구하거나 다운로드 파일을 받아 stale fallback 의존을 제거한다. |
| 현재 상태 | `pnpm supabase:recovery-check -- --require-storage`는 존재한다. 현재 전제는 paused/unreachable 가능성이다. |
| 개발 범위 | 복구 후 fresh backup wrapper, 다운로드 파일 import 절차, fallback age 상태 정리, secret drift 진단. |
| 제외 범위 | Supabase 결제/Resume을 코드로 자동 처리, dashboard 조작 자동화, storage 대량 재시도. |
| 필요한 파일/스크립트 후보 | `scripts/supabase-recovery-check.mjs`, `scripts/run-local-backup-quiet.mjs`, `scripts/supabase-recovered-backup.mjs` 존재. 다운로드 파일 import 전용 스크립트는 필요 시 신규 구현. |
| 대표자 수동 작업 | dashboard에서 프로젝트 paused/resume, 결제, project ref, service role key, storage bucket 확인. |
| 검증 명령 | `pnpm supabase:recovery-check -- --require-storage`, `pnpm ops:supabase-recovered-backup -- --root "$CULTUREPEOPLE_BACKUP_ROOT" --dry-run`. |
| 완료 기준 | 최신 manifest의 Supabase source가 `live_rest`이거나 다운로드 import snapshot이 최신으로 기록됨. stale fallback 경고가 사라짐. |
| 실패/blocked 조건 | `project_unreachable_or_paused`, service key 불일치, storage bucket 접근 실패, 다운로드 파일 미확보. |
| 예상 리스크 | 복구 전 대량 재시도는 시간과 부하만 늘린다. 복구 확인 전에는 fresh export와 이미지 백필 apply를 금지한다. |

### CP-M2. 이미지 이전

| 항목 | 내용 |
| --- | --- |
| 목적 | Supabase Storage pause 리스크를 줄이고, 이미지 원본을 로컬/R2 등 안정 저장소로 이전할 준비를 한다. |
| 현재 상태 | R2 확인/manifest 검증/용량 추정/copy/verify 명령은 존재한다. 이미지 4025개는 Supabase host 접근 문제로 미확보 상태다. |
| 개발 범위 | media migration dry-run report, R2 샘플 공개 URL 검증, URL rewrite planner, rollback mapping 보관, 신규 이미지 업로드 provider guard. |
| 제외 범위 | Supabase 복구 전 미확보 이미지 대량 재시도, production DB URL 일괄 변경, R2 비용/결제 결정. |
| 필요한 파일/스크립트 후보 | 기존: `scripts/estimate-r2-media-manifest.mjs`, `scripts/copy-r2-media-from-manifest.mjs`, `scripts/verify-r2-media-public.mjs`, `scripts/r2-media-readiness-report.mjs`. 신규 구현 필요: production URL rewrite planner. |
| 대표자 수동 작업 | R2 사용 여부, bucket 이름, 공개 도메인, 결제/비용 허용 범위 결정. |
| 검증 명령 | 기존: `pnpm cloudflare:r2:check`, `pnpm cloudflare:r2:validate-manifest`, `pnpm cloudflare:r2:estimate-media -- --limit 200`, `pnpm cloudflare:r2:copy-media`, `pnpm cloudflare:r2:verify-media`. |
| 완료 기준 | 대상 이미지 수/용량/비용 추정, 샘플 URL 200 확인, rewrite 대상 기사 수와 rollback mapping 생성. |
| 실패/blocked 조건 | Supabase 원본 미확보, R2 credential 없음, 공개 URL 미확정, 샘플 이미지 200 검증 실패. |
| 예상 리스크 | URL rewrite를 너무 빨리 적용하면 기사 이미지가 깨질 수 있다. R2 copy apply와 D1 rewrite apply를 분리해야 한다. |

### CP-M3. 자동 보도자료

| 항목 | 내용 |
| --- | --- |
| 목적 | auto-press는 계속 운영하되 문화/예술 관련성과 이미지 품질을 높이고, auto-news는 멈춘 상태를 유지한다. |
| 현재 상태 | `DEFAULT_AUTO_PRESS_SETTINGS.publishStatus`는 `게시`, author는 `박영래`. `DEFAULT_AUTO_NEWS_SETTINGS.enabled`와 `cronEnabled`는 `false`, publishStatus는 `임시저장`. |
| 개발 범위 | source quality report, 제외 사유 UI, 품질 점수, 박영래 author 유지 점검, 게시 후 IndexNow/log 회귀 테스트. |
| 제외 범위 | auto-news 재가동, 포털 뉴스 자동 송고, 문화 범위 밖 기사 자동 확대. |
| 필요한 파일/스크립트 후보 | 기존: `src/app/api/cron/auto-press/route.ts`, `src/lib/auto-press-observability.ts`, `src/lib/auto-press-author.ts`, `src/lib/auto-defaults.ts`, `tests/unit/auto-press-*.test.ts`. 품질 점수는 `auto-press-observability` report-only 확장으로 1차 구현 완료. |
| 대표자 수동 작업 | 운영에서 제외할 source/카테고리 판단, 문화성 기준 승인. |
| 검증 명령 | 기존: `pnpm check:auto-press-agent-loop`, 관련 Vitest: `tests/unit/auto-press-*.test.ts`, `tests/unit/portal-publication*.test.ts`. |
| 완료 기준 | `/cam/auto-press`에서 등록/제외 이유, source tag, retry 상태, IndexNow 결과를 추적할 수 있음. |
| 실패/blocked 조건 | source별 로그 부족, 운영자가 문화성 기준을 정하지 않음, AI 편집 실패율 증가. |
| 예상 리스크 | 품질 필터가 과하면 유효한 보도자료가 누락되고, 약하면 비문화성 자료가 게시된다. 처음에는 report-only 점수로 시작한다. |

### CP-M4. 포털/검색

| 항목 | 내용 |
| --- | --- |
| 목적 | 검색 색인 자동화는 유지하고, 내부 운영 품질 리포트와 검색 유입 개선에 집중한다. |
| 현재 상태 | `verify:portal`, RSS, sitemap, news-sitemap, IndexNow, `/cam/portal-review` 관련 코드와 테스트가 존재한다. 네이버뉴스/다음뉴스 자동 송고는 이번 범위에서 제외됐다. |
| 개발 범위 | portal-review 내부 운영 리포트, RSS fullContent audit, NewsArticle 구조화 데이터 점검, Google/Bing/AdSense 수동 확인 체크리스트. |
| 제외 범위 | 네이버뉴스/다음뉴스 심사 준비, 기사 업로드, 자동 송고 성공 로그, 포털 제휴 API adapter. |
| 필요한 파일/스크립트 후보 | 기존: `src/lib/portal-review.ts`, `src/app/api/cam/portal-review/route.ts`, `src/app/cam/portal-review/page.tsx`, `scripts/verify-portal-surface.mjs`, `tests/unit/portal-review*.test.ts`. |
| 대표자 수동 작업 | Google Search Console, Bing Webmaster Tools, AdSense 상태 확인. |
| 검증 명령 | 기존: `pnpm verify:portal -- --base https://culturepeople.co.kr`, `pnpm ops:audit -- --root "$CULTUREPEOPLE_BACKUP_ROOT"`, portal-review 관련 unit test. |
| 완료 기준 | 최근 6개월 기사/기자/카테고리/품질 지표를 CSV/JSON으로 추출하고, 심사/제휴/자동송고 제외 범위가 UI/문서에서 분리됨. |
| 실패/blocked 조건 | RSS/구조화 데이터 오류, Search Console/Bing/AdSense 외부 콘솔 접근 필요. |
| 예상 리스크 | IndexNow를 네이버뉴스 입점으로 오해할 수 있다. 문서와 UI에서 "검색 색인"과 "뉴스 제휴 송고"를 계속 분리해야 한다. |

### CP-M5. 배포/검증

| 항목 | 내용 |
| --- | --- |
| 목적 | 배포 전 운영 핵심 기능이 깨졌는지 한 번에 확인한다. |
| 현재 상태 | `predeploy:safety`, `verify:portal`, `ops:audit`, `smoke:browser`, `ci:typecheck`, `test:unit`, `predeploy:ops-check`가 존재한다. |
| 개발 범위 | 기존 명령을 묶은 통합 check script, 관리자 ops page smoke 옵션 정리, 실패 요약과 로그 위치 안내. |
| 제외 범위 | 실제 배포 자동화 변경, 운영 DB 쓰기 smoke, 관리자 계정 정보 노출. |
| 필요한 파일/스크립트 후보 | 기존: `scripts/predeploy-safety-check.mjs`, `scripts/verify-portal-surface.mjs`, `scripts/browser-smoke.mjs`, `scripts/culturepeople-ops-audit.mjs`, `scripts/predeploy-ops-check.mjs`. |
| 대표자 수동 작업 | 배포 전 production env 변경 여부 확인, rollback 가능한 deployment 확인. |
| 검증 명령 | 기존: `pnpm predeploy:safety`, `pnpm verify:portal -- --base https://culturepeople.co.kr`, `pnpm ops:audit -- --root "$CULTUREPEOPLE_BACKUP_ROOT"`, `SMOKE_ADMIN_OPS_PAGES=1 pnpm smoke:browser -- --admin-ops-pages`. |
| 완료 기준 | 한 명령으로 주요 검증을 실행하거나, 최소한 순서와 실패 기준이 명확히 출력됨. |
| 실패/blocked 조건 | 관리자 인증 필요 smoke가 자동화 불가, live URL 확인 불가, env 누락. |
| 예상 리스크 | 검증 명령이 너무 무거우면 배포 전마다 생략된다. 기본은 빠른 check, 선택적으로 깊은 smoke를 둔다. |

### CP-M6. 개발 환경

| 항목 | 내용 |
| --- | --- |
| 목적 | Linux Mint 중심 개발을 유지하면서 Windows로 돌아갈 수 있는 상태를 보장한다. |
| 현재 상태 | Windows 경로에서 Linux로 작업 중이며, CRLF/noise와 OS별 `node_modules` 문제가 재발할 수 있다. |
| 개발 범위 | env precedence guard, CRLF 점검 명령, OS별 재설치 절차, systemd/Windows Task Scheduler 대체 문서, 문서 상태 동기화. |
| 제외 범위 | Windows 전용 런타임으로 회귀, Linux 전용 systemd만 있는 자동화 강제, secret 원문 문서화. |
| 필요한 파일/스크립트 후보 | `scripts/env-drift-check.mjs` 존재. `scripts/dev-environment-doctor.mjs`는 필요 시 신규 구현. 연동 문서 보강 필요: `docs/local-backup-runbook.md`, `docs/culturepeople-ops-recovery-runbook.md`. |
| 대표자 수동 작업 | Windows 복귀 시 Node/pnpm 재설치, `.env.local` 보관, 외장/백업 경로 확인. |
| 검증 명령 | `git diff --ignore-cr-at-eol`, `pnpm ci:typecheck`, `pnpm check:local-backup`, `pnpm ops:env-drift-check`. |
| 완료 기준 | Linux/Windows 모두에서 백업/검증/배포 준비 절차를 찾을 수 있고, 빈 env가 secret을 덮지 않음. |
| 실패/blocked 조건 | Windows 경로 권한 문제, OS별 native package 불일치, `.env.vercel.local` 빈 값 덮어쓰기. |
| 예상 리스크 | 같은 repo를 Windows와 Linux에서 번갈아 쓰면 `node_modules`와 line ending 문제가 반복된다. OS 전환 시 재설치/검증을 표준 절차로 둔다. |

## 21. 핵심 시나리오 상세화

### 백업 2중화 구조

권장 구조:

```text
Primary:
  $CULTUREPEOPLE_BACKUP_ROOT

Second copy 후보:
  /media/arbada/<external-drive>/culturepeople-backups-copy
  D:\culturepeople-backups-copy
  NAS:/culturepeople-backups-copy
```

복제 대상 우선순위:

1. latest timestamp backup folder.
2. root `media-url-index.json`.
3. `_media-store/` 중 latest manifest가 참조하는 파일.
4. `_logs/` 중 최근 30일.
5. latest `backup-manifest.json`, `merged/culturepeople.sqlite`, `merged/articles.json`, `media/media-manifest.json`.

복제 원칙:

- 기본은 dry-run.
- `--apply`가 있을 때만 실제 복제.
- target 여유 공간이 부족하면 시작하지 않는다.
- backup lock이 활성 상태면 기본 중단한다.
- second copy에서도 restore-check가 통과해야 "복제 완료"로 본다.
- Windows에서는 `robocopy` 또는 Node 기반 복제, Linux에서는 `rsync` 또는 Node 기반 복제를 허용한다.

### Supabase 복구/결제/다운로드별 대응

| 시나리오 | 대표자 판단 | 개발 대응 |
| --- | --- | --- |
| 무료 Resume 가능 | dashboard에서 resume | `supabase:recovery-check` 통과 후 `backup:local:quiet` 실행 |
| Pro 결제 후 유지 | 비용 수용 | fresh export, storage backfill, 이후 R2 전환으로 장기 의존 축소 |
| 결제하지 않고 다운로드 | 다운로드 가능 시점까지 대기 | 다운로드 파일 import 절차로 raw/supabase snapshot 생성 |
| 프로젝트 ref/key 변경 | dashboard에서 새 값 확인 | env drift 진단 후 backup 재실행 |
| storage만 실패 | bucket/권한 확인 | DB export와 image backfill을 분리해 DB 백업만 먼저 완료 |

Supabase가 복구되기 전에는 `backup:local:quiet`이 `local_fallback`을 사용하는 것은 허용하되, "완전한 fresh backup"으로 표현하지 않는다.

### 이미지 4025개 미확보 상태의 현실 대응

- 지금 당장 할 수 있는 것:
  - local manifest와 media-url-index 기준으로 미확보 URL 목록 유지.
  - DNS/host failure를 반복 재시도하지 않고 cooldown 처리.
  - 이미 확보한 4034개가 restore-check에서 읽히는지 확인.
  - 기사 본문에서 미확보 이미지 의존도가 큰 기사를 리포트로 분류.
- 지금 하면 안 되는 것:
  - Supabase host가 paused/unreachable인 상태에서 수천 URL 대량 재시도.
  - 미확보 이미지를 임의 placeholder로 운영 DB에 rewrite.
  - R2로 일부만 옮긴 뒤 production URL을 전체 변경.
- 복구 후 할 일:
  - `backup:local:media-backfill`을 낮은 `--max-new-media`, `--delay-ms`로 재개.
  - 새로 확보된 파일을 media-url-index에 반영.
  - R2 이전 대상 manifest를 다시 계산.

### R2 또는 대체 object storage 이전 절차

1. provider 후보 결정: R2 기본, 필요 시 S3-compatible 대체.
2. bucket과 public base URL 확정.
3. `cloudflare:r2:check`로 credential 확인.
4. `cloudflare:r2:validate-manifest`로 manifest 구조 확인.
5. `cloudflare:r2:estimate-media -- --limit 200`로 비용/실패율 추정.
6. `cloudflare:r2:copy-media` dry-run.
7. 작은 샘플만 `--apply`.
8. `cloudflare:r2:verify-media`로 public URL 200 확인.
9. URL rewrite planner로 기사 영향 범위 산출.
10. production rewrite는 별도 승인 후 small batch로 진행.

### production URL rewrite 금지 해제 조건

아래 조건이 모두 충족될 때까지 production URL rewrite는 금지한다.

- Supabase 원본 또는 다운로드 파일에서 이미지 원본 확보.
- R2 샘플 업로드와 공개 URL 검증 통과.
- rewrite 대상 기사 수와 URL mapping 파일 생성.
- mapping 파일을 보관하고 rollback 절차 확인.
- 샘플 기사에서 본문 이미지/대표 이미지 표시 확인.
- 운영 DB update batch size와 재개 cursor 설계.
- 대표자가 R2 public domain과 비용을 승인.

### 네이버/다음 뉴스 관련 제외 범위

가능한 것:

- RSS/sitemap/news-sitemap 정상화.
- IndexNow를 통한 검색 색인 알림.
- Google Search Console/Bing Webmaster Tools 제출 상태 확인.
- 기사 구조화 데이터와 canonical/meta 점검.
- portal-review 내부 운영 리포트 CSV/JSON 추출.
- 매체 소개, 편집방침, 윤리강령, 정정반론, 청소년보호정책 정리.

불가능하거나 보류할 것:

- 네이버뉴스/다음뉴스 뉴스탭 자동 업로드.
- 네이버뉴스/다음뉴스 심사/제휴 신청 준비.
- 포털 송고 API adapter.
- "포털 게재 성공"처럼 보이는 UI/로그.
- IndexNow 성공을 네이버뉴스 입점 성공으로 표시.

### auto-news와 auto-press 운영 전제

- auto-news는 계속 멈춘 상태로 둔다.
- auto-news 기본값은 `enabled: false`, `cronEnabled: false`, `publishStatus: "임시저장"`이다.
- auto-press는 운영 대상이며 기본 게시 상태와 박영래 author를 유지한다.
- auto-press 품질 개선은 report-only 점수부터 시작하고, 즉시 자동 차단은 신중하게 적용한다.

### 박영래 기자 author 정규화 유지 점검

현재 코드 기준:

- `src/lib/auto-press-author.ts`의 기본 author는 `박영래`.
- legacy author `CulturePeople AI`, `컬처피플 AI`, `편집팀`, 빈 값은 박영래 계정으로 resolve된다.
- `src/lib/auto-defaults.ts`의 auto-press 기본 author도 `박영래`.

유지 점검 계획:

- 신규 기사 저장 경로에서 `author`와 `authorEmail`이 박영래 계정 정보로 들어가는지 unit test 유지.
- 기존 기사 author drift는 auto-press author/default unit test와 운영 DB 샘플 조회로 유지 점검한다. 주기적 DB 감사 script는 추후 필요 시 추가한다.
- auto-news는 멈춘 상태이므로 author drift 원인이 되지 않아야 한다.

### Windows/Linux 동시 개발 주의사항

- OS 전환 후 `node_modules`는 재사용하지 않고 재설치한다.
- CRLF noise는 `git diff --ignore-cr-at-eol`로 먼저 분리한다.
- 백업 경로는 Linux `$CULTUREPEOPLE_BACKUP_ROOT`, Windows `%USERPROFILE%\culturepeople-backups`를 기본으로 문서화한다.
- systemd timer는 Linux 전용이므로 Windows Task Scheduler 대체 절차를 함께 적는다.
- `sqlite3` CLI가 Windows PATH에 없으면 restore-check는 `--skip-sqlite-cli`로 제한 검증만 가능하다고 표시한다.

### secret/env 관리와 로그 redaction

- 프로젝트별 Vercel token은 `CULTUREPEOPLE_VERCEL_TOKEN`처럼 서비스명을 포함한다.
- `.env.vercel.local`의 빈 secret이 `.env.local` 값을 덮는 문제는 `pnpm ops:env-drift-check`로 점검한다.
- logs/report에는 token, service role key, Cloudflare API token, Telegram token 원문을 남기지 않는다.
- redaction 패턴은 최소 `*_TOKEN`, `*_SECRET`, `*_KEY`, `SUPABASE_SERVICE_KEY`, `CLOUDFLARE_API_TOKEN`, `TELEGRAM_BOT_TOKEN`을 포함한다.
- 배포/검증 스크립트는 missing 여부만 출력하고 값은 출력하지 않는다.

### 디스크 부족 시 백업 보관 정책

- 30GB 이하: warning, second copy 권고.
- 20GB 이하: danger, 이미지 backfill과 대량 copy apply 보류.
- 10GB 이하: 신규 대량 백업 block.
- 삭제 우선순위:
  1. 오래된 `_logs`.
  2. 90일 초과 timestamp backup folder.
  3. 중복/실패 report.
  4. 마지막 수단으로 오래된 raw export.
- 삭제 금지:
  - latest backup folder.
  - latest second copy 검증 전 primary backup.
  - `_media-store` 원본 파일.
  - `media-url-index.json`.
  - latest `culturepeople.sqlite`.

## 22. 바로 개발 가능한 다음 5개 작업

### 1. CP-M0-001 백업 2중화

| 항목 | 내용 |
| --- | --- |
| 예상 수정 파일 | `scripts/sync-local-backup-copy.mjs` 신규, `package.json`, `tests/unit/backup-sync-copy-script.test.ts` 신규, `docs/local-backup-runbook.md`는 연동 문서 보강 필요 |
| package script | `backup:local:sync-copy` 구현 완료 |
| dry-run 명령 | `pnpm backup:local:sync-copy -- --source "$CULTUREPEOPLE_BACKUP_ROOT" --target "/tmp/culturepeople-backups-copy" --dry-run` |
| apply 명령 | `pnpm backup:local:sync-copy -- --source "$CULTUREPEOPLE_BACKUP_ROOT" --target "/tmp/culturepeople-backups-copy" --apply` |
| 검증 명령 | `pnpm backup:local:restore-check -- --root "/tmp/culturepeople-backups-copy"` |
| rollback/중단 기준 | target 여유 공간 부족, lock 활성, latest manifest 누락, dry-run 대상이 과도하면 apply 중단 |

### 2. CP-M0-002 second copy 상태 표시

| 항목 | 내용 |
| --- | --- |
| 예상 수정 파일 | `scripts/local-culturepeople-backup-status.mjs`, `tests/unit/backup-status-and-ops-audit.test.ts`, `docs/local-backup-runbook.md`는 연동 문서 보강 필요 |
| package script | 기존 `backup:local:status` 보강 |
| dry-run 명령 | `pnpm backup:local:status -- --root "$CULTUREPEOPLE_BACKUP_ROOT" --second-copy "/path/to/second-copy"` |
| apply 명령 | 없음. 읽기 전용 상태 확인 |
| 검증 명령 | `pnpm backup:local:status -- --root "$CULTUREPEOPLE_BACKUP_ROOT"` |
| rollback/중단 기준 | 상태 출력이 secret/local private path를 과도하게 노출하면 redaction 후 재검토 |

### 3. CP-M1-001 Supabase 복구 후 원클릭 백업

| 항목 | 내용 |
| --- | --- |
| 예상 수정 파일 | `scripts/supabase-recovered-backup.mjs` 신규, `package.json`, `tests/unit/supabase-recovered-backup-script.test.ts` 신규 |
| package script | `ops:supabase-recovered-backup` 구현 완료 |
| dry-run 명령 | `pnpm ops:supabase-recovered-backup -- --root "$CULTUREPEOPLE_BACKUP_ROOT" --dry-run` |
| apply 명령 | `pnpm ops:supabase-recovered-backup -- --root "$CULTUREPEOPLE_BACKUP_ROOT" --apply` |
| 검증 명령 | 기존 순서: `pnpm supabase:recovery-check -- --require-storage`, `pnpm backup:local:quiet -- --root "$CULTUREPEOPLE_BACKUP_ROOT"`, `pnpm backup:local:restore-check -- --root "$CULTUREPEOPLE_BACKUP_ROOT"` |
| rollback/중단 기준 | recovery-check가 blocked이면 backup apply 실행 금지 |

### 4. CP-M2-001 이미지 이전 dry-run 리포트

| 항목 | 내용 |
| --- | --- |
| 예상 수정 파일 | `scripts/report-media-migration-readiness.mjs` 신규, `scripts/estimate-r2-media-manifest.mjs` 보강 가능, `tests/unit/media-migration-readiness.test.ts` 신규 |
| package script | `cloudflare:r2:media-readiness` 구현 완료 |
| dry-run 명령 | `pnpm cloudflare:r2:media-readiness -- --root "$CULTUREPEOPLE_BACKUP_ROOT" --dry-run` |
| apply 명령 | 없음. 리포트 전용 |
| 검증 명령 | 기존: `pnpm cloudflare:r2:validate-manifest`, `pnpm cloudflare:r2:estimate-media -- --limit 200` |
| rollback/중단 기준 | Supabase 미확보 이미지 비율이 높거나 공개 URL 미확정이면 R2 apply/URL rewrite 금지 |

### 5. CP-M5-001 배포 전 운영 체크 묶음

| 항목 | 내용 |
| --- | --- |
| 예상 수정 파일 | `scripts/predeploy-ops-check.mjs` 신규, `package.json`, `tests/unit/predeploy-ops-check.test.ts` 신규 |
| package script | `predeploy:ops-check` 구현 완료 |
| dry-run 명령 | `pnpm predeploy:ops-check -- --root "$CULTUREPEOPLE_BACKUP_ROOT" --base https://culturepeople.co.kr --dry-run` |
| apply 명령 | 없음. 검증 전용 |
| 검증 명령 | 기존: `pnpm ci:typecheck`, `pnpm ops:audit -- --root "$CULTUREPEOPLE_BACKUP_ROOT"`, `pnpm verify:portal -- --base https://culturepeople.co.kr` |
| rollback/중단 기준 | live curl이 많아지거나 admin 인증을 요구하면 기본 검증에서 제외하고 optional smoke로 분리 |

## 23. 대표자 직접 작업 체크리스트

### Supabase

- [ ] Supabase dashboard에서 `images` 프로젝트가 paused인지 확인.
- [ ] Resume이 가능한지, Pro 결제가 필요한지, 다운로드만 가능한지 확인.
- [ ] project ref가 `ifducnfrjarmlpktrjkj`와 일치하는지 확인.
- [ ] service role key가 바뀌었는지 확인.
- [ ] storage bucket과 public object 접근이 가능한지 확인.
- [ ] 복구 후 개발자에게 `pnpm supabase:recovery-check -- --require-storage` 재실행 지시.

### Search Console/Bing/AdSense

- [ ] Google Search Console에서 `sitemap.xml`, `news-sitemap.xml`, RSS 제출 상태 확인.
- [ ] Bing Webmaster Tools에서 IndexNow 수신 상태 확인.
- [ ] `/ads.txt` 상태가 AdSense에서 정상 반영됐는지 확인.

### 제외된 포털 뉴스 심사/제휴

- [ ] 이번 범위에서는 네이버뉴스/다음뉴스 심사·제휴 신청 준비를 진행하지 않는다.
- [ ] 이번 범위에서는 포털 뉴스 자동 송고 기능을 만들지 않는다.
- [ ] `/cam/portal-review`는 내부 운영 품질/검색 유입 점검 리포트로 사용한다.

### 이번 범위에서 제외

- [ ] 네이버뉴스/다음뉴스 심사·제휴 신청 준비는 이번 개발 범위에서 제외한다.
- [ ] Google Publisher Center 등록 준비도 이번 범위에서 제외하고, 검색 색인/RSS/sitemap 안정화 이후 별도 판단한다.

### R2/Cloudflare

- [ ] R2 사용 여부와 비용 한도 결정.
- [ ] bucket 이름과 region/account 확인.
- [ ] public domain `media.culturepeople.co.kr` 같은 최종 URL 결정.
- [ ] Vercel production env에 R2 provider를 넣을지 승인.
- [ ] URL rewrite는 샘플 검증 전 승인하지 않는다.

## 24. 연동 문서 보강 필요

이번 요청에서는 `docs/development-master-plan.md`만 수정한다. 실제 개발에 들어갈 때 아래 문서는 함께 보강해야 한다.

- `docs/local-backup-runbook.md`: second copy 구조, Linux/Windows 복제 명령, 디스크 보관 정책.
- `docs/culturepeople-ops-recovery-runbook.md`: Supabase resume/download, service key drift, storage only failure 시나리오.
- `docs/post-portal-operations-improvement-plan.md`: P0/P1/P2/P3 우선순위와 심사 전 포털 송고 불가 전제 동기화.
- `docs/press-media-migration-plan.md`: R2 이전 gate, production URL rewrite 금지 조건, 신규 이미지 provider guard.
- `docs/portal-auto-registration-plan.md`: 검색 색인 자동화와 포털 뉴스 송고의 차이 재명시.

## 25. 다음 개발 프롬프트 3개

### 1단계: 백업 2중화만 구현

```text
docs/development-master-plan.md의 CP-M0-001 기준으로 백업 2중화만 구현해줘.

진행 방식:
- 개발 전에 package.json, scripts/local-culturepeople-backup-status.mjs, docs/local-backup-runbook.md를 읽어.
- 기존 변경사항은 되돌리지 말고 필요한 파일만 좁게 수정해.
- Linux/Windows 동시 개발 가능성을 유지하고, OS 전용 명령에만 의존하지 않게 해.
- 라이브 서비스 호출 없이 로컬 파일 기준으로만 검증해.

반드시 처리할 것:
- `scripts/sync-local-backup-copy.mjs` 신규 추가.
- `package.json`에 `backup:local:sync-copy` 추가.
- 기본은 dry-run, `--apply`가 있을 때만 복제.
- `--source`, `--target`, `--dry-run`, `--apply`, `--include-logs-days`, `--min-free-gb` 옵션 지원.
- latest backup, manifest, SQLite, media manifest, media-url-index, 필요한 media store 파일을 복제.
- target에서 `backup:local:restore-check`가 가능하도록 구조 유지.
- 관련 unit test 추가.

검증:
- `pnpm backup:local:sync-copy -- --source "$CULTUREPEOPLE_BACKUP_ROOT" --target "/tmp/culturepeople-backups-copy" --dry-run`
- `pnpm backup:local:sync-copy -- --source "$CULTUREPEOPLE_BACKUP_ROOT" --target "/tmp/culturepeople-backups-copy" --apply`
- `pnpm backup:local:restore-check -- --root "/tmp/culturepeople-backups-copy"`
- `pnpm check:local-backup`
- `pnpm ci:typecheck`
```

### 2단계: Supabase 복구 후 fresh backup/import 구현

```text
docs/development-master-plan.md의 CP-M1 기준으로 Supabase 복구 후 fresh backup/import 흐름을 구현해줘.

진행 방식:
- 먼저 `pnpm supabase:recovery-check -- --require-storage` 결과를 확인해.
- Supabase가 blocked면 fresh export나 이미지 대량 백필을 실행하지 말고, blocked 사유를 문서/출력에 남겨.
- Supabase가 ready일 때만 backup wrapper apply가 동작하게 해.
- 다운로드 파일 import는 운영 DB에 쓰지 않고 로컬 backup snapshot으로만 편입해.

반드시 처리할 것:
- `scripts/supabase-recovered-backup.mjs` 신규 추가.
- `package.json`에 `ops:supabase-recovered-backup` 추가.
- 순서: recovery-check -> backup:local:quiet -> restore-check -> status.
- `--dry-run`에서는 실행할 단계만 출력.
- recovery-check blocked 시 backup apply 중단.
- Supabase 다운로드 파일 import가 필요하면 `scripts/import-supabase-download.mjs` 설계/구현.
- secret 원문은 로그에 출력하지 않음.

검증:
- `pnpm ops:supabase-recovered-backup -- --root "$CULTUREPEOPLE_BACKUP_ROOT" --dry-run`
- Supabase ready일 때만 `pnpm ops:supabase-recovered-backup -- --root "$CULTUREPEOPLE_BACKUP_ROOT" --apply`
- `pnpm backup:local:restore-check -- --root "$CULTUREPEOPLE_BACKUP_ROOT"`
- `pnpm backup:local:status -- --root "$CULTUREPEOPLE_BACKUP_ROOT"`
- `pnpm ci:typecheck`
```

### 3단계: 이미지 이전 dry-run/R2 검증 구현

```text
docs/development-master-plan.md의 CP-M2 기준으로 이미지 이전 dry-run과 R2 검증 흐름을 구현해줘.

진행 방식:
- Supabase 미확보 이미지가 남아 있으면 production URL rewrite는 금지 상태로 유지해.
- 라이브 대량 호출 없이 local manifest와 작은 샘플 검증 중심으로 진행해.
- R2 copy apply와 D1/본문 URL rewrite apply를 분리해.
- 비용/대상 수/실패율이 리포트로 나오기 전에는 apply하지 마.

반드시 처리할 것:
- media migration readiness report 스크립트 추가 또는 기존 R2 estimate 보강.
- 미확보 이미지 수, 확보 이미지 수, 예상 용량, R2 copy 대상, rewrite 후보 기사 수를 출력.
- R2 샘플 공개 URL 검증 명령과 실패 기준 정리.
- URL rewrite planner는 dry-run report와 rollback mapping만 만들고 production DB에는 쓰지 않음.
- `docs/press-media-migration-plan.md`는 구현 단계에서 연동 보강.

검증:
- `pnpm cloudflare:r2:check`
- `pnpm cloudflare:r2:validate-manifest`
- `pnpm cloudflare:r2:estimate-media -- --limit 200`
- 구현 완료: `pnpm cloudflare:r2:media-readiness -- --root "$CULTUREPEOPLE_BACKUP_ROOT"`
- 신규 구현 필요: `pnpm media:url-rewrite:plan -- --root "$CULTUREPEOPLE_BACKUP_ROOT" --dry-run`
- `pnpm ci:typecheck`
```
