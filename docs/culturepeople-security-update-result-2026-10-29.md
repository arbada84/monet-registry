# 컬피 보안 업데이트 결과 (2026-10-29 KST)

최신 요약: **Critical 0 / High 0**, 전체 단위 **128개 파일 / 666개 테스트**,
타입/lint 및 최종 Node 24 production build **종료 0**까지 확인했다.
Moderate 13 / Low 1은 남는다. **운영 배포·원격 CI·commit/push는 실행하지 않았다.**
아래 1차 결과의 High 3과 중단된 빌드는 과거 실행 기록이며 2차 최종 결과와 구분한다.

## 범위와 보존

10월 27일 메일/사이트 점검 후 승인된 보안 업데이트를 적용했다. 기존 package.json, lockfile, stale recovery 수정 및 10월 23일 미커밋 결과 문서는 보존했다. 운영 DB 쓰기, 기사 변경, 이미지 다운로드, OAuth/Auth0/DNS 변경, 결제 또는 MCP 배포는 수행하지 않는다.

## 적용 버전

| 패키지 | 변경 전 로컬 | 변경 후 |
| --- | --- | --- |
| Next.js | 15.5.24 | 15.5.28 |
| eslint-config-next | 15.5.24 | 15.5.28 |
| DOMPurify | 3.4.12 | 3.4.17 |
| 앱 직접 Zod | 4.1.12 | 4.6.7 (최소 요구 ^4.6.6) |
| body-parser override | 2.3.0 | 2.4.0 |
| Puppeteer (2차) | 24.42.0 | 25.16.0 |
| shadcn (2차) | 4.4.0 | 4.23.0 |
| 프로젝트 Node 기준 (2차) | engines 미지정 | 24.x (24.16.0 검증) |

기존의 follow-redirects 1.16.1 / Vite 7.3.7 / Vitest 4.1.12 / MCP SDK override 1.32.0 변경은 유지한다. Sharp 0.35.5 override도 유지한다. Next.js와 DOMPurify의 취약 버전을 강제하던 override를 함께 수정했다.

## 보안 검사 (1차)

- 변경 전 오늘 재검사: Critical **2** / High **7** / Moderate **29** / Low **5**.
- lockfile 갱신 후: Critical **0** / High **3** / Moderate **26** / Low **3**.
- 10월 27일 Moderate 28 / Low 4는 과거 스냅샷이며 오늘 시작 수치와 혼용하지 않는다.
- 잔여 High는 extract-zip 2건과 개발 도구의 Zod 3.25.76 경로다. 앱 직접 Zod 4.x의 수정과 별개다.
- extract-zip의 audit 수정판 응답은 `<0.0.0`(미제공)이다. Puppeteer 24.x 및 shadcn의 Zod 3 계약을 무검증으로 4.x로 강제하지 않았다.
- audit 경로 배열이 빈 경우 전체 의존성 조회로 경로를 확인해야 하며, 빈 배열을 영향 없음으로 해석하지 않는다.
- High를 ignore하거나 검사를 production-only로 바꾸지 않는다. **보안 gate는 미통과이며 운영 배포 승인 조건이 충족되지 않았다.**

## 검증 방식

- 원본: `/mnt/win_d/Users/Documents/monet-registry-main`.
- 임시 Linux 검증 사본: `/tmp/culturepeople-security-20261029-9kAvtt`.
- git 추적 파일 및 ignore되지 않은 작업 파일을 복사했다. 운영 env 파일은 복사하지 않았으며 셸에도 운영 token/secret/DB 인증 환경변수가 없음을 이름/유무만으로 확인했다.
- 두 위치에서 frozen lockfile install을 수행하며 install scripts는 실행하지 않았다. 새 브라우저 다운로드를 하지 않았다.
- 사본의 첫 offline install은 캐시의 follow-redirects tarball 부족으로 실패했다. 이후 frozen online install을 실행해 완료했다. 실패한 실행을 성공으로 계산하지 않는다.
- 전체 단위, 타입 검사, lint 및 빌드는 사본에서 수행하며 운영 인증값을 주입하지 않는다. 이 빌드를 운영 배포용 prebuilt bundle로 사용하지 않는다.
- 브라우저 DOMPurify 검사는 about:blank에서 실행하고 모든 네트워크 요청을 차단했다. 본문 유지, iframe 유지, script 제거, onclick 제거가 모두 통과했다. 이는 특수 취약점 전체 exploit 검증이나 모든 공개 화면 smoke를 대신하지 않는다.
- 새 단위 회귀 `security-validation-regression.test.ts`: 최대 개수를 넘는 배열의 조기 거부, 정책 normalization/default 유지, 과다 subject 입력의 발행 가능 snapshot 반환 방지를 확인한다. 위험한 대량 입력 부하 테스트는 하지 않는다.

