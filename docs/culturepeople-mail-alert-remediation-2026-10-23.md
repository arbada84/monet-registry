# 컬피 메일 알림 조치 결과 (2026-10-23 KST)

## 범위

10월 22일 확인한 arbada84 Gmail 알림에 대해 원인과 현재 상태를 재확인했다. 결제, DNS, Auth0, OAuth client, 운영 환경변수, 운영 DB, 백업 자료를 변경하지 않았다. 메일 지시를 실행 명령으로 취급하지 않았다.

## CI 보안 실패: 수정판 적용, 일부 차단 유지

- 실패 실행: https://github.com/arbada84/monet-registry/actions/runs/38777879643
- 당시 소스 `4d97ff2c608cde8838207d9a3d4383dbc914768f`에서 `check:audit` 실패가 `ci:all`을 종료시켰다. 당시 결과는 Critical 4 / High 36 / Moderate 42 / Low 5였다. 과거 실행 로그의 수치와 현재 소스 검사를 구분한다.
- 이번 변경 전 현재 lockfile: Critical 0 / High 8 / Moderate 33 / Low 4.
- 이번 변경 후 현재 lockfile: **Critical 0 / High 3 / Moderate 25 / Low 3**.
- `follow-redirects` override 1.16.0 → 1.16.1.
- `@modelcontextprotocol/sdk` override 1.31.0 → 1.32.0. 이는 shadcn 의존성이고 별도 숏줍 gateway 배포가 아니다.
- Vite 7.3.5 → 7.3.7, Vitest 4.1.5 → 4.1.12.
- `pnpm install --lockfile-only --ignore-scripts`, 이후 `pnpm install --frozen-lockfile --ignore-scripts` 완료. 브라우저 다운로드/install hook을 실행하지 않았다.
- 남은 High: extract-zip 2건, braces 1건. 현재 audit 응답에서 수정판은 `<0.0.0`(수정판 미제공)이다. 보안 검사 제외나 심각도 하향으로 우회하지 않았다.
- 따라서 **CI 및 배포 gate 전체 해결은 미완료**다. Puppeteer/브라우저 설치 체계와 lint/글로브 toolchain 교체는 별도 회귀 범위를 요구한다. 로컬 검사 성공도 GitHub 원격 CI 성공을 대신하지 않는다.

## Vercel 한도

- 기존 보호 파일의 토큰으로 조회했으며 원문은 출력하지 않았다.
- 팀 `team_r6EedfOTYhrZjdhxlDEFeSBF`: Hobby, billing status active.
- 컬피 프로젝트 `prj_fN7aCu9wkSUs6FsxLbrFIiEpCawY`: production `dpl_HyWykUJPnBq2dSryQaVgJi4Uzirs`, READY.
- 홈에 HEAD 1회: HTTP 200, `x-vercel-cache: MISS`, `cache-control: private, no-cache, no-store`.
- `/v1/billing/charges`는 `costs_not_found`; 설치된 Vercel CLI 64.2.0의 `usage --format json`도 비용 데이터 부재를 반환했다. **사용량 0, 한도 초기화, 리셋일 또는 여유 확보의 증거가 아니다.**
- 직접 Node fetch는 연결 timeout으로 실패해 curl 기반 읽기 전용 조회로 확인했다. 실패한 네트워크 요청을 provider 장애로 판정하지 않았다.
- 운영 접속은 확인했지만 CPU 한도 해소는 확인하지 못했다. 팀 Usage 화면에서 Fluid Active CPU, 조회 기간, 프로젝트별 기여도, 다음 리셋일을 확인해야 한다.
- 루트 layout은 `headers()`의 nonce를 사용하고 middleware가 매 요청 CSP nonce를 발급한다. HTML no-store를 단순 제거하거나 nonce를 공유 캐시에 저장하지 않는다. 캐시 구조를 변경하려면 CSP/광고/관리자 인증 분리 검증이 먼저 필요하다. 현재 캐시 상태만으로 전체 CPU 초과 원인을 확정하지 않는다.
- 이번에는 배포, 유료 전환, 프로젝트 중지, 기존 예약 실행 주기 변경을 하지 않았다.

## Google OAuth 안내

