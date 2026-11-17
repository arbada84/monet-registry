# Vercel 사용량 경고 조사 및 완화 기록

조사일: 2026-11-11 KST. 이 문서는 현재 확인한 사실, 코드상의 위험, 로컬 변경, 운영 미반영 사항을 구분한다.

## 1. 긴급 사항

- Gmail `arbada84@gmail.com`에서 Vercel 발신 알림을 확인했다. 최근 관련 메일 검색 결과 12건 중 서버 사용량 관련 알림을 대조했다. 전체 메일함의 모든 장애가 없다는 뜻은 아니다.
- 최신 알림: `Exceeded your limits: Upgrade now to avoid service disruption`, 2026-11-10 16:17:57 UTC / 2026-11-11 01:17:57 KST.
- 본문은 팀 `arbadas-projects-fdc12d41`의 Fluid Active CPU가 무료 포함량 4시간의 **287%**라고 명시한다. 약 11.5 CPU시간이며, 컬처피플 단독 사용량이나 방문자 수가 아니다. '287% 증가'가 아니라 포함량 대비 총 사용량이다.
- 본문은 24시간 내 계정 중단과 November 11을 함께 안내한다. 계정 화면에서 정확한 제한 시점을 확인해야 하며, 한국시간 날짜만으로 기한을 단정하지 않는다.
- 앞선 알림: 2026-10-30 CPU 100%, 2026-11-06 Function Invocations 75%.
- 현재 코드 최적화는 앞으로의 소비만 줄인다. 이미 소비한 사용량이나 계정 중단 예고를 취소하지 않는다. 요금 변경, 결제, 서비스 중지, 지원 문의 발송은 실행하지 않았다.

## 2. 실제 운영 확인

2026-11-11 09:40~09:50 KST 전후, 보호된 기존 Vercel 토큰으로 읽기 전용 조회했다. 토큰 원문, 메일 추적 URL, 원시 방문자 IP, 인증값은 이 문서에 저장하지 않았다.

| 항목 | 확인 결과 | 해석 한계 |
| --- | --- | --- |
| Vercel 팀 | Hobby, billing status `active`, `softBlock: null`, `blocked: null` | 조회 당시 상태이며 앞으로의 중단 예고 해소 증거가 아님 |
| `/` HEAD | 200, `private, no-cache, no-store`, `x-vercel-cache: MISS` | 전체 UI 정상·CPU 절감 증거는 아님 |
| `/api/health` HEAD | 200, `no-store`, MISS | 이 요청도 기존 의존성 점검을 실행함 |
| `/rss.xml` HEAD | 200, public cache, MISS | 단일 MISS만으로 캐시 장애라고 판단하지 않음 |
| 실제 `culturepeople.co.kr` alias | `dpl_HyWykUJPnBq2dSryQaVgJi4Uzirs` | 최신 READY 배포와 실제 alias를 별도로 조회함 |
| 운영 source SHA | `75c74f093efe48c05bc40e5277a4a903af4d334e` | 로컬 HEAD와 다름 |
| 로컬 HEAD | `64de8cd1547a807c9db67cf87bb4d998f9e59c5f` | 기존 보안/런타임 미커밋 변경도 보존 중 |

팀에는 `monet-registry-main`, `donjup`, `shortjup-mcp-gateway`, `mcp-gateway`가 있다. 앞의 세 프로젝트에서 각각 로그 표본 50건을 확인했다. 추가로 기존 `mcp-gateway`의 최근 1시간 production 로그를 최대 30건 조건으로 조회했으나 반환 0건이었다. 전체 기간 사용량 0 또는 삭제해도 안전하다는 증거는 아니다.

## 3. 원인 조사: 확정과 미확정

### 확인된 동작

최근 1시간 조건으로 프로젝트당 최대 100건을 요청했으나 CLI가 반환한 표본은 각각 50건이었다. 전체 시간대의 요청 총계나 완전한 수집 결과로 해석하지 않는다. 서로 다른 시각의 표본을 더해 요청량이나 CPU 점유율을 계산하지 않는다.

컬처피플의 두 번째 50건 표본:

