# 컬처피플 잔여 작업 실행 결과 (2026-10-18)

## 1. 범위와 운영 경계

- 저장소: `/mnt/win_d/Users/Documents/monet-registry-main`.
- 사용자 제외: 백업 디스크 정리, Supabase 원본 복구, 숏줍 MCP 배포. 세 작업을 실행하지 않았다.
- MCP는 provider alias/deployment 조회와 기존 B단계 결과서 대조만 수행했다. GitHub 연결, DNS, Auth0, Fold3, 키를 변경하지 않았다.
- 기사 대량 변경, 카테고리 정규화 apply, 이미지 다운로드, IndexNow 대량 제출을 하지 않았다.
- 아래의 **코드 반영**, **테스트**, **운영 배포**, **외부 확인**은 서로 다른 상태다. 코드 구현을 배포 완료나 Google 색인 완료로 해석하지 않는다.

## 2. 구현한 보완

### 운영 감사의 오래된 증거 오판 수정

- `scripts/culturepeople-ops-audit.mjs`의 IndexNow 증거를 생성 시각 기준 24시간으로 판정한다.
- 파일 복사로 mtime만 최신이 된 과거 보고서를 최신 보고서보다 우선하지 않는다.
- 누락·음수·소수·문자열 count를 0으로 바꾸지 않고 `null`/`unknown`으로 표시한다.
- legacy `successfulIndexNowLogsVisible` 필드를 읽는다. dry-run에서 제출하지 않았다는 이유만으로 과거 인증 실패 0건을 만들어내지 않는다.
- stale/invalid/불완전/부재 증거는 현재 상태 정상 판정을 실패시킨다. 백업 상태 실행 오류도 묵살하지 않는다.
- 선택적 `--run-indexnow-dry-run` 뒤에는 갱신된 증거를 다시 읽는다. 이번에는 이 옵션을 실행하지 않았다.
- 위 legacy 옵션도 이제 `--status-only` 집계를 사용한다. 실패해도 blocked artifact 경로를 수집해 감사 자체를 실패시키며, 이전 정상 보고서로 실패를 가리지 않는다. 성공/실패 두 경로를 외부 호출 없는 subprocess fixture로 검증했다.

실제 최초 로컬 재검증에서는 2026-06-15 보고서가 약 2,980시간 된 stale 증거이고, 인증 실패 수는 unknown이었다. 예전 `0/0` 출력은 현재 운영 정상의 증거가 아니었다. stale 증거에 의한 `ops:audit` 실패는 **현재 장애 확정이 아니라 최신 증거 부족**을 의미한다.

그 후 `pnpm ops:indexnow:status` 집계 전용 명령을 구현했다. URL 제출·기사 본문 다운로드 없이 두 SELECT 집계만 수행한다. legacy 설정 로그도 합쳐 기사 UUID/no 중복을 제거한다. malformed legacy/누락 집계/최근 실패가 있으면 정상 처리하지 않는다. 쿼리 계획에서 기사마다 전체 성공 키를 반복 스캔하는 correlated subquery를 피하도록 두 indexed join을 검증했다. 쿼리별 50,000 row read budget 및 쓰기 0건 검사를 둔다. 이 budget은 사전 DB 비용 보장이 아니라 첫 쿼리 실행 후 과다 비용 발견 시 추가 호출을 중단하는 장치다. 루프/고빈도 cron으로 실행하지 않는다.

2026-10-18 04:05 KST 실제 결과: 게시·미삭제 **4,676건**, 성공 로그가 연결되는 기사 **4,440건**, 미연결 후보 **236건**, 최근24h 실패/인증 실패 **0/0**. 검증된 최종 집계의 D1 rows read는 **41,037 + 2**, rows written **0 + 0**, duration 약22.6/0.16ms였다. 최초 집계 경로 점검과 개선 후 계측 확인에 각 1회씩 실행했으며 자동 반복은 추가하지 않았다. 후보는 현재 성공 로그 부재이지 Google 미색인 확정이나 반드시 신규 제출이 필요하다는 판정은 아니다. 236건의 일괄 전송은 미실행이다.

### 카테고리 탐색과 저부하 조회