실행 명령:

```sh
pnpm install --lockfile-only --ignore-scripts
pnpm install --frozen-lockfile --ignore-scripts
pnpm audit --audit-level high
node scripts/run-vitest-portable.mjs run --config vitest.config.mts --maxWorkers=2 --no-file-parallelism
pnpm ci:typecheck
pnpm lint
pnpm build
git diff --check
```

## 운영 반영 조건 및 재개

보호 파일 token 설정 유무는 `node scripts/deploy-culturepeople-vercel.mjs --check-token`으로 확인했다. 이 명령은 토큰의 서버 인증/권한 검증이나 배포가 아니다.

1. 잔여 개발 toolchain 취약 경로를 호환성 검증과 함께 제거한다. API와 화면 코드를 고치는 대신 버전을 위장하거나 audit를 낮추지 않는다.
2. 최종 소스에서 전체 단위/타입/lint/build 및 보안 검사를 다시 통과시킨다.
3. 승인된 변경만 clean release로 만들고 동일 SHA의 CI, release manifest, rollback 대상과 기존 배포 gate를 확인한다. 사용자가 만든 변경을 버려 clean 상태로 만들지 않는다.
4. 그 후 기존 `pnpm deploy:culturepeople`의 시험 배포 및 검증 절차로 진행한다. 실제 production alias와 배포 ID 확인 전 완료로 표시하지 않는다.
5. 배포 후 정상 게시 기사/정책/RSS/sitemap 표본을 소량 검증한다. 삭제 기사 404, 내부 noindex, auto-news 중지 상태는 보존한다.

Vercel 잔여 quota와 사용량 절감 효과는 이번 의존성 수정만으로 확인할 수 없다. 유료 전환/스케줄 중단/nonce 제거를 하지 않았다. 프로젝트별 Usage와 같은 기간 지표를 확보한 뒤 별도로 판단한다.

## 공식 근거

- https://github.com/vercel/next.js/releases/tag/v15.5.28
- https://github.com/cure53/DOMPurify/releases/tag/3.4.17
- https://github.com/advisories/GHSA-mrhx-c7xc-m3w5
- https://github.com/advisories/GHSA-27r3-jxmh-p828

## 1차 실행 결과 (개발 도구 갱신 전)

| 검증 | 결과 |
| --- | --- |
| frozen lockfile install | 원본/검증 사본 완료, install scripts 미실행 |
| 전체 단위 테스트 | **127개 파일 / 663개 테스트 통과**, 317.10초 |
| DOMPurify 로컬 브라우저 계약 | 본문/iframe 유지, script/onclick 제거 모두 통과 |
| lint | 경고/오류 없음, Next lint 명령 deprecation 안내만 존재 |
| 자동화 스케줄 정적 검사 | 통과, 기존 주기 유지 |
| maintenance admin guard | 통과 |
| 보안 gate | Critical 0 / High 3, 미통과 |
| 토큰 설정 유무 | set, 값 미출력. 서버 인증 유효성은 이번에 검사하지 않음 |
| 전체 타입 검사 | 통과 |
| Sharp 이미지 처리 | 0.35.5 / libvips 8.18.7, 2x2 PNG 생성/재읽기 통과 |
| 최종 production build | **정상 종료 0**, 내부 lint/type 및 152/152 정적 페이지 생성, build trace 완료 |
| 최종 check:audit | 실제 명령 종료 1: 32건 (High 3 / Moderate 26 / Low 3), Critical 0 |
| 최종 원본/사본 SHA-256 | 위 검증 대상 4개 파일 모두 일치 |
| 최종 공백 검사 | `git diff --check` 통과 |
| 운영 배포 / 원격 CI / commit·push | 미실행. 보안 gate 미통과 및 clean release/동일 SHA CI 등 추가 릴리스 검증 필요 |