| 경로 유형 | 건수 | 상태/캐시 |
| --- | ---: | --- |
| `/tag/[name]` | 21 | 200 18건, 404 3건, 모두 MISS |
| `/article/[id]` | 4 | 200 / MISS |
| `/` | 2 | 200 / MISS |
| `/api/public/site-settings` | 15 | 200, MISS 14건 / HIT 1건 |
| `/api/db/comments` | 2 | 200 / MISS |
| `/api/db/article-view` | 2 | 200 / MISS |
| `/api/coupang/products` | 2 | 200 / MISS |
| `/rss.xml` | 1 | 200 / MISS |
| `/api/health` | 1 | 200 / MISS |

- 컬처피플 표본에서 5xx는 발견하지 못했다. 태그 404는 없는 태그 등의 정상 정책일 수 있으며 자동 복구하지 않는다.
- 별도 `--status-code 5xx --since 1h --limit 30` 조회도 반환 0건이었다. 로그 보관·수집 범위 밖의 장애까지 배제하지 않는다.
- RootLayout의 `headers()` 사용과 요청별 CSP nonce 때문에 공개 HTML은 동적 응답이다. DB `unstable_cache`가 있어도 HTML 자체의 함수 실행이 사라지는 것은 아니다. 기존 `revalidate` 선언만 보고 CDN HIT 또는 CPU 절감 완료라고 해서는 안 된다.
- 돈줍 50건 표본도 아파트 상세 등 MISS와 일부 HIT/PRERENDER를 함께 보였다. 컬피 작업으로 돈줍 코드는 수정하지 않았다.
- 숏줍 MCP 표본 50건 중 `/api/worker/poll` 49건은 200/MISS, 1건은 상태값 0이었다. 상태 0을 HTTP 500이나 확정 오류로 바꾸어 해석하지 않는다. 이 표본의 첫/마지막 요청 시각 간격은 약 8분 17초다. 이는 해당 표본의 배경 호출 증거일 뿐 일일 총량 측정이 아니다.
- 로컬 숏줍 `scripts/shortjup_mcp_worker.py`에는 이미 idle backoff 10초→최대 30초와 jitter가 있다. 옛 문서의 '항상 10초'를 현재 사실로 반복하지 않는다. 여러 bot exchange별 poll, 실제 설치 버전, 활성 작업, 중복 호스트 여부는 숏줍 운영 담당 측에서 대조해야 한다. Fold3 설치·설정은 변경하지 않았다.

### 아직 확인되지 않은 것

- 프로젝트별/경로별 CPU 총량과 CPU 상위 원인 비율.
- 요청자의 실제 사람/봇 구분, 비정상 크롤러·중복 worker 여부.
- 현재까지의 월간/롤링 사용량 누계, 계정 중단 시각과 제한 해제 시점.

`vercel metrics ... --all --group-by projectId --aggregation sum --since 7d` 조회는 `payment_required / Observability Plus is required`로 거절됐다. schema 조회 성공은 사용량 조회 성공을 뜻하지 않는다.

`vercel usage --group-by project --json`도 Hobby 팀의 billing cost data unavailable로 실패했다. 데이터 부재를 사용량 0 또는 한도 초기화로 해석하지 않는다. 이 진단만을 위해 유료 Observability 구독은 구매하지 않았다.

## 4. 로컬 완화 변경

`src/app/api/health/route.ts`:

- 건강한 200 응답만 `Vercel-CDN-Cache-Control: public, max-age=15`로 Vercel CDN에 최대 15초 보관 가능하게 한다.
- 브라우저 `Cache-Control: no-store`는 유지한다.
- 의존성 오류 또는 예외의 503 응답은 CDN과 브라우저 모두 `no-store`를 명시한다. 예외 원문은 노출하지 않는다.
- `stale-while-revalidate`/`stale-if-error`는 사용하지 않는다. 정상 응답 캐시가 남아 있는 동안 새 장애 발견은 최대 15초 지연될 수 있다.
- D1/Supabase 선택, 미디어 설정 판정, HTTP 상태, 기존 JSON 계약은 바꾸지 않는다.
- 반복 상태 점검의 함수/DB 호출을 줄이는 제한적인 완화책이다. CPU 초과의 주원인을 해결했다거나 팀 전체 사용량이 감소했다고 주장하지 않는다.

공개 HTML에 강제로 public cache를 걸거나 CSP nonce를 제거하지 않았다. 관리자/개인화/보안 응답의 캐시 정책도 바꾸지 않았다.

## 5. 검증 및 운영 반영 상태

Node 24.16.0으로 실행:

