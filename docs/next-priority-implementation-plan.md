# 다음 우선순위 구현 기획서

작성일: 2026-06-14

## 1. 목적

컬처피플 운영 안정성과 유입 개선을 위해 현재 남아 있는 미구현/미검증 과제를 급한 순서대로 정리한다. 이미 완료된 v2.0 안정화 작업과 네이버/구글 서치 등록은 제외하고, 실제 운영 반영과 데이터 안전성, 포털 제휴 준비, 자동화 신뢰성에 집중한다.

## 2. 현재 상태 요약

- `.planning` 기준 v2.0은 완료 상태다.
- 검색 색인/IndexNow 파이프라인, RSS/news-sitemap, IndexNow key route, AdSense ads.txt 설정은 로컬 코드에 반영되어 있다. 네이버뉴스·다음뉴스 뉴스 영역 자동 송고는 심사/제휴 전이므로 범위에 포함하지 않는다.
- 관련 단위 테스트와 타입체크는 통과했다.
- 운영 사이트에는 배포 후 실제 URL 응답과 관리자 흐름을 확인해야 한다.
- 로컬 백업은 동작 중이나 Supabase live export가 실패해 오래된 local fallback을 쓰고 있고, 일부 이미지 백업은 DNS 문제로 지연 중이다.

### 코드 검토 확인 사항 (2026-06-14)

코드 직접 확인으로 아래 사항을 검증했다.

**구현 완료**

- `src/lib/portal-publication.ts`: 포털 게재 공통 파이프라인. 5분 디바운스, DB 로그(`serverAddDistributeLogs`), 상태별 skip 처리가 모두 구현되어 있다.
- 포털 파이프라인 연결 경로: 관리자 수동 등록·수정·삭제(`/api/db/articles`), 예약발행(`/api/cron/publish`), auto-news(`/api/cron/auto-news`), auto-press cron(`/api/cron/auto-press`), auto-press worker-notify(`/api/auto-press/worker-notify`), 메일 등록(`/api/mail/register`), auto-press retry queue(`src/lib/auto-press-retry-queue.ts`), bulk-generate(`/api/ai/bulk-generate`) 모두 `publishArticleToPortals`를 통해 연결되어 있다.
- DELETE 핸들러 UUID 버그 수정 완료: soft delete 전에 `serverGetArticleById`로 `no`를 조회하고 `publishArticleToPortals`에 `articleNo`로 전달한다.
- `notify-search.ts`: 5초 타임아웃(`AbortSignal.timeout(5000)`) 추가 완료. Google ping은 네트워크 호출 없는 no-op shim으로 교체 완료.
- `sitemap.xml` `lastmod`: `updatedAt ?? date` 우선 반영 완료.
- `src/app/news-sitemap.xml/route.ts`: 48시간 이내 기사, 최대 1,000건, `news:publication/news:publication_date/news:title` 포함하여 구현 완료.
- `src/app/[indexNowKey]/route.ts`: `{key}.txt` 형식 검증 후 `cp-seo-settings.indexNowApiKey`와 일치할 때만 키를 반환. 불일치 시 404.
- `src/app/ads.txt/route.ts`: 관리자 설정 → Publisher ID 자동 생성 → 하드코딩 기본값 순으로 fallback 처리.
- `/rss.xml`, `/feed.xml`: App Router route가 직접 존재하며 `src/app/api/rss/route.ts`의 `GET`을 re-export한다. 따라서 현재 코드 기준 예상 응답은 직접 200이다. `next.config.ts` redirect는 `/rss`, `/feed` legacy 경로에만 남아 있다.
- RSS 본문 포함 기본값: `fullContent = rssSettings.fullContent ?? true`로 구현되어 있고, 전체 본문 모드에서는 `<content:encoded>`를 포함한다.
- `/cam/distribute`: 포털 게재 로그 표시, 실패/대기 상태에 재시도 버튼 구현 완료.
- `pnpm verify:portal`: 운영 URL 소량 검증 스크립트 추가 완료. `/ads.txt`, RSS/feed, sitemap/news-sitemap, IndexNow key txt를 점검한다.
- `/cam/rss`: 운영 설정의 `fullContent`가 false일 때 포털 제출용 경고와 "전문 제공 켜기" 버튼을 표시한다.
- `/cam/portal-review` 및 `/api/cam/portal-review`: 포털 제휴 심사용 기사 리스트 CSV/JSON 다운로드, 최근 기간별 발행량/기자/카테고리/자체기사 후보 리포트 구현 완료.
- 기사 상세 페이지: `NewsArticle` JSON-LD의 canonical 기준 URL, 절대 이미지 URL, `thumbnailUrl`, `isAccessibleForFree`, publisher 정보를 보강했다.
- 백업 상태 스크립트: Supabase stale fallback과 이미지 DNS 보류 상태에 대한 `nextActions`를 표시하도록 보강했다.