원본/사본의 검증 대상 hash 일치:

| 파일 | SHA-256 |
| --- | --- |
| package.json | fdf8827a2b359ec389422f4180d1106fb4427fd0e9342dbeb902e64c929eb46d |
| pnpm-lock.yaml | f16f7efc915233ea7db0c808189f9af1aed20b79dbffec29681dccefce4d5f9a |
| scripts/auto-press-stale-recovery.mjs | b0aabcd8945cc51b3a9fc85cd174cdb9facc9c8e9d137b4d7c1b28989b6262cc |
| tests/unit/security-validation-regression.test.ts | 22052a8b5437761e6395e138c614926615ac900c0d3a4e386546a052b88eb074 |

`pnpm why zod`에서 앱 직접 의존성은 4.6.7, puppeteer/chromium-bidi 및 shadcn/MCP SDK/zod-to-json-schema 경로는 3.25.76임을 대조했다. 개발 도구의 메이저 계약을 검증 없이 강제로 바꾸지 않았다.

빌드 중 별도로 실행한 첫 Sharp import는 libvips 로더 경로 누락으로 실패했다. Linux portable Next runner가 실행 중에는 sharp의 내부 링크를 native cache로 교체하고 자식 프로세스에 LD_LIBRARY_PATH를 전달하기 때문이다. runner와 같은 lib 경로를 전달한 PNG 재검사는 통과했다. 이 실패를 취약 버전, 패키지 누락 또는 운영 이미지 장애로 단정하지 않는다.

첫 빌드에서 실제 Google Fonts 요청 재시도가 반복돼 해당 Next 프로세스만 TERM으로 중단했다(exit 143). 자식 worker 종료도 확인했으며 성공으로 계산하지 않는다. 독립 IPv4 Node HTTPS 요청은 200이었다. 이어 Next 자체 fetchCSSFromGoogleFonts/fetchResource 함수로 실제 Geist CSS 1,846자 및 실제 woff2 7,252바이트 다운로드도 통과했다. 이것만으로 원인을 DNS로 확정하지 않는다. font mock, 가짜 바이너리 또는 SSL 검증 비활성화를 사용하지 않았다.

같은 소스에서 Linux 검증 전용 IPv4 우선 설정으로 두 번째 빌드를 실행했다. 최대 900초 및 종료 유예 30초를 두어 무제한 반복하지 않는다. 이 설정은 운영 코드나 환경변수에 저장하지 않았다.

```sh
timeout --signal=TERM --kill-after=30s 900 env NODE_OPTIONS=--dns-result-order=ipv4first nice -n 10 pnpm build
```

위 timeout/nice는 이 Linux 검증 세션만의 자원 제한이다. Windows에서는 검증 전용 PowerShell에서 기존 NODE_OPTIONS를 먼저 보존하고 `--dns-result-order=ipv4first`를 임시 추가해 `pnpm build`를 실행한 뒤 기존 값을 복원한다. 기존 옵션을 무조건 덮어쓰거나 삭제하지 않는다. 애플리케이션의 Node 기반 명령은 변경하지 않았다.

두 번째 빌드는 실제 font 다운로드 재시도가 있었지만 7.2분에 컴파일 성공, 내부 lint/type 성공, 152/152 정적 페이지 생성을 완료했다. 마지막 build traces 수집 중 900초 제한에 도달해 exit 124로 종료했다. **단계 성공을 전체 빌드 통과로 표시하지 않는다.** 종료 후 해당 Next/worker 프로세스가 남지 않았음을 확인했다.

그 뒤 완성된 컴파일/type 캐시를 이용하는 동일 소스의 최종 warm-cache 전체 빌드를 600초 상한으로 한 번 더 실행했다. 검증 항목을 생략하거나 skipTypecheck/ignoreBuildErrors를 설정하지 않았다. 최종 반환 코드와 종료 단계는 위 결과표에 기록한다.

