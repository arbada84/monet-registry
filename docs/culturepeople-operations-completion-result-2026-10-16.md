# 컬처피플 누적 미완료 작업 실행 결과

- 실행일: 2026-10-16 KST
- 범위: `culturepeople-unfinished-work-and-git-ledger.md` CP-OPEN-001~028 재조사 및 가능한 안전 조치. CP-OPEN-029는 이번에 발견한 신규 보안 문제다.
- 결론: **전체 완료 아님.** 소스 보존, 세 가지 코드 보완, 의존성 보안 업데이트, Worker 배포, 가용 백업의 복원과 암호화 복원은 완료했다. 원본 접근·권리·실제 외부 UI·미개발 파이프라인·보안 gate는 별도 잔여 항목이다.
- 금지 작업 유지: 기사 대량 삭제/복구, 카테고리 대량 변경, 이미지 대량 다운로드, production URL rewrite, auto-news/뉴스레터 재활성화, 가짜 TikTok 성공, gateway 작성자 권한 우회 없음.

## 1. 소스 통합과 원격 보존

실제 작업 위치는 `/mnt/win_d/Users/Documents/monet-registry-main`이다. native 테스트/운영 소스는 `/home/arbada/culturepeople-d1-hotfix-20261004`다.

native origin이 실제로는 로컬 main 폴더를 가리키고 있었다. 따라서 기존 `origin`과의 ahead/behind를 GitHub 보존 증거로 쓰지 않고 실제 GitHub URL에 push했다.

| 보존 대상 | GitHub branch / source |
| --- | --- |
| 기존 운영 소스와 원격 반영 누락 8커밋 | `codex/culturepeople-production-preserved-20261016`, `75c74f093efe48c05bc40e5277a4a903af4d334e` |
| native 신규 수정 | `codex/culturepeople-ops-completion-20261016`, `8dd7406` |
| main 정리·문서·동일 수정 | `codex/culturepeople-workspace-reconciled-20261016`; 아래 커밋과 후속 문서 커밋으로 추적 |

대조 시점의 변경145파일은 126개 완전 동일, 12개 개행만 다름, 5개 없는 문서, 2개 다른 문서였다. 실제 다른7개는 모두 문서였다. 비문서135개는 배포 소스와 동일함을 확인한 뒤 `1ddb93d`에 보존했다. 기존 바이트·개행을 임의 정규화하지 않았다. 이 때문에 스냅샷의 일부 기존 공백 경고는 보존했으며 이를 새 수정의 diff 검사 통과로 포장하지 않는다.

| native commit | main 대응 commit | 변경 |
| --- | --- | --- |
| `0b6d440` | `d636b90` | Telegram PV/방문 식별값 혼동 제거 |
| `4d97ff2` | `fb8f088` | 실제 파일시스템 기준 백업 권한 신뢰 판단 |
| `dfc7314` | `ffa50f0` | 실제 게시 기사 없는 stale 참조 자동 회수 금지 |
| `8dd7406` | `421b140` | 호환 가능한 보안 의존성 업데이트·native sharp 계약 검증 |

소스 범위 `src cloudflare scripts tests package.json pnpm-lock.yaml next.config.ts vercel.json public`를 `git diff --ignore-cr-at-eol`로 대조해 차이 없음을 확인했다. 실제 main/default branch merge는 하지 않았고, 별도 보존 브랜치를 원격에 남기는 방식이다. public GitHub 저장소에는 토큰·평문 설정·원문 백업·대본을 올리지 않는다.

## 2. 구현과 운영 반영

### 방문 통계

- Next와 Worker 모두 방문 식별값이 없을 때 PV를 방문자 수로 대체하지 않는다.
- `기사 방문 식별값(추정)`과 `비봇 분류 기사 조회 로그(PV)`로 명칭을 분리했다.
- 누락/불일치 시 `집계 불가 (식별값 누락)`을 표시한다. 실제 사람 수나 전체 사이트 UV라고 주장하지 않는다.
- Worker는 운영 반영 완료. Next는 후보 검증까지만 완료했고 production 승격은 아래 보안 gate로 보류했다.