```bash
pnpm test:unit -- tests/unit/public-health-cache.test.ts tests/unit/public-vercel-usage.test.ts tests/unit/csp.test.ts
pnpm ci:typecheck
git diff --check -- src/app/api/health/route.ts tests/unit/public-health-cache.test.ts
```

- 관련 테스트: 3개 파일 / 21개 테스트 통과. healthy 200, DB/미디어 503, 예외 비노출 및 다음 호출 복구, Supabase 선택, 기존 public settings 및 CSP 회귀 포함.
- `pnpm ci:typecheck`: 종료 코드 0, 통과.
- diff whitespace 검사 통과.
- 전체 단위 테스트와 production build는 이번 변경에 대해 아직 실행하지 않았다. 과거 통과 기록을 이번 실행으로 표시하지 않는다.
- **운영 배포 미실행**: 기존 보안·런타임 변경이 있는 dirty worktree이고 운영 정본/로컬 HEAD도 다르다. 이 상태를 통째로 배포하거나 clean release/manifest gate를 우회하지 않았다. 따라서 라이브 health의 CDN HIT나 사용량 감소는 아직 검증하지 못했다.

## 6. 즉시 필요한 대응과 다음 순서

1. **대표자: Vercel 팀 Usage/제한 알림 화면에서 중단 예고와 프로젝트별 Active CPU를 확인하고 서비스 유지 방법을 결정한다.** 지원 문의, 요금제 변경 또는 검증된 호스팅 이전은 별도 판단이다. 최적화만으로 소비된 CPU가 초기화되거나 중단이 취소된다고 안내하지 않는다.
2. 컬피: 현재 운영 SHA를 기준으로 이번 health 변경과 필요한 기존 보안 수정의 범위를 분리한 clean release를 준비한다. 동일 소스 테스트, release manifest/gate를 통과한 뒤에만 배포한다. 기존 security 수정과 다른 작업을 임의로 버리지 않는다.
3. 배포 후 `/api/health`를 같은 URL로 소량 2회 확인하여 200/`Cache-Control`/`x-vercel-cache`를 대조한다. HTTP 헤더 단위 테스트는 실제 CDN HIT의 증거가 아니다. query cache-buster는 사용하지 않는다.
4. 컬피 공개 HTML: per-request nonce를 유지하면서 가능한 최적화 범위와 public/private layout 분리 또는 정적 CSP 설계를 별도 검증한다. 게시·수정·삭제의 캐시 무효화, 관리자 격리, 광고·스크립트·SEO 회귀가 입증되기 전 무조건 ISR/CDN cache를 켜지 않는다.
5. 숏줍 담당: 현재 운영 worker SHA, bot 수, idle backoff 설치, 중복 worker와 poll 분산을 확인한다. 이미 존재하는 backoff를 중복 개발하거나 사용자 명령을 못 받도록 임의 정지하지 않는다.
6. 팀 사용량 원인 대조: 돈줍과 기존 `mcp-gateway`도 동일 기간 Usage를 확인한다. 컬피 단독 수정으로 팀 전체 한도 문제가 해결됐다고 표시하지 않는다.

운영 health 변경의 rollback은 해당 route의 CDN 전용 헤더 변경만 원복하는 것으로 제한한다. 기존 보안·런타임 패치는 rollback 범위에 포함하지 않는다.

## 7. 공식 참고