최종 빌드는 컴파일 2.0분, 내부 lint/type 확인, 정적 생성 152/152, build traces 수집과 route 표 출력까지 완료하고 정상 종료 0이었다. build ID는 `wENSElriTs4HlzqvhZCMv`다. 운영 비밀값 없이 만든 검증용 빌드이므로 배포용 Vercel prebuilt bundle로 재사용하지 않는다. 검증용 사본과 캐시는 다음 재검증을 위해 남겼으며 임시 디렉터리이므로 영구 보존을 보장하지 않는다.

빌드 종료 후 별도 LD_LIBRARY_PATH 없이도 Sharp PNG 생성/재읽기를 다시 통과해 portable runner의 내부 링크 복구를 확인했다. 테스트 서버나 이 작업의 빌드 프로세스는 남기지 않았다. 기존 개발자 프로그램·백업 timer·운영 서비스는 중지하지 않았다.

이번 작업의 신규 변경 파일은 package.json, pnpm-lock.yaml, tests/unit/security-validation-regression.test.ts, 이 결과 문서다. 시작 시 이미 있던 scripts/auto-press-stale-recovery.mjs와 docs/culturepeople-mail-alert-remediation-2026-10-23.md 변경은 보존했고 이번 새 구현으로 세지 않는다. **로컬 보안 수정·검증 완료와 전체 보안 과제/운영 반영 완료를 구분한다.**

## 2차 개발 도구 갱신 (같은 날 후속 작업)

위 High 3건은 1차 시점 결과다. 후속 작업에서 Puppeteer를 25.16.0,
shadcn을 4.23.0으로 갱신했다. Zod 3을 무조건 Zod 4로 override하지 않고
도구가 공식 사용하는 의존성으로 전환했다. Puppeteer 25의 ESM 전환과
Node >=22.12 요구 때문에 프로젝트 engines, .nvmrc, CI와 크롤러 workflow,
스크린샷 Docker를 Node 24로 맞췄다. 시스템 전역 Node와 다른 서비스는
바꾸지 않았다. Windows/Linux 개발 방법은 CONTRIBUTING.md에 보완했다.

- 실제 검증 런타임: Node 24.16.0 / pnpm 9.12.2.
- frozen install은 원본/검증 사본 모두 종료 0이었다. `fdir 6.5.0`의
  `picomatch@4.0.4` peer와 실제 설치 4.0.5 사이 경고는 남는다.
  4.0.5 자체를 override한 것은 아니며 기존 override는 4.0.3 → 4.0.4다.
  설치 실패나 audit High로 해석하지 않으며, 경고를 숨기거나 peer 검사를
  우회하는 설정은 추가하지 않았다.
- Puppeteer 기본 인자 생성 및 기존 TypeScript 스크린샷 모듈 import 통과.
- browser-smoke의 구식 `headless: "new"`를 `headless: true`로 변경했다.
- `registry:build:full`도 CLI를 Node로 실행해 noexec 소스 마운트와 Windows를
  함께 지원한다. Docker의 브라우저 다운로드 방지 변수는 현재 지원되는
  `PUPPETEER_SKIP_DOWNLOAD=true`로 교체했다.
- Chrome 156.0.8078.47 한 개를 개발용 캐시에 설치했다. 운영 이미지 수집은 하지 않았다.
- 원본 noexec 마운트의 CLI 직접 실행은 EACCES였다. 이를 보안/패키지 오류로
  해석하지 않고 Node로 실제 JavaScript entrypoint를 실행했다.
- `pnpm audit --json` 재검사: Critical **0** / High **0** / Moderate **13** / Low **1**.
  Moderate/Low를 해결 완료로 표현하지 않는다. 수정판이 없는 deepmerge도 남는다.
- 새 회귀 테스트 `development-runtime-contract.test.ts`는 로컬/CI/Docker Node
  계약과 browser-smoke headless/안전장치 보존을 확인한다.
- 검증 사본에서 shadcn CLI help 및 실제 1,014개 registry build가 통과했다.
- 실제 Chrome 156에서 기존 스크린샷 모듈로 브라우저를 실행해 쿠키 설정/조회와
  375/768/1024/1440px PNG 생성(각 9,217/10,448/11,193/12,449바이트)을 통과했다.
  about:blank의 로컬 HTML만 사용하고 네트워크는 차단했다. 실제 공개 UI의
  전체 브라우저 smoke 또는 Docker 이미지 빌드 검증으로 표현하지 않는다.