### stale queue 안전장치

`article_id/no/published_at` 참조만 남아 있다고 게시 완료로 판단하지 않는다. 실제 연결 기사가 `게시` 상태여야 reconcile 대상이다. 없는/삭제/임시저장 기사 참조는 보류한다. 확인된 기사 id/no로 갱신하며 오래된 잘못된 참조를 COALESCE로 남기지 않는다.

라이브 시작 시 running351건 모두 lease 만료였다. 백업 기반 dry-run은 reconcile1/requeue350이었다. 검증된 게시 기사1건만 report checksum·현재 상태 재검증·CAS·최대1건 제한으로 reconcile했다. 신규 기사 발행·AI 호출·대량 재큐잉은 없었다. 남은350건의 대량 재시도는 미실행이며 24시간 관찰 조건을 유지한다. 실제 최신 잔여 건수는 다음 읽기 전용 점검으로 다시 확인해야 한다.

### Worker 배포

- 최종 version: `2ae251ab-28f0-45fe-aca9-a8db81314d15`.
- 기존 방문 통계 수정 version: `0214bbc5-980c-45da-8794-9f5230239ee7`.
- 기존 번들 소스 대조 후 배포, `--keep-vars` 사용. 배포 후 bindings와 schedules를 기존 값과 deep-compare해 동일함을 확인했다.
- `/health` 200, published policy v2/generation0/dynamic=true 확인.
- `AUTO_PRESS_STALE_LEASE_RECOVERY_ENABLED=false`, 24시간 관찰, AI50/게시30/이미지50 일일 한도 유지.
- schedules는 `*/10 * * * *`, `0 0 * * *` 그대로다. 1분 cron 신설 없음.

정책 D1 검증: subjects34/rules216. checksum `9c0d98dd4f19b2729410682231504dafcb126f92eeb7845aa096a2228a4941e6`. 실제 runtime observation의 Next-main·Worker-scheduled·Worker-queue 모두 같은 v2/checksum/source=d1을 사용했다. 오래된 7월의 feature-off 상태는 현재 상태가 아니다.

Cloudflare 기존 analytics schema로 소량 조회한 최근24시간(UTC 10/14 18:05~10/15 18:05) Worker 지표는 requests479/errors0, clientDisconnected3이었다. 해당 구간에 exceededResources는 없었다. 이는 배포 후24시간 관찰을 완료했다는 뜻이 아니며, 과거 오류의 단계별 원인이나 미래 무장애를 증명하지 않는다. 증거는 `worker-last24h.json`에 보존했다.

D1 계정 전체 read baseline도 확보했다. UTC10/14 전체 rowsRead618,550/readQueries8,659, 10/15 18:06까지 rowsRead597,305/readQueries9,185다. 일부 일자와 전체 일자를 비교해 절감률을 계산하지 않았고, 컬피 단일 DB·동일 방문량 기준 수치라고 주장하지 않는다. 증거는 `d1-daily-baseline.json`이다. Vercel CPU/실제 요금의 동일 기간 비교는 여전히 미완료다.

## 3. 백업 실제 검증

| 항목 | 이번 실측 |
| --- | --- |
| 최신 snapshot | `2026-10-14T19-00-10-529Z` |
| 통합 기사 / raw rows | 4,659 / 46,357 |
| D1 / Supabase raw rows | 43,262 / 3,095 |
| Supabase 원본 | `project_unreachable_or_paused`, local_fallback 약149.3일 |
| 이미지 URL 확보 / 전체 | 4,034 / 8,059, 미확보4,025 |
| media store | 3,516개 실제 파일 (URL 수와 다름) |
| primary / secondary | 각각 restore-check 통과, SQLite integrity ok, 이미지 표본50/50 |
| 2차 복제 | 다른 물리 디스크, 같은 snapshot/lag0; 동일 컴퓨터이므로 offsite 아님 |
| primary 공간 | 약153GB 여유/91.8% 사용; 여전히 danger |
| retention | 125개 보호/삭제 후보0/확보 예상0bytes; 삭제 미실행 |