**라이브 검증 필요**

- 운영 배포 전이면 production에는 이전 redirect/피드 설정이 남아 있을 수 있으므로 `/rss.xml`, `/feed.xml`, `/rss`, `/feed`를 각각 `curl -I`/`curl -IL`로 확인해야 한다.
- `cp-rss-settings.fullContent`가 운영 DB에 `false`로 저장되어 있으면 코드 기본값(`true`)을 덮어쓸 수 있으므로, `/cam/rss` 설정값과 실제 피드 본문 포함 여부를 확인해야 한다.
- 2026-06-14 01:59 KST `pnpm verify:portal -- --base https://culturepeople.co.kr` 결과 production은 아직 미배포 상태로 보인다: `/ads.txt` 200, `/sitemap.xml` 200, `/rss.xml` GET 최종 200이나 HEAD 308, `/feed.xml` HEAD 308, `/news-sitemap.xml` 404.

## 3. 우선순위

### P0-001. 로컬 변경 배포 및 라이브 검증

**배경**

검색 색인/IndexNow, RSS, news sitemap, IndexNow key, AdSense ads.txt 변경이 로컬에 반영되었지만, 운영 반영 여부는 배포 후 실제 URL로 확인해야 한다.

**작업**

- 배포 전 변경 범위와 테스트 결과를 확인한다.
- Vercel 배포 토큰은 다른 프로젝트와 섞이지 않도록 전용 환경변수/Secret `CULTUREPEOPLE_VERCEL_TOKEN`만 사용한다.
- 배포 전 또는 배포 후 `pnpm verify:portal -- --base https://culturepeople.co.kr --key {indexNowKey}`로 정해진 URL만 소량 확인한다.
- 배포 후 다음 URL이 정상 응답하는지 확인한다.
  - `/ads.txt` — 200 응답, 한 줄 Publisher 선언 반환
  - `/rss.xml` — 200 직접 RSS XML 응답. 운영에서 308이면 이전 배포/캐시/라우팅 상태를 조사
  - `/feed.xml` — 200 직접 RSS XML 응답. `/rss.xml`과 동일한 RSS handler 사용
  - `/rss` — 308 redirect → `/api/rss` (legacy 경로, 예상 동작). `curl -IL`로 최종 200 확인
  - `/feed` — 308 redirect → `/feed.json` (legacy 경로, 예상 동작). `curl -IL`로 최종 200 확인
  - `/sitemap.xml` — 200 응답, 기사 URL과 `lastmod` 포함
  - `/news-sitemap.xml` — 200 응답, 48시간 이내 기사 `news:*` 요소 포함
  - `/{indexNowKey}.txt` — 200 응답, 키 문자열만 반환. 키 미설정 또는 불일치 시 404
- `/cam/distribute`에서 기존 배포 로그와 재시도 버튼이 정상 표시되는지 확인한다.
- `/cam/seo`, `/cam/ads`에서 설정 안내와 기본값이 정상 표시되는지 확인한다.

**완료 기준**

- 운영 `https://culturepeople.co.kr/ads.txt`가 다음 값을 반환한다.

```txt
google.com, pub-7637714403564102, DIRECT, f08c47fec0942fa0
```

- `/news-sitemap.xml`이 200 응답을 반환하고 `news:*` 요소가 포함된다.
- `/rss.xml`과 `/feed.xml`은 직접 200 RSS XML 응답을 반환한다. legacy `/rss` redirect는 `curl -IL https://culturepeople.co.kr/rss`로 최종 응답이 200인지 확인한다.
- sitemap에 기사 URL과 `lastmod`가 포함된다.
- IndexNow key txt가 설정된 키로만 200 응답을 반환한다.

**검증 명령 예시**

```bash
curl -fsS https://culturepeople.co.kr/ads.txt
curl -I https://culturepeople.co.kr/rss.xml
curl -I https://culturepeople.co.kr/feed.xml
curl -IL https://culturepeople.co.kr/rss
curl -IL https://culturepeople.co.kr/feed
curl -fsS https://culturepeople.co.kr/rss.xml | grep -E "<content:encoded>|<description>"
curl -I https://culturepeople.co.kr/news-sitemap.xml
curl -I https://culturepeople.co.kr/sitemap.xml
# {key}는 /cam/seo에 설정된 IndexNow API 키
curl -I "https://culturepeople.co.kr/{key}.txt"
```