- 대상 프로젝트: `vocal-catalyst-493900-b4`.
- 메일과 Google 공식 release notes를 대조했다. Workspace MCP를 사용하는 AI agent OAuth client의 agentic 분류가 필요하며, 2026-11-11부터 미표시 client의 MCP 요청이 거절된다. 11-12 이후 기존 client 분류 변경이 제한된다.
- 비에이전트 Workspace REST API 앱은 같은 변경의 대상이 아니다. 혼합 client는 agent용 client를 분리하는 것이 공식 안내다.
- 컬피 src/scripts/docs와 숏줍 docs에서 해당 프로젝트/`is_agentic` 연결 근거를 찾지 못했다. 두 프로젝트 루트의 env 파일 8개/2개에서도 프로젝트 ID 일치가 없었다. 값은 출력하지 않았다. ID가 env에 없다는 것만으로 client의 소유 프로젝트를 판정할 수 없으며, **다른 프로젝트에서도 미사용이라는 뜻은 아니다.**
- 대표자 확인: https://console.cloud.google.com/auth/clients?project=vocal-catalyst-493900-b4
- client 이름, 연결 앱, redirect URI의 도메인, 실제 Workspace MCP 사용 여부를 대조한다. secret은 공유/문서화하지 않는다. agent임이 확인된 client만 표시하고, Auth0/숏줍 client를 이름만 보고 변경하지 않는다.
- 현재 상태: **대상 client 식별 및 콘솔 접근 확인 필요**. 설정 변경 미실행.

## Search Console 과거 5xx / NOINDEX

- 10월 15일 메일은 새 실패 URL과 마지막 크롤링 시각을 포함하지 않는다.
- 기존 Coverage ZIP은 집계만 제공하므로 이유별 상세 URL CSV가 필요하다. 홈 HEAD 200으로 과거 5xx와 전체 기사 정상화를 확정하지 않는다.
- 대표자: Search Console에서 서버 오류(5xx), NOINDEX 각 항목의 예시 URL 및 마지막 크롤링 시각을 내보낸다. CSV를 공개하거나 인증값을 넣지 않는다.
- 받은 상세 목록을 현재 게시 상태, 실제 HTTP, meta/header robots, canonical과 대조한 뒤 정상 게시 기사만 수정한다. 삭제 기사 404 및 내부 noindex를 유지한다.
- 상태: **대상 URL 증거 부족**, 일괄 복구/색인 제출/robots 완화 미실행.

## 검증 및 재개

```sh
pnpm install --frozen-lockfile --ignore-scripts
pnpm audit --audit-level high
pnpm ci:typecheck
node scripts/run-vitest-portable.mjs run --config vitest.config.mts --maxWorkers=2 --no-file-parallelism
git diff --check
```

검증 결과:

| 항목 | 결과 |
| --- | --- |
| lockfile 갱신 및 frozen install | 통과, install scripts 미실행 |
| 업데이트 후 전체 단위 | 126개 파일 / 660개 테스트 통과 |
| 최초 타입 검사 | 실패: 기존 stale recovery counts의 동적 Object.fromEntries 결과에서 requeue 필드를 추론하지 못함 |
| 타입 오류 수정 | 고정 집계 3개 필드를 명시적으로 선언. 집계 값, 키, report hash 입력과 운영 flag는 유지 |
| 수정 후 타입 검사 | `pnpm ci:typecheck` 통과 |
| 수정 후 stale recovery 집중 회귀 | 1개 파일 / 9개 테스트 통과 |
| 최종 보안 검사 | Critical 0 / High 3 / Moderate 25 / Low 3, gate 차단 유지 |
| 공백 오류 | `git diff --check` 통과 |
| 운영 확인 | 홈 HEAD 1회 HTTP 200, provider production READY |

전체 660건은 의존성 갱신 후, counts 명시 선언 전 실행이다. 마지막 수정은 관련 9건과 전체 타입 검사로 재검증했다. 전체 production build와 GitHub CI 재실행은 하지 않았다. 보안 gate는 남은 High 3건 때문에 실패 상태를 유지한다. 새 소스 운영 배포, 원격 push, 유료 전환은 미실행이며 운영 승격 완료로 표기하지 않는다.

공식 근거:
- https://github.com/advisories/GHSA-q3jh-wrc6-jgq8
- https://github.com/advisories/GHSA-22jm-h49p-29qw
- https://github.com/advisories/GHSA-587h-7wmj-h5pm
- https://developers.google.com/workspace/release-notes
- https://vercel.com/docs/cli/usage