백업·이미지·건강 알림·주간 restore timer는 active 상태를 확인했다. status/ops audit의 ok는 Supabase 최신성 해결을 의미하지 않는다. IndexNow candidates/authFailed는 0/0이었다. 올바른 `.env.local`을 명시해도 Supabase 네트워크 probe가 실패했다. native checkout에 env가 없는 최초 실행의 missing_env를 서비스 장애 원인으로 쓰지 않는다.

### 민감 데이터 보호

1. FUSE/NTFS의600권한을 실제 POSIX 보호로 오판하지 않도록 감사 스크립트를 수정했다. primary FS type `0x65735546`은 신뢰하지 않고, secondary ext4 `0xef53`은 지원 대상으로 처리한다.
2. 기존 암호화 키를 사용해 최신 snapshot·필요한 media store·manifest 등3,574파일을 AES-256으로 암호화했다. 새 키 생성·원문 출력 없음.
3. 실제 복호화·아카이브 hash·복원 SQLite integrity까지 통과했다.

암호화 사본:
`/home/arbada/culturepeople-backups-encrypted/culturepeople-secure-2026-10-14T19-00-10-529Z-2026-10-15T17-30-58-151Z.tar.gpg`

- archive bytes: 509,063,435.
- SHA256: `4fada7b4061ac8a83aac67d00811f10f597e8bbb3490f08ce117471ddb63aba7`.
- 실제 restore report: `secure-restore.json`, `ok=true`, `archiveSha256Verified=true`.
- 기존 평문 자료를 삭제하지 않았다. 자동 암호화 rotation, 키의 외부 안전 보관, NTFS/Windows 접근 통제는 별도 미완료다. 필요한 유일한 fallback을 보안 정리라는 이유로 지우면 안 된다.

## 4. 보안 gate와 메인 배포

새로 GitHub CI를 실행한 결과 run `38777879643`은 `check:audit`에서 실패했다. 과거 성공 이력이나 단위 테스트 성공으로 이 실패를 덮지 않았다.

| 보안 audit | 업데이트 전 | 업데이트 후 |
| --- | --- | --- |
| Critical | 4 | 0 |
| High | 36 | 6 |
| Moderate | 42 | 31 |
| Low | 5 | 3 |

Next15.5.24, sharp0.35.5/native libvips1.3.4, axios1.20.0, js-yaml4.3.2, mysql2/tiptap 및 필요한 전이 의존성을 호환 범위에서 업데이트했다. Next15/Node20 및 Windows 선택 패키지 지원을 유지했다. 실제 sharp PNG 입출력도 통과했다.

잔여 High6은 extract-zip2/braces1/nodemailer2/basic-ftp1건이다. 이 중 미패치 upstream advisory가 있고 일부는 major 업그레이드 호환성 확인이 필요하다. 이는 현재 침해 발생 증거가 아니라 audit에서 검출된 의존성 위험이다. 예외 무시·audit 비활성화·production-only 검사로 gate를 우회하지 않았다. 따라서 CI 전체 통과 및 신규 Next 운영 반영은 **미완료**다.

- 유지한 main production: `dpl_HyWykUJPnBq2dSryQaVgJi4Uzirs`, alias `https://culturepeople.co.kr`.
- 시험 candidate: `dpl_DtSv1XXAC5jWG4ovW2dsPcuYtivT`, READY.
- candidate URL: `https://monet-registry-main-rlix1iie0-arbadas-projects-fdc12d41.vercel.app`.
- candidate source는 보안 수정 전 `0b6d440`이다. 원격 production 빌드와 health/home/기사4363/search/contact/RSS 표본은 통과했지만 **승격하지 않았다**. 보안 수정 후 새 고정 SHA로 다시 생성해야 한다.
- 이전 실패 후보 `dpl_7zLxBkW1QrXawnBQz3g5Dprs4RTa`만 비운영·소유권 확인 후 삭제, 재조회404 확인. 현재 운영과 rollback 대상은 제거하지 않았다.