**배포 명령**

```bash
export CULTUREPEOPLE_VERCEL_TOKEN="vercel_token_here"
pnpm deploy:culturepeople -- --verify
```

### P0-002. 로컬 백업 stale/fallback 문제 해결

**배경**

로컬 백업 자체는 정상 동작 중이지만, Supabase live export가 실패해 local fallback snapshot을 사용하고 있다. 현재 fallback snapshot은 오래되어 최신 2-DB 통합 백업 신뢰도를 떨어뜨린다. 이미지도 일부 Supabase storage host DNS 문제로 지연 중이다.

**현재 확인된 상태**

- 최신 백업: `/media/arbada/96B82074B8205551/Users/Documents/monet-registry-main/culturepeople-backups/2026-06-14T18-50-35-408Z`
- 최신 백업 OK: true
- merged articles: 3471
- D1/Supabase raw rows: 25343/3095
- SQLite snapshot: 생성됨
- Supabase source: `local_fallback`
- Supabase fallback age: 약 27.2일, stale
- media URLs backed up: 4034/8059
- remaining media URLs: 4025
- 지연 host: `ifducnfrjarmlpktrjkj.supabase.co`
- `backup:local:status` health: backup freshness ok, Supabase danger, image warning, disk ok, lock clear
- `ops:audit` IndexNow candidates/authFailed: 0/0
- `supabase:recovery-check -- --require-storage`: `project_unreachable_or_paused`로 blocked

**작업**

- Supabase live export 실패 원인을 다시 확인한다.
- Supabase 접근이 복구되면 `exports/supabase` fallback을 최신으로 갱신한다.
- DNS 문제 host가 복구되었는지 확인한다.
- 이미지 backfill이 복구 후 자동으로 남은 파일을 채우는지 확인한다.
- stale fallback이 계속될 경우 관리자/운영 리포트에서 위험도를 더 명확히 표시한다.

**완료 기준**

- `pnpm backup:local:status`에서 Supabase fallback stale 경고가 사라진다.
- 최신 백업에 D1/Supabase raw export가 모두 최신 상태로 들어간다.
- 이미지 백업 진행률이 50.1%에서 증가하거나, 복구 불가능한 URL이 별도 보류 상태로 분류된다.

**검증 명령**

```bash
pnpm backup:local:status -- --root "$CULTUREPEOPLE_BACKUP_ROOT"
systemctl --user --no-pager status culturepeople-local-backup.timer culturepeople-local-image-backfill.timer
pnpm supabase:recovery-check -- --require-storage
```

### P0-003. 검색 색인/IndexNow 운영 1건 실검증

**배경**

단위 테스트로 게시 상태 전환 시 포털 게재 파이프라인이 실행되는 것은 확인했다. 다만 운영에서는 실제 게시 1건으로 로그, 디바운스, 재시도 표시를 확인해야 한다.

**작업**

- 테스트용 게시 기사 1건을 생성하거나 기존 비중 낮은 기사 1건을 재게시한다.
- `/cam/distribute` 포털 게재 로그에 `[manual]` 또는 해당 source 태그와 함께 IndexNow 제출 성공 로그가 남는지 확인한다.
- 동일 URL을 5분 이내 재게시했을 때 디바운스 로그(`최근 5분 이내 같은 URL 제출 기록이 있어 중복 요청을 생략했습니다`)가 남는지 확인한다.
- auto-news 또는 auto-press 등록 결과도 `/cam/distribute`에서 `[auto-news]` / `[auto-press]` source로 로그가 남는지 확인한다.
- `/cam/distribute`에서 실패 항목의 재시도 버튼이 동작하는지 확인한다.

**완료 기준**

- 게시 순간 포털 게재 파이프라인이 자동 실행되고 로그가 `/cam/distribute`에 남는다.
- 5분 디바운스가 동작해 중복 제출 로그가 남는다.
- 실패 시 운영자가 `/cam/distribute`에서 재시도할 수 있다.
- 임시저장/상신/반려 기사는 IndexNow에 제출되지 않는다.

### P0-004. AdSense ads.txt 운영 반영 확인

**배경**

AdSense에서 ads.txt 없음 경고가 발생했다. 로컬 설정과 `/ads.txt` fallback은 반영했으므로 운영 배포 후 실제 Google 크롤러가 확인 가능한지 점검해야 한다.

**작업**

- 배포 후 `/ads.txt` 직접 응답을 확인한다.
- `/cam/ads` 글로벌 설정에 Publisher ID와 ads.txt 기본값이 보이는지 확인한다.
- AdSense 콘솔에서 경고가 사라지는지 대기 후 확인한다.