- 세 테마에서 클라이언트 더보기 대신 `/category/{name}?page=n`의 실제 이전/다음 href를 제공한다.
- D1/Supabase 모두 게시·미삭제 목록만 페이지당 20건 표시하고, 다음 페이지 확인용 1건을 추가 조회한다. 본문 전체나 카테고리 전체 목록을 내려받지 않는다.
- 결정적 정렬과 page별 캐시 키, `articles` 무효화 태그, `prefetch=false`를 유지한다.
- 첫 페이지 canonical은 기본 URL, 이후는 자기 `?page=n` URL이다. 잘못된 page/빈 후속 페이지는 404, DB 실패는 빈 정상 200으로 바꾸지 않는다.
- 기존 `?items=`는 첫 canonical 페이지로 308 처리한다. 가짜 전체 기사 수를 제거했다.
- 카테고리 `loading.tsx`를 제거해 자체 loading boundary가 404 전에 응답을 먼저 스트리밍하는 경로를 줄였다. 실제 HTTP 상태는 별도 로컬 브라우저 검증이 필요하다.
- 이는 탐색 개선이며 Google의 미색인 4,309건의 원인을 입증하거나 색인을 보장한 것이 아니다.

### 관리자 read-only smoke 안전장치

- 기존 `readOnlyNoMutation=true` 상수 판정을 제거했다.
- 관리자 smoke는 브라우저에서 GET/HEAD/OPTIONS 외 요청을 실제 네트워크로 보내지 않는다.
- 알려진 메뉴 활동 로그 POST는 로컬 204로 억제하고 명시한다. 다른 쓰기 시도는 차단하며 검사도 실패시킨다.
- 요청 본문·query·외부 signed URL·인증값을 기록하지 않는다.
- 전체 관리자 ops 화면도 375/768/1024/1440 viewport를 검사하도록 확장했다.
- 권한 없는 관리자 검사를 PASS로 만들거나 운영 쿠키를 새로 발급하지 않았다. 이 장치는 클라이언트 요청 보호이며 서버 내부 GET의 부작용까지 자동 증명하는 것은 아니다.

### 보안 의존성과 메일 회귀

- Nodemailer를 9.0.3에서 10.1.2로, basic-ftp override를 5.3.1에서 6.2.3으로 올리고 lockfile을 갱신했다.
- 메일 생성(stream transport) → 한글 주소/제목 파싱과 mailparser/imapflow deep import 호환을 외부 SMTP 연결 없이 검증했다.
- 전체 audit은 Critical 0 / High 6 / Moderate 31 / Low 3에서 **Critical 0 / High 3 / Moderate 26 / Low 3**으로 감소했다. **보안 gate는 아직 실패**다.
- 잔여 High는 extract-zip 2건, braces 1건이다. ignore 목록 추가, 위험도 하향, production-only 전환으로 통과시키지 않았다.
- extract-zip 제거에는 Puppeteer 25 및 Node >=22.12 이행 또는 실제 Playwright 전환과 브라우저/스크레이퍼/스크린샷 회귀가 필요하다. 현재 Node 20 환경에 강제 설치하지 않았다.
- braces 3.0.3은 검사 시점 공식 수정판이 없다. 검증된 toolchain 대체 또는 투명하게 관리하는 보안 패치가 필요하며 버전 위장으로 audit을 우회하지 않는다.