- [Fluid Compute 사용량과 과금 기준](https://vercel.com/docs/functions/usage-and-pricing)
- [팀 사용량 확인과 최적화](https://vercel.com/docs/pricing/manage-and-optimize-usage)
- [CLI metrics와 접근 요건](https://vercel.com/docs/cli/metrics)
- [CDN과 브라우저 Cache-Control 분리](https://vercel.com/docs/caching/cache-control-headers)

## 최종 검증 기록

- `pnpm ci:typecheck`: 종료 코드 0, 통과.
- 로컬 변경만 반영했으며 운영 한도 문제는 미해결 상태다.

## 8. 10시대 과부하 재점검

2026-11-11 10:03 KST 이후 재확인. 부하 시험이나 동시 요청을 하지 않고 공개 URL 여섯 개에 GET을 한 번씩 순차 실행했다. 응답 시간은 해당 단일 요청 관측값이며 평균, p95, 최대 처리량 또는 개선율이 아니다.

| 경로 | HTTP | 첫 응답까지 | 본문 수신 완료까지 | 캐시 |
| --- | ---: | ---: | ---: | --- |
| `/` | 200 | 846ms | 875ms | MISS |
| `/api/health` | 200 | 293ms | 410ms | MISS |
| `/rss.xml` | 200 | 391ms | 404ms | MISS |
| `/sitemap.xml` | 200 | 396ms | 423ms | HIT |
| `/category/문화` | 200 | 590ms | 646ms | MISS |
| 홈에서 발견한 `/article/5155` | 200 | 371ms | 372ms | MISS |

- health JSON은 `status=ok`, `initialized=true`, D1 `database.ok=true`, R2 `configured=true`였다. 이는 모든 이미지의 존재나 Supabase 원본 복구를 확인한 것이 아니다.
- Vercel 팀은 여전히 Hobby/active, blocked/softBlock은 null. production alias는 동일한 `dpl_HyWykUJPnBq2dSryQaVgJi4Uzirs`였다.
- 11월 10일 이후 Vercel/Cloudflare 알림 메일 재검색 결과는 앞서 확인한 287% CPU 중단 예고 한 건이었다. 최신 CPU 실측값으로 갱신된 숫자는 아니며, 알림이 사라지거나 제한이 해제됐다는 증거도 아니다.
- 최근 1시간 조건의 별도 5xx/429 로그 조회에서 각각 반환 0건. 최근 로그 50건의 중첩 로그에서 timeout 문자열은 발견하지 못했다. 수집·보관 범위 밖 오류나 미기록 timeout을 배제하는 검사는 아니다.
- 최신 50건 표본에는 점검 GET 자체도 섞여 있다. public site-settings 25건(MISS 20/HIT 5), tag 9건(200 5/404 4), article 3건, article-view 2건 등이 포함됐다. 요청 수를 실제 방문자 수 또는 CPU 점유율로 해석하지 않는다.
- `/api/cron/retry-ai-edit`의 409가 1건 확인됐다. 실제 운영 source SHA의 route를 `git show`로 대조하면 직접 AI 재시도를 막는 CPU 보호 분기가 존재한다. 409 자체를 서버 5xx, 무한 재시도 또는 과부하 장애로 분류하지 않는다.
- 다만 `.github/workflows/retry-ai-edit.yml`은 여전히 매시 45분에 해당 직접 경로를 호출하며, 비-200이면 warning으로 끝난다. 보호 분기를 강제로 해제하지 말고 Worker의 실제 재시도 처리·설치 상태 확인 후 기존 스케줄을 정리해야 한다. 이번에는 workflow/Worker/운영 env를 변경하거나 재시도 POST를 실행하지 않았다.

### 판단과 후속 우선순위

1. **P0 유지: 계정 사용량 한도와 중단 예고.** 현재 접속 가능과 별개로 해결되지 않았다. CPU 점유율을 모르는 상태에서 돈줍/MCP 중 하나를 주범으로 단정하지 않는다.
2. **P1 유지: 공개 HTML의 반복 SSR.** 홈/기사/카테고리는 여전히 private/no-store. 데이터 캐시와 별개로 함수 CPU를 사용하며, 보안·게시 신선도 검증 없는 강제 public cache는 금지한다.
3. **P1 유지: 이전 health 완화 변경의 운영 미반영.** 이번 재점검에서도 새 배포를 하지 않았다.
4. **P2 추가: 차단된 직접 AI 재시도 호출 스케줄 정리.** Worker에서 동일 작업이 실제 처리된다는 증거를 먼저 확보한다. 시간당 한 호출을 없애도 팀 CPU 초과를 해결하는 큰 절감으로 주장하지 않는다.

이번 점검 결론은 **관측한 URL과 로그에서 진행 중인 과부하 장애는 발견하지 못했지만, 계정 한도와 반복 동적 렌더링 위험은 남아 있음**이다. 대규모 부하 시험, 전체 관리자 화면, R2 파일 전수검사, 운영 설정 변경은 수행하지 않았다.

로컬 회귀 검증:

```bash
pnpm test:unit -- tests/unit/d1-http-client.test.ts tests/unit/public-health-cache.test.ts tests/unit/public-vercel-usage.test.ts tests/unit/auto-press-worker-runtime-controls.test.ts
```

결과: 종료 코드 0, 4개 파일 / 28개 테스트 통과. 이번에는 실행 코드 변경 없이 기존 D1 HTTP 처리, health 캐시, public 설정/요청 정책, Worker runtime control 회귀를 확인했다. 전체 테스트와 타입 검사를 이번 재점검에서 다시 실행하지는 않았다.

## 9. 불필요한 AI 재시도 호출 개선 및 운영 반영

2026-11-11 10시대, 사용자 요청에 따라 8절의 차단 경로 반복 호출을 정리했다. 아래 결과가 이 작업의 최신 상태이며, 앞 절의 'workflow/Worker 미변경'은 변경 전 점검 시점의 기록이다.

### 확인한 원인

- GitHub workflow `254349371` / `.github/workflows/retry-ai-edit.yml`은 활성 상태에서 매시 45분에 직접 재시도 endpoint를 호출했다. 실제 run `42935064644`의 로그에서도 `HTTP Status: 409`를 확인했다. 비-200을 warning만 출력해 workflow 자체는 success로 끝나고 있었다.
- 별도 Cloudflare `culturepeople-auto-press-retry-scheduler`도 매시 정각에 같은 endpoint로 `allowDirectProcessing: false` 요청을 전달했다. 이는 AI 처리 엔진이 아니라 Vercel로 요청을 전달하는 기존 proxy였다.
- 실제 운영 소스를 내려받아 수정 전 로컬 파일과 LF 정규화 SHA-256 일치를 확인했다. 이 Worker의 시간당 사용량 경고 기능은 필요하므로 보존했다.
- 실제 보도자료 처리 Worker `culturepeople-auto-press-worker`는 별도이며 원격 설정에서 enabled=true, dry-run=false, `*/10 * * * *` 및 `0 0 * * *` 스케줄을 확인했다. 이 Worker를 재배포하거나 큐 데이터를 변경하지 않았다. 이 확인만으로 모든 AI 재시도 항목의 성공을 주장하지 않는다.

### 코드 변경

1. `.github/workflows/retry-ai-edit.yml`: schedule 제거, 긴급 수동 dispatch만 허용. 기본 false인 boolean 승인과 event/job 조건을 모두 요구한다. 승인 시에도 최대 1건 요청, 60초 timeout, 자동 재호출 없음. secret은 step env로 전달하고 본문을 로그에 출력하지 않는다. 비-200은 실패로 처리하며 서버의 별도 CPU 보호 설정은 그대로 존중한다.
2. `cloudflare/workers/auto-press-retry-scheduler.js`: scheduled에서 직접 AI 재시도 전달만 삭제. Cloudflare 사용량 경고 호출과 기존 timeout은 유지. 수동 `/run`도 인증 및 boolean `allowDirectProcessing: true`가 있어야 전달하고, 이 경우에만 60초 timeout을 적용한다. GET 상태에 자동 재시도 off / 사용량 경고 on / 수동 opt-in 필수 여부를 표시한다.
3. `tests/unit/d1-operations-regression.test.ts`: 시간당 Worker가 사용량 경고 1건만 호출하고 차단된 재시도를 추가 호출하지 않는 계약으로 갱신.
4. `tests/unit/legacy-retry-call-policy.test.ts`: 자동 workflow trigger 금지, 수동 기본 차단, 무인증 차단, 잘못된 opt-in 차단, 명시적 긴급 실행의 단일 전달을 검증.

### 실제 운영 변경과 검증

| 대상 | 실행/확인 결과 |
| --- | --- |
| GitHub workflow | `gh workflow disable retry-ai-edit.yml --repo arbada84/monet-registry` 종료 코드 0 |
| GitHub 상태 재조회 | `disabled_manually`; 해당 workflow의 in-progress/queued run 조회는 각각 빈 배열 |
| Cloudflare 코드 업로드 | 테스트한 단일 retry-scheduler 모듈만 PUT. 기존 binding 유형 보존 옵션과 기존 compatibility/기타 설정 사용. secret 갱신 API는 호출하지 않음 |
| 새 Worker deployment | `df2dfb61-3c86-4b37-9620-b2e5206171a1` |
| 새 Worker version | `9a35014e-0826-435f-8e65-0bbb56a760d9`, traffic 100% |
| 보존 확인 | `CRON_SECRET`, `RETRY_LIMIT`, `SITE_URL` secret binding 이름/유형 일치; cron 목록/등록 시각/수정 시각 전후 일치 |
| Worker 공개 GET | 200, `scheduledRetryEnabled=false`, `scheduledUsageMonitoringEnabled=true`, `manualRetryRequiresExplicitOptIn=true` |
| 무인증 `/run` | 401 |
| 인증된 `/run`, opt-in=false | 409, Worker 자체의 `Direct AI retry requires explicit emergency opt-in.` 응답. Vercel 전달 전 차단 |
| 홈페이지 HEAD | 200, `x-vercel-error` 없음 |

Worker 주소: `https://culturepeople-auto-press-retry-scheduler.curpy.workers.dev/`.

배포 원본 파일 SHA-256: `10672f53c8b86b628c4794313ff15b4a1f2bdd545dcd6875d0697a5d36ceeb84`.
LF 정규화 SHA-256: `78c4854ca0aed7e077d30632872cbe393a416c7f400d4c6141ee4756f40c4974`.
이전 Worker version: `56cf63c3-5a27-465f-8746-ef702a11720d` (이전 deployment `0d743df1-1c7e-49d4-a67d-038c9d2e0087`).

### 검증 명령과 결과

```bash
pnpm test:unit -- tests/unit/legacy-retry-call-policy.test.ts tests/unit/d1-operations-regression.test.ts tests/unit/auto-press-worker-runtime-controls.test.ts tests/unit/auto-press-observability-routes.test.ts
pnpm ci:typecheck
node --check cloudflare/workers/auto-press-retry-scheduler.js
git diff --check -- .github/workflows/retry-ai-edit.yml cloudflare/workers/auto-press-retry-scheduler.js tests/unit/d1-operations-regression.test.ts tests/unit/legacy-retry-call-policy.test.ts
gh api repos/arbada84/monet-registry/actions/workflows/254349371 --jq '{id,state,path}'
```

이번 관련 테스트 결과: 4개 파일 / 27개 테스트 통과.
타입 검사, Node 구문 검사, diff whitespace 검사는 종료 코드 0.

### 효과와 남은 범위

- 두 시간당 자동 경로의 무의미한 재시도 요청을 제거했다. 설정 주기가 지연 없이 하루 내내 실행된다는 가정에서는 하루 48회(24+24)의 차단 요청을 예방하는 셈이나, 이는 실측 절감량이 아니다. 기존 GitHub 실행에는 지연이 있었으므로 실제 절감 호출 수는 다를 수 있다.
- 다음 정상 scheduled invocation의 실제 사용량 경고 수신과 장기 CPU 감소는 아직 관찰하지 않았다. 전체 CPU 한도 초과 해결이나 큰 비용 절감을 완료했다고 표시하지 않는다.
- 메인 사이트 Vercel 배포, DNS, Auth0, MCP, auto-news, 기존 health 캐시의 운영 배포, 운영 DB 쓰기/삭제, AI 재시도 실행은 하지 않았다.
- 새 수동 전용 YAML을 포함한 로컬 변경은 아직 commit/push하지 않았다. **즉시 중단은 GitHub 원격 disabled 상태로 적용했으며, 원격 저장소 YAML은 아직 이전 정본이다.** 향후 수동 전용 YAML이 기본 브랜치에 반영됐는지 확인하기 전에는 이 workflow를 다시 활성화하지 않는다.

### rollback / 재개

- Worker만 문제가 있으면 Cloudflare의 해당 Worker Versions & Deployments에서 이전 version `56cf63c3-5a27-465f-8746-ef702a11720d`를 100%로 rollback한다. 다른 Worker나 secret을 재생성하지 않는다. 이전 버전은 무의미한 자동 전달도 다시 포함하므로 긴급 복구 용도로만 판단한다.
- GitHub 재활성화 명령은 `gh workflow enable retry-ai-edit.yml --repo arbada84/monet-registry`. 단, 현재 원격 YAML에는 자동 schedule이 있으므로 먼저 수동 전용 변경의 기본 브랜치 반영을 확인해야 한다.
- 긴급 수동 재시도가 필요하면 수정 YAML 반영 후 boolean 승인을 사용하고, 운영의 `AUTO_PRESS_DIRECT_AI_RETRY_ENABLED`까지 별도로 명시 허용해야 한다. 이번 작업에서는 그 보호 설정을 켜지 않았다.