**완료 기준**

- `/ads.txt`가 200으로 한 줄 값을 반환한다.
- AdSense 콘솔의 ads.txt 경고가 해소된다.

## 4. P1 중요 과제

### P1-000. RSS 라이브 검증 및 운영 설정 고정

**배경**

네이버 서치어드바이저는 RSS 본문 포함을 권장한다. 현재 코드 기준으로는 `/rss.xml` 직접 route와 `fullContent` 기본값 `true`가 이미 구현되어 있다. 다만 운영 DB의 저장 설정 또는 배포 전 production 상태가 코드 기본값과 다를 수 있으므로, 포털 제출 전 라이브 응답을 고정 검증해야 한다.

**작업**

- 운영 `/rss.xml`과 `/feed.xml`이 직접 200 RSS XML을 반환하는지 확인한다.
- `/rss`, `/feed` legacy redirect는 `curl -IL` 기준 최종 200으로만 유지되는지 확인한다.
- 실제 `/rss.xml` 본문에 `<content:encoded>` 또는 충분한 본문 `<description>`이 포함되는지 확인한다.
- `/cam/rss`의 `fullContent` 저장값이 `false`로 고정되어 있으면 경고와 "전문 제공 켜기" 버튼으로 `true` 전환을 유도한다. **구현 완료**
- `docs/portal-auto-registration-plan.md`의 RSS 직접 응답/fullContent 항목은 코드상 완료 상태로 정리하고, 남은 작업은 라이브 검증으로 연결한다. **구현 완료**

**완료 기준**

- 네이버 서치어드바이저에 `/rss.xml`(또는 `/api/rss`)을 제출했을 때 본문이 포함된 피드를 반환한다.
- 운영 `/rss.xml`, `/feed.xml`은 직접 200 응답을 반환하고, `/rss`, `/feed` redirect도 최종 200으로 도착한다.
- 포털 제출 전 RSS 응답에 `<content:encoded>` 또는 본문형 `<description>`이 포함된다.

### P1-001. 포털 제휴 신청용 기사 리스트 CSV/JSON 다운로드

**배경**

네이버뉴스/다음뉴스 등 승인형 포털은 자동 색인만으로 입점되지 않는다. 심사 준비를 위해 기사 목록, 기자, 카테고리, 발행일, URL, 자체기사 여부 등을 바로 제출 가능한 형태로 추출해야 한다.

**작업**

- `/cam/portal-review` 화면에 export 버튼을 추가한다. **구현 완료**
- `/api/cam/portal-review?format=csv|json` 다운로드 API를 만든다. **구현 완료**
- 기본 필드는 다음으로 한다.
  - 기사 번호
  - 제목
  - 카테고리
  - 기자/작성자
  - 발행일
  - 수정일
  - 기사 URL
  - 원문/출처 URL
  - AI 생성 여부
  - 보도자료/자체기사 구분 후보

**완료 기준**

- 최근 6개월 또는 기간 지정 기사 리스트를 CSV/JSON으로 받을 수 있다.
- 심사 자료용 URL 목록을 수동 SQL 없이 생성할 수 있다.

### P1-002. 뉴스 제휴 심사 대비 리포트

**배경**

포털 뉴스 입점은 기술 자동화보다 매체 품질과 운영 자료가 중요하다. 자체기사/전문기사 비율, 기자별 기사 수, 카테고리별 발행량 리포트가 필요하다.

**작업**

- 최근 6개월 발행량 리포트 구현. **구현 완료**
- 기자별 기사 수 리포트 구현. **구현 완료**
- 카테고리별 기사 수 리포트 구현. **구현 완료**
- AI 생성/보도자료/외부 출처 기사 비중 표시. **구현 완료**
- 심사 제출용 요약 카드와 CSV export 제공. **구현 완료**

**완료 기준**

- 대표자가 포털 제휴 신청 시 필요한 운영 지표를 관리자 화면에서 확인할 수 있다.
- 리포트가 CSV/JSON export와 연결된다.

### P1-003. 기사 상세 SEO/뉴스 구조화 데이터 점검

**배경**

검색 유입과 Google News 후보 노출을 위해 기사 상세 페이지의 metadata와 `NewsArticle` JSON-LD 정합성을 점검해야 한다.

**작업**

- 기사 상세 canonical URL 확인 및 `cp-seo-settings.canonicalUrl` 기준 metadata/JSON-LD 보강. **구현 완료**
- 작성자, 발행일, 수정일 노출 확인.
- `Article` 또는 `NewsArticle` JSON-LD 확인. **구현 완료**
- 대표 이미지, publisher, logo 필드 확인 및 이미지 절대 URL/`thumbnailUrl` 보강. **구현 완료**
- 회사소개, 편집규약, 윤리강령, 청소년보호정책, 정정/반론보도 안내 페이지 링크 정리.