게이트웨이 `ed90c7d` B단계는 별개다. Vercel `TEAM_ACCESS_REQUIRED/isVerified=false`는 토큰 없음과 다른 문제다. 정식 계정/GitHub 연결을 해결하기 전 재배포·작성자 metadata 위장·backend SHA 대체를 하지 않는다.

## 5. 실행한 검증

native 테스트는 수정 후 의존성 frozen install 상태에서 수행했다.

| 명령 / 검사 | 결과 |
| --- | --- |
| `pnpm test:unit` | 최종117파일/592테스트 통과 |
| `pnpm ci:typecheck` | 통과 |
| `pnpm lint` | 통과 |
| `pnpm build` | 보안 의존성 업데이트 후 통과; 빌드 중 네트워크 retry 경고는 있었으나 exit0 |
| main `pnpm ci:typecheck`, `pnpm test:unit`, `pnpm build` | 의존성 구조 복구 후 각각 통과; 단위117파일/592테스트, 전체152페이지 생성 완료 |
| `pnpm check:local-backup` | 통과 |
| `pnpm check:auto-press-agent-loop` | 13개 검증 항목 통과 |
| `pnpm check:automation`, `check:maintenance-admin`, `check:planning` | 각각 통과 |
| `pnpm ci:validate` | 1,014개 유효/Invalid0, 기존 warning708·중복 이름7건은 남음 |
| primary/secondary `backup:local:restore-check` | 각각 통과; Supabase stale 경고 유지 |
| `backup:secure-copy` dry-run/apply 및 `backup:secure:restore-check` | 실제 암호화 생성/복호화 복원 통과 |
| `backup:local:status`, `ops:audit` | 생성/정합성 검사 통과; stale/disk/image 경고 미해결 |
| `supabase:recovery-check -- --require-storage` | blocked: project_unreachable_or_paused |
| `cloudflare:r2:media-readiness` | 리포트 생성, rewrite 허용false |
| `category:audit`, 정규화 dry-run | 후보356, 실제 DB 미적용 |
| `ops:env-drift-check` | 값 비노출 검사; 중복 키25건 경고, 자동 env 덮어쓰기 없음 |
| 정책 sync-check와 runtime observation | published/applied v2 일치 |
| Worker source·settings·schedule 검증 및 배포 | 통과, health200 |
| GitHub CI / dependency audit | 실패 유지, 새 production 승격 blocked |
| 인증 관리자/3테마 전체 브라우저 smoke | NOT_RUN |
| Claude/ChatGPT 실제 웹 앱 / TikTok sandbox | NOT_RUN |

주요 실행 명령은 현재 package.json의 기존 명령이다. 민감 원문 없는 운영 증거는 `/home/arbada/.local/state/culturepeople-ops-completion-20261016` 아래에 저장했다. 이 디렉터리는700, 파일600이며 원본 설정/번들/운영 row가 포함될 수 있어 Git에 넣지 않는다.

main은 기존 external virtual-store로 frozen install 후 592테스트가 통과했으나 타입 검사에서 Next/React 타입 모듈 탐색 실패가 발생했다. native 릴리스의 같은 소스·의존성은 통과했으며 외부 virtual-store의 직접 의존성 타입 탐색 경로가 원인이었다. 기존 `node_modules`는 `/home/arbada/.cache/culturepeople-pnpm/main-node-modules-before-20261016`에 보존하고 표준 `node_modules/.pnpm` 구조로 frozen install했다. 재설치 후 단위117파일/592테스트와 `pnpm ci:typecheck`가 각각 통과했다. 타입 검사 완화·전체 줄바꿈 정규화·기존 의존성 무단 삭제는 하지 않았다. native 검증과 main 검증 결과는 같은 것으로 합산하지 않는다.

이 드라이브는 NTFS/FUSE `noexec` 마운트다. 따라서 plain Node에서 sharp를 직접 로딩하면 libvips 탐색/실행 mapping 오류가 난다. 기존 `run-next-portable.mjs`는 native package를 Linux 임시 경로로 복사하고 자식 프로세스의 LD_LIBRARY_PATH를 지정한다. 그 실제 준비 상태에서 main sharp0.35.5의 8×8 PNG 생성/재읽기를 통과했다. 전역 LD_LIBRARY_PATH나 mount의 noexec 옵션은 변경하지 않았다. 개발/빌드는 기존 `pnpm dev`/`pnpm build` 진입점을 사용한다.