- browser-smoke와 같은 우선순위로 찾은 시스템 Chrome 154.0.8037.92도
  Puppeteer 25에서 실행/PNG 생성(7,478바이트)을 통과했다. 같은 격리된
  about:blank에서 DOMPurify 3.4.17의 본문 유지, script/onclick 제거도
  통과했다. 모든 요청을 차단했고 사용자 Chrome 프로필은 사용하지 않았다.
- Node 24에서 Sharp 0.35.5로 2x2 PNG 생성/재읽기 통과. 빌드 runner와 같은
  LD_LIBRARY_PATH를 검증 프로세스에만 전달했다.
- 전체 단위 **128개 파일 / 666개 테스트 통과** (306.13초).
  Docker 변수 보완 후 관련 3개 파일 / 10개 테스트도 추가 통과했다.
- lint 오류/경고 0건. Next lint deprecation 안내는 남는다.
- `check:automation`, `check:maintenance-admin`, `check:planning` 통과.
- `ci:validate` 종료 0: 1,014개 valid / invalid 0. 기존 메타데이터 경고 708건과
  중복 이름 7개는 남으며 이번 보안 수정에서 일괄 변경하지 않았다.
- **실제 `pnpm check:audit` 종료 0**: 14건 (Moderate 13 / Low 1).
  경고를 숨기거나 audit scope/ignore 규칙을 바꾸지 않고 기존 gate를 통과했다.
- 후속 `pnpm why zod extract-zip`에서 앱/Puppeteer/chromium-bidi/shadcn의
  Zod가 모두 4.6.7임을 확인했다. shadcn의 MCP server/core는 2.4.0이며
  extract-zip 의존 경로는 출력되지 않는다. 이는 기존 3건 원인의 제거 근거다.
- 남은 Moderate 경로: @humanfs/node, fflate, ip-address, brace-expansion,
  joi, nodemailer, postcss-selector-parser. 별도 호환성/영향 검토 후 고칠
  후속 과제로 남긴다. 특히 기존 override가 일부 하위 버전을 고정하므로
  단순 `update`만으로 모두 해소된다고 가정하지 않는다.
- 후속 `pnpm ci:typecheck` 종료 0. 첫 Node 24 production build는 컴파일
  4.4분, 내부 lint/type, 152/152 정적 생성을 통과했다. 그러나 서버 trace
  수집 중 900초 상한에 도달해 **exit 124**였다. 전체 빌드 성공으로 세지 않는다.
  동일 소스/캐시의 600초 재빌드도 컴파일 2.7분 후 내부 타입 검증 중
  **exit 124**였다. 둘 다 전체 성공으로 세지 않는다. 두 실행의 프로세스
  그룹이 남지 않은 것을 확인한 뒤 최종 전체 검증 상한을 1,800초로 늘렸다.
  타입/보안 검증을 비활성화하거나 캐시 결과를 production 배포 증명으로 쓰지 않는다.
- **최종 1,800초 상한 실행은 실제 종료 0**이었다. 컴파일 3.2분, 내부
  lint/type, 152/152 정적 페이지 생성, 서버 build trace와 route 표 출력까지
  완료했다. build ID는 `AEQXAKTIB1XD8oiiYZlh8`이며 required-server-files도 존재한다.
- 빌드 후 원본 저장소에서 `pnpm check:audit`를 다시 실행해 종료 0,
  Moderate 13 / Low 1 / High 0 / Critical 0을 재확인했다.
- 마지막 Sharp 단독 검사에서는 임시 사본 링크가 native cache를 계속
  가리켜 libvips 로딩이 한 번 실패했다. 원본 저장소의 pnpm 링크는 정상이다.
  임시 사본의 `pnpm install --frozen-lockfile --ignore-scripts`로 링크를
  복구한 후 별도 LD_LIBRARY_PATH 없이 2x2 PNG 생성/재읽기 종료 0을 확인했다.
  설치 버전/lockfile/앱 소스를 바꾸는 우회는 하지 않았다. 향후 Next/Vitest
  portable runner는 같은 작업 사본에서 병렬 실행하지 않고, 중단 후에는
  frozen install과 Sharp 확인을 수행한다. 공통 native-link lock 강화는
  기존 개발 도구의 별도 후속 과제로 남긴다.