근거: [Nodemailer 수정](https://github.com/advisories/GHSA-v53p-9fqp-m79j), [braces 미패치 취약점](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm), [extract-zip 취약점](https://github.com/advisories/GHSA-jmr9-qjv8-65gv).

### auto-press 만료 작업의 삭제 기사 보호

- 정합화 승인 기준은 게시 상태이면서 `deleted_at`/`deletedAt`이 없는 기사다. 조회 단계에서는 삭제·미게시 근거도 보존해 차단에 사용한다.
- ID가 없는 작업도 원문 URL이 삭제·미게시 기사와 일치하면 requeue하지 않는다. 오프라인 보고서와 로컬/Worker 실시간 조회 모두 해당 근거를 보존하고 정상 게시 일치가 있으면 우선한다.
- 자동 회수 flag=false와 관찰 기간은 변경하지 않았다. 라이브 requeue/reconcile/apply는 하지 않았다.
- 하드 삭제되어 ID/원문/이력이 전부 사라진 기사까지 이 수정으로 재구성할 수는 없다. 역사적 삭제 대조와 별도 tombstone 정책 전 자동 회수를 활성화하지 않는다.

### JSON-LD의 HTML 경계 보호

- 기사·카테고리 두 테마 분기의 JSON-LD를 공통 `serializeJsonLd`로 출력한다.
- 제목·카테고리명에 `</script>`가 들어가도 실제 script 요소를 닫지 못하도록 `<`를 JSON escape한다. 파싱 후 원문 데이터는 그대로 보존된다.
- 기사 본문·제목·운영 DB 자체를 변경하지 않았다. 단위 테스트로 직렬화 round-trip과 네 출력 지점 적용을 확인했다.

### 빌드 네트워크 및 모바일 관리자 화면

- 기존 Next 15 Google font 다운로드 코드가 production 모드에서 전체 요청 deadline을 두지 않는 점과 다수 재시도를 확인했다.
- `run-next-portable.mjs`는 `build`일 때만 Node preload를 추가한다. 기본 HTTP(S) agent는 host당 최대8연결이며 Google Fonts 요청에는 queue/DNS/TLS/body를 포함한 60초 deadline을 적용한다. 다른 URL에 font deadline을 적용하지 않으며 dev/start 운영 요청에는 preload하지 않는다. 별도 proxy agent는 기본 agent 연결 상한의 적용 대상이 아닐 수 있다.
- font mock이나 가짜 파일로 빌드를 통과시키지 않았다. 상한/timeout/정상 응답 후 해제/유사 도메인 제외 및 build-only 범위를 4개 단위 테스트로 확인했다.
- 첫 브라우저 확인에서 모바일 알리닷 계정 설명이 한두 글자 폭으로 줄바꿈되는 문제를 발견했다. 프로필 영역에 최소 basis를 주고 비활성 버튼이 다음 줄로 이동하게 했다. smoke에 폭160px 이상/설명 높이48px 이하 검사를 추가했다.

## 3. 배포 상태 대조

2026-10-18 04:32 KST provider 재조회 결과 (03:44 최초 조회와 동일):

| 서비스 | 운영 ID | 소스 | 상태 / 이번 작업 |
| --- | --- | --- | --- |
| 컬처피플 | `dpl_HyWykUJPnBq2dSryQaVgJi4Uzirs` | `75c74f093efe48c05bc40e5277a4a903af4d334e` | READY, 기존 운영 유지 |
| 숏줍 MCP | `dpl_4d6CKkFrJfjqXsijLVYBbiDPTgMX` | `6e522adaf29cdedc4cf294aaac94835f92a4305b` | READY, 조회만 수행 |

MCP 후속 `ed90c7d4897d43053f77633207093bb58797f238`의 운영 반영은 확인되지 않았다. B단계 결과서도 `BLOCKED_VERCEL_AUTHOR_ACCESS`이며 기존 gateway를 대신 재배포하지 않는다.

컬피 새 소스는 audit gate 통과 전 운영 승격하지 않는다. 이전 의존성으로 빌드한 `dpl_DtSv1XXAC5jWG4ovW2dsPcuYtivT`도 재사용하지 않는다.
Worker도 이번 작업에서 운영 배포하지 않았다. 삭제 보호의 새 코드와 실제 운영 버전을 혼동하지 않는다.

## 4. 검증 기록

| 검증 | 결과 |
| --- | --- |
| ops-audit/backup status 단위 | 1파일 14테스트 통과 |
| 메일 호환 + smoke guard/public-mode | 3파일 8테스트 통과 |
| 카테고리 helper/adapter/cache/세 테마 SSR | 4파일 30테스트 통과 |
| `check:automation` | 통과, auto-news cron 추가 없음 |
| `check:auto-press-agent-loop` | 통과 |
| `check:planning` | 통과 |
| `verify:portal -- --base https://culturepeople.co.kr` | 공개 surface 소량 검사 통과 (기존 운영본) |
| `pnpm audit --audit-level high` | 실패: High 3, upstream/toolchain 해결 필요 |
| `pnpm ops:indexnow:status` | 집계 확인: candidates 236 / authFailed 0, 제출·DB 쓰기 0 |
| 전체 단위 | 모바일 가독성 최종 수정 후 126파일 / 660테스트 재통과 (41.91초). 최종 변경 코드36파일 SHA-256 일치 |
| 타입 검사 | `pnpm ci:typecheck` 통과. 원본 경로 초기 검사와 최종 Linux 검증 사본 검사를 구분해 수행 |
| lint | 최종 Linux 사본에서 Next 15.5.24의 동일 lint CLI 통과, 경고/오류 없음 |
| production build | 모바일 가독성 수정 후 Linux 사본에서 152/152 static generation 및 lint/type 검증을 포함한 최종 빌드 통과. build ID `r8vPR0O_90Xpv43-itVIg` |
| 인증 관리자 실제 브라우저 smoke | 알리닷 UI 375/768/1024/1440px 모두 통과. 계정 설명 폭/높이, 가로 넘침, 8단계 흐름, object URL 회수 및 upload/TikTok 호출 없음 확인. 전체9화면 smoke와는 구분 |
| `check:local-backup` / `check:maintenance-admin` | 통과. syntax/guard 검사이며 실제 복원·운영 관리자 전체 검증을 대신하지 않음 |
| 새 운영 배포 | 미실행: security gate 실패 |

검증 명령:

```sh
pnpm ci:typecheck
node scripts/run-vitest-portable.mjs run --config vitest.config.mts --maxWorkers=2 --no-file-parallelism
pnpm lint
pnpm build
pnpm audit --audit-level high
pnpm check:automation
pnpm check:auto-press-agent-loop
pnpm check:planning
pnpm ops:audit -- --root "$HOME/culturepeople-backups"
pnpm ops:indexnow:status
pnpm smoke:admin-ops -- --base-url=http://127.0.0.1:3000 --json
```

portable Next/Vitest runner는 각각 단일 실행 잠금을 사용한다. 설치 중 Next 실행이나 같은 runner 중복 실행은 피한다. 최초 전체 테스트 시도는 다른 focused Vitest 실행 중 잠금으로 실패했으며 재실행 결과를 구분한다. 최초 lint도 설치 중 native link가 바뀌어 실패했으므로 설치 후 다시 검증했다.

NTFS 전체 테스트에서는 일부 기본 5초 timeout이 발생해 중단하고, 실제 env 파일 없이 `/tmp/culturepeople-unit-20261018-1tMOc8`에 동일 소스를 복사·동일 lockfile로 설치해 재검증했다. 첫 Linux 전체 검사 645건 중 644건 통과/이전 카테고리 장애 기대값 1건 실패를 확인하고 새 계약에 맞춰 수정했다. 651건 전체 통과 후 최종 리뷰 두 결함의 회귀와 build-only limiter까지 추가해 **126파일 660건 모두 통과**했다. backup status 테스트가 운영자의 실제 2차 사본 경로를 읽지 않도록 beforeEach에서 별도 임시 config 경로로 격리했다.

원본 NTFS build는 장시간 자원 사용을 피하려고 중단했고 최종 빌드는 Linux 사본에서 수행한다. 초기 Linux 타입 검사는 메모리 사용량을 줄이기 위해 중단 후 재실행했고 최종 통과했다. 중단된 실행을 성공으로 계산하지 않는다. 테스트 결과 cache 및 변경 코드 SHA-256은 `/home/arbada/.local/state/culturepeople-status-20261018/`에 보존했다. 이는 새 production 릴리스 manifest를 대신하지 않는다.
검증 종료와 코드 원격 보존 확인 후 직접 생성한 `/tmp` 사본만 제거했다. 원본 프로젝트·백업·기존 릴리스 폴더는 삭제하지 않았다.

관리자 브라우저 검증은 `127.0.0.1:3307`에만 일시적으로 서버를 띄웠고 실제 Cloudflare/Supabase/운영 secret은 제거했다. 임의 생성한 local-only 쿠키 키로 테스트했으며 종료 후 서버를 정지했다. fixture 영상의 headless codec fallback 검증은 실제 영상 재생 성공과 구분한다. 실제 TikTok 호출/서버 영상 upload가 없음을 확인했다.

최종 browser JSON은 `admin-tiktok-smoke-final.json`, 스크린샷은 `tiktok-smoke/` 아래 보존했다. `accountProfileReadable`, `noHorizontalOverflow`, `completedEightStepFlow`, `noServerUploadRequests`가 네 viewport 모두 true이고 blockedWrites/skipped는 빈 배열이었다. 모바일 수정 전후 스크린샷도 분리 보존했다. source hash/최종 단위 결과/보안 audit/production alias 읽기 결과는 위 local state 디렉터리에 보존한다. 실제 env 없이 빌드한 이 사본은 **운영 배포용 prebuilt bundle이 아니다**. 원본 NTFS의 중단된 `.next`도 배포에 재사용하지 않는다.

## 4.1 Git 보존과 수정 파일

- 코드 커밋 `95843c4`: 보안 의존성, 운영 증거 검증, IndexNow 집계, 카테고리 페이지네이션, read-only smoke, 삭제 보호 및 JSON-LD 경계 보호.
- 코드 커밋 `e3f05ff`: 최종 리뷰 두 결함 수정, build font 연결/deadline 제한, 실제 모바일 검증에서 발견한 계정 정보 폭 수정.
- 전체 파일 목록은 `git show --stat 95843c4`와 `git show --stat e3f05ff`로 재현한다. 두 커밋의 중복 수정 파일은 최종 상태에서 한 번만 센다.
- source branch: `codex/culturepeople-workspace-reconciled-20261016`. production 기본 branch를 강제 덮어쓰지 않는다. 원격 확인은 아래 완료 기록에 구분한다.
- 운영 API credential, `.env`, raw 보고서, backup, `.next`, 로컬 검증 snapshot은 커밋하지 않는다.

## 5. 완료로 처리하지 않은 항목

1. 보안 gate 전체 성공과 새 컬피 production 승격: 위 High 3건 해결 및 전체 gate 필요. 로컬 compile/type/unit/browser 성공으로 이를 우회하지 않았다.
2. Search Console 실제 실패 URL/최종 크롤링 시각: 받은 ZIP은 집계뿐이어서 실제 대상별 진단이 blocked다. 대표자가 사유별 상세 URL CSV를 내보내야 한다. 정상 표본이나 IndexNow 성공 로그를 근거로 전체 해결 처리하지 않는다.
3. 법적 책임자/승인 문안, 기사 데이터 사용 권리, TikTok 실제 OAuth·심사, 외부 Claude/ChatGPT UI 검증은 코드만으로 완료할 수 없다. 이전 누적 대장의 외부 조건을 유지한다.
4. 클라우드 주 실행·로컬 보조 전체 파이프라인, 사용량 동기간 효과 측정, Worker 과거 장애 원인 확정, 정기 암호화·외부 키 보관은 이번 보완만으로 완료되지 않았다.
5. 인증된 관리자 전체9화면 및 실데이터 API 연동 smoke는 미완료다. 이번에는 실제 운영 DB에 접속하지 않는 알리닷 UI 네 viewport만 브라우저로 검증했다. 세 공개 테마 카테고리는 SSR/adapter/cache/canonical 단위로 검증했으며 전체 브라우저 검증을 대신하지 않는다.
6. 디스크 정리·Supabase 복구·숏줍 MCP 배포는 사용자 제외 범위이며 실패나 누락을 감추기 위해 완료 표시하지 않는다.

## 6. 다음 안전한 순서

1. 브라우저 도구와 lint/toolchain 취약점 제거를 별도 회귀 범위로 해결하고 전체 보안 gate 재실행.
2. 최신 SHA로 전체 테스트·타입·lint·build·로컬 관리자/공개 브라우저 검증, 추적 가능한 release/rollback 증거 생성 후 컬피만 시험 배포·승격.
3. 성공 로그가 없는 236개 후보를 최소 범위로 대조하고, 이미 Google에 색인됐는지와 IndexNow 제출 로그를 분리한다. 승인된 정상 게시 기사만 소량 재시도하는 흐름으로 진행한다. Search Console 상세 URL은 기사 상태·HTTP·robots·canonical과 크롤링 시각별로 대조하며, 삭제 기사 404와 내부 noindex를 보존한다.

## 7. 보존 완료 기록

- 2026-10-18 04:48 KST 기준 코드 push 및 `git ls-remote` 대조 완료.
- 원격: `arbada84/monet-registry`, branch `codex/culturepeople-workspace-reconciled-20261016`.
- 검증한 코드 정본: `e3f05ffd30f2dc215dd6141d0f099fc4b51f042a` (앞선 `95843c4` 포함).
- 문서 변경은 별도 기록 commit으로 보존한다. main 강제 push/merge, Vercel/Worker 신규 배포는 실행하지 않는다.
- **로컬 구현·검증·코드 보존 완료와 전체 운영 과제 완료는 다르다.** 보안 High 3건 및 §5의 미완료 항목 때문에 전체 완료로 처리하지 않는다.