## 6. 남은 작업과 재개 순서

전체 ID별 최신 상태는 [누적 대장 0장](./culturepeople-unfinished-work-and-git-ledger.md)에 유지한다.

1. **보안 잔여 의존성 해결**: upstream 미패치 대응/대체 도구 및 major 호환성을 실제 테스트한다. `pnpm audit --audit-level=high`, 단위·타입·lint·build, GitHub CI가 모두 통과한 고정 SHA로 새 candidate 생성 후 별도 승격한다. 기존 candidate는 재사용하지 않는다.
2. **24시간 stale 관찰과 원인 확인**: reconcile1건의 중복 발행/카운터 확인. 남은350건을 한 번에 재큐잉하지 않는다. provider·큐 비용과 실행 상태 확인 후 기존 최대10건 bounded apply 규약을 지킨다.
3. **대표자 Supabase 콘솔 조치**: project 존재/ref/env/bucket, Resume·다운로드 가능 여부 확인. 복구 후에만 `pnpm supabase:recovery-check -- --require-storage` → `pnpm ops:supabase-recovered-backup -- --root "$HOME/culturepeople-backups"`를 기존 dry-run/apply 규약에 맞춰 실행한다. 검사 전 fresh export/대량 백필 금지.
4. **백업 지속 보안**: 암호화 자동화·외부 key escrow·offsite 저장소를 확정한다. 기존 plaintext 삭제는 복원 검증 및 유일 데이터 보존 후 별도 계획한다. 현재 retention 후보0이므로 임의 삭제로 디스크 위험을 숨기지 않는다.
5. **외부 확인**: Search Console 실제 영향 URL export/라이브 검사, 승인 법적 정보, gateway Vercel 계정 연결, Claude/ChatGPT 실제 UI를 확인한다. 권한/계정/권리 없이 성공 처리하지 않는다.
6. **아직 개발하지 않은 것**: 클라우드 주 실행·로컬 보조(CP-OPEN-021), MCP 호스팅 이전(026), 실제 TikTok 연동(018), 실제 권리 기반 기사 pilot(017)은 완료가 아니다. 기존 운영 owner·권리·제품 범위를 확정한 별도 구현/검증이 필요하다.

## 7. 롤백과 미실행 경계

- Worker: 최초 배포 전 번들과 설정·스케줄을 private 증거 경로에 보존했다. 롤백 시 Cloudflare version의 실제 source/설정을 확인하고 직전 version으로만 복귀한다. 자동 stale recovery는 꺼둔다.
- Next: main production을 변경하지 않았으므로 이번 후보에 대한 운영 롤백은 필요하지 않다. 다음 승격 전 현재 alias와 정상 deployment를 다시 확보한다.
- 소스: 별도 브랜치로 보존했으며 기존 release/main을 reset하거나 강제 push하지 않았다. 다른 작업자의 숏줍 변경을 stage/commit하지 않았다.
- 데이터: 게시 확인된1건 상태 정합성 처리 외 기사·정책·카테고리 대량 쓰기 없음. 삭제 기사와 내부 noindex 유지. R2 rewrite 없음.
- 알림: Telegram 코드 수정과 실사용자가 새 일간 보고를 수신한 증거는 별개다. 실제 수신·표시 확인은 다음 정상 보고 후 필요하다.

## 8. 문서 보존 범위

기존 미커밋 계획/결과 문서11개(이번 실행 결과 포함)와 기존 계획4개의 최신 상태 연결을 별도 문서 커밋으로 보존한다. credential-like 패턴 검사와 상대 문서 링크 검사를 수행해 발견0건이었다. 기존 기록은 지우지 않고 최신 상태로 supersede한다. 최종 커밋 SHA는 `git log -1` 및 실제 GitHub 브랜치 ref로 확인하며, 이 문서에 자기 자신의 해시를 하드코딩하지 않는다.