- 복구 후 portable Next `--version`과 portable Vitest `--version`을 순차
  실행해 각각 15.5.28 / 4.1.12 및 Node 24.16.0을 확인했다. 이어 별도
  LD_LIBRARY_PATH 없이 Sharp PNG 재검사도 통과해 정상 순차 실행의 링크
  원복을 확인했다. 마지막 원본/사본 10개 소스 hash 대조도 불일치 0건이다.
- 실제 검증 사본과 원본의 아래 10개 파일 SHA-256 일치를 확인했다:
  package.json, pnpm-lock.yaml, .nvmrc, CI/크롤러 workflow 2개,
  CONTRIBUTING.md, Dockerfile, browser-smoke, 신규/기존 보안 회귀 테스트 2개.
  최종 package.json hash는 `b50687f4d43c0f45c331a7aacb28244d73eb76110a03d968eb9f498e3afbb853`,
  lockfile hash는 `ce005ae1d965e68e188aaa41090f4d67702a2c76d522f5bb3755b5d3f8ff99f2`다.

재현 명령 (저장소에서 Node 24 선택 후):

```sh
pnpm install --frozen-lockfile --ignore-scripts
pnpm check:audit
pnpm test:unit -- --maxWorkers=2 --no-file-parallelism
pnpm ci:typecheck
pnpm lint
pnpm check:automation
pnpm check:maintenance-admin
pnpm check:planning
pnpm ci:validate
pnpm registry:generate
node node_modules/shadcn/dist/index.js build registry.json --output /tmp/culturepeople-shadcn-security-20261029
pnpm build
```

  위 `/tmp` 출력은 Linux 검증 전용이며 Windows에서는 임시 출력 경로를
해당 OS 경로로 바꾼다. npm 설치 hooks는 검증 중 실행하지 않았으며 브라우저
설치는 위에서 명시한 실제 Puppeteer CLI로 Chrome 한 개만 수행했다.

별도 기존 과제: `screenshot:server`는 현재 없는 `screenshot-server` 폴더를
가리킨다. Docker 진입점은 그 경로가 아니라 공통 `screenshot:capture`를
사용한다. 이번 검증은 공통 브라우저 모듈에 한정하며, 오래된 서버 스크립트의
복구나 삭제, Docker 이미지 실행 및 Windows 실기 검증은 하지 않았다.

Node 전환 롤백은 package.json만 또는 Node만 따로 되돌리는 방식이 아니다.
Puppeteer 25 / lockfile / Node engines / CI / Docker의 조합을 함께 보존한다.
운영 문제 시에는 기존 정상 Vercel immutable deployment로 되돌리고,
소스 롤백은 해당 전체 릴리스 단위로 검증한다. 이번 작업에서는 production
배포를 실행하지 않아 운영 롤백도 실행하지 않았다.

2차 변경 파일: package.json, pnpm-lock.yaml, .nvmrc,
.github/workflows/ci.yml, .github/workflows/crawl-newswire.yml,
docker/screenshot/Dockerfile, scripts/browser-smoke.mjs, CONTRIBUTING.md,
tests/unit/development-runtime-contract.test.ts, 이 결과 문서.
기존 stale-recovery/메일 문서/1차 보안 회귀 테스트는 보존했다.

현재 HEAD는 `64de8cd1547a807c9db67cf87bb4d998f9e59c5f`이며 이번 수정은
작업 사본에 남아 있다. 보안 gate 해소와 운영 배포 완료를 혼동하지 않는다.
다음 릴리스는 이 보안 변경만 추적 가능한 커밋으로 분리하고, 동일 SHA 원격
CI와 clean release/기존 gate 증빙을 확보한 뒤 기존 배포 절차로 진행한다.
토큰 부족 또는 원격 CI 실패를 이번에 확인한 것처럼 표현하지 않는다.

공식 호환성 근거:
- https://pptr.dev/guides/system-requirements
- https://pptr.dev/CHANGELOG
- https://ui.shadcn.com/docs/changelog
- https://vercel.com/docs/functions/runtimes/node-js/node-js-versions