**완료 기준**

- 기사 상세 페이지가 검색엔진/뉴스형 크롤러가 읽기 좋은 구조화 데이터를 제공한다.
- 뉴스 제휴 심사 대비 필수 운영 페이지 링크가 정리된다.

### P1-004. auto-press 운영 검증 반복

**배경**

auto-press Phase 1~6 핵심 개발은 적용되었으나, 남은 작업은 라이브 사용량, DLQ 처리 결과, Vercel CPU 감소 추세를 반복 검증하는 것이다.

**작업**

- `/cam/auto-press`와 health route에서 큐/재시도/DLQ 상태 확인.
- Vercel CPU 사용량 감소 여부 확인.
- 일일 처리 상한 도달 시 다음 실행 대기 상태 확인.
- 실패 원인 분류와 텔레그램 리포트 정확도 확인.

**완료 기준**

- 자동 보도자료 등록이 서버 부하 없이 안정적으로 이어 실행된다.
- 실패/대기/포기 항목을 운영자가 추적할 수 있다.

## 5. P2 정리 과제

### P2-001. 관리자 기능 Playwright 스모크 강화

**작업**

- 현재 스모크는 `COOKIE_SECRET`로 서명한 관리자 쿠키 또는 `SMOKE_ADMIN_AUTH_TOKEN`을 사용한다.
- 운영 개선 화면은 `SMOKE_ADMIN_OPS_PAGES=1 pnpm smoke:browser -- --admin-ops-pages`로 확인한다.
- 대상: `/cam/articles`, `/cam/auto-press`, `/cam/distribute`, `/cam/rss`, `/cam/seo`, `/cam/portal-review`, `/cam/ads`.
- 저장/수정 버튼 흐름은 테스트 계정 또는 mock 환경에서만 확장한다.
- 비인증 접근은 로그인으로 이동하는지 확인.

**완료 기준**

- 핵심 관리자 기능이 배포 전 자동으로 회귀검수된다.

### P2-002. v3.0 계획 정리

**작업**

- 현재 문서의 P0/P1/P2를 `.planning`의 새 milestone으로 반영한다.
- 완료된 v2.0과 신규 운영 과제를 분리한다.
- `pnpm check:planning`이 통과하도록 ROADMAP/STATE/REQUIREMENTS를 갱신한다.

**완료 기준**

- 다음 작업이 “대화 기억”이 아니라 계획 파일 기준으로 추적된다.

## 6. 권장 착수 순서

현재 최신 작업 순서는 `docs/post-portal-operations-improvement-plan.md`가 기준이다. 이 문서는 배포/색인/RSS/portal-review 1차 구현 직후의 후속 계획이며, 2026-06-16 기준 다음 순서로 재정렬한다.

1. Supabase dashboard에서 프로젝트/스토리지 접근 복구 확인.
2. `pnpm supabase:recovery-check -- --require-storage`가 `readyForDbExport: true`, `readyForStorageCopy: true`를 반환하는지 확인.
3. Supabase가 복구된 경우에만 `pnpm backup:local:quiet -- --root "$CULTUREPEOPLE_BACKUP_ROOT"` 실행.
4. `pnpm backup:local:restore-check -- --root "$CULTUREPEOPLE_BACKUP_ROOT"`와 `pnpm backup:local:status -- --root "$CULTUREPEOPLE_BACKUP_ROOT"`로 stale fallback 경고 제거 확인.
5. `/cam/portal-review` CSV/JSON과 대표자 제출 서류로 네이버뉴스/다음뉴스/Google Publisher Center 심사 준비.
6. `SMOKE_ADMIN_OPS_PAGES=1 pnpm smoke:browser -- --admin-ops-pages`로 관리자 운영 화면 회귀검수.

## 7. 주의사항

- 운영 사이트나 포털에 대량 호출하지 않는다.
- 백업/이미지 작업은 현재처럼 저부하, 단일 concurrency, cooldown 정책을 유지한다.
- 기존 미배포 변경이 많으므로 배포 전에는 관련 테스트와 타입체크를 한 번 더 실행한다.
- 포털 뉴스 입점은 코드만으로 해결되지 않는다. 네이버뉴스/다음뉴스는 대표자의 서류/심사/제휴 승인 이후 송고 규격이 확정되어야 자동 송고 어댑터를 구현할 수 있다.
