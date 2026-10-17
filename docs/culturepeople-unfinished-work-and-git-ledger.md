# 컬처피플 미완료 작업·미커밋 변경 누적 대장

- 기준일: 2026-10-16 KST (최초 조사: 2026-10-15)
- 성격: 잔여 개발, 운영 검증, 외부 blocked, 미커밋·미푸시 소스의 누적 관리 문서
- 최신 실행: 코드 수정·테스트·Git 원격 보존·Worker 배포·암호화 백업 복원을 수행했다. 아래 최초 조사 수치와 목록은 이력이며 현재 잔여 수가 아니다.
- 기준 저장소: `/mnt/win_d/Users/Documents/monet-registry-main`
- 주의: 아래 Git 목록은 이 대장 생성 직전 스냅샷이다. 이 대장 자체는 새 untracked 파일로 별도 추가된다. 다른 작업자의 후속 변경까지 고정하는 목록은 아니다.

> **현재 판단은 [2026-10-16 실행 결과](./culturepeople-operations-completion-result-2026-10-16.md)를 우선한다.** 최초 미커밋 목록을 운영 소스와 대조·보존했고, 새 수정은 별도 추적 브랜치에 반영했다. 전체 과제가 완료된 것은 아니다. Supabase, 미확보 이미지, CI 보안 gate, 실제 외부 앱 검증 및 아직 개발하지 않은 기능은 아래 최신 상태표로 구분한다.

## 0-A. 2026-10-18 후속 실행 (아래 이력보다 우선)

[잔여 작업 실행 결과](./culturepeople-remaining-work-result-2026-10-18.md)를 현재 상태로 읽는다.

- 사용자 제외: 디스크 정리, Supabase 복구, MCP 배포. MCP는 조회만 수행했고 운영 소스는 여전히 `6e522ad`/READY다.
- CP-OPEN-029: Nodemailer/FTP 보안 수정 후 High 6→3, Moderate 31→26. 미패치 extract-zip/braces 때문에 gate 실패와 운영 승격 보류를 유지한다.
- CP-OPEN-022/023: 세 테마 서버 카테고리 페이지네이션·canonical·bounded adapter 구현, 관리자 smoke 실제 쓰기 차단 및 4 viewport 보강. 전체126파일/660테스트와 type/lint/build 통과. 알리닷 UI 4 viewport/8단계 실제 브라우저 확인 및 모바일 계정 설명 폭 수정. 전체9화면/운영 실데이터 검증·배포와 구분한다.
- CP-OPEN-013: 로컬/Worker stale recovery가 soft-deleted 기사를 게시 증거로 쓰지 않도록 보강. 라이브 apply와 자동 회수 활성화는 미실행.
- CP-OPEN-031 신규: ops audit이 6월의 stale 보고서를 현재 정상으로 해석하던 오류 수정. 누락 count는 unknown, 오래된/불완전 증거는 정상 판정 실패. 새 `ops:indexnow:status` 집계에서 공개 게시4,676/성공 로그 연결4,440/후보236, 최근24h authFailed0 확인. 제출·DB 쓰기0, 후보 일괄 전송 미실행.
- CP-OPEN-032 신규 보완: build 모드에만 Google Fonts 연결 상한과 60초 deadline 적용. 가짜 font/보안 gate 우회 없이 최종 빌드 재통과. 동작·host 범위 4개 단위 검증. dev/start 운영 요청은 그대로 유지.
- Google 실제 실패 URL·법적/권리/외부 계정 확인 및 누적 대장의 신규 파이프라인 과제를 완료로 표시하지 않았다.

## 0. 2026-10-16 실행 상태 (이력)

| ID | 최신 상태 | 실행 결과 / 남은 완료 조건 |
| --- | --- | --- |
| CP-OPEN-001 | 소스 보존 완료 | 운영 8커밋을 실제 GitHub `codex/culturepeople-production-preserved-20261016`에 push. native의 기존 origin은 GitHub가 아닌 로컬 main 경로였음을 정정. 기준 source `75c74f0` 보존 |
| CP-OPEN-002 | 코드 통합·문서 보존 | 조사 당시 145파일 중 126동일/12개행만 상이/7문서 차이. 비문서 135파일을 검증 후 `1ddb93d`로 보존하고 새 수정 cherry-pick. 계획/결과 문서도 별도 추적 대상으로 보존. 기존 부록은 역사적 목록이며 현재 Git 상태가 아님. main의 외부 virtual-store 타입 탐색 오류는 기존 의존성 보존·표준 구조 재설치 후 타입/592테스트 통과 |
| CP-OPEN-003 | 외부 blocked | 올바른 env로 검사해도 `project_unreachable_or_paused`. 원본 소실 여부는 콘솔 확인 전 단정하지 않음 |
| CP-OPEN-004 | 외부 blocked | live export 미실행. 기존 primary/second copy의 실제 restore-check는 각각 통과 |
| CP-OPEN-005 | 위험 지속 | 여유 약153GB/사용률91.8%. retention dry-run 125개 전부 보호/삭제 후보0. 임의 삭제·95% 차단 완화 미실행 |
| CP-OPEN-006 | 부분 완료 | AES-256 암호화 사본 생성·hash 검증·실제 복호화/SQLite 복원 통과. NTFS/FUSE를 신뢰 가능한 POSIX 권한으로 오판하던 감사 수정. 기존 평문 제거·외부 키 보관·정기 암호화 정책은 미완료 |
| CP-OPEN-007 | 외부 blocked | 4,034/8,059 확보, 4,025 미확보. 대량 재시도 미실행 |
| CP-OPEN-008 | 전환 blocked | readiness 재검증. 보고서상 rewrite 후보0/허용false. copy·production rewrite 미실행 |
| CP-OPEN-009 | Worker 반영·Next 승격 대기 | PV fallback 제거, 방문 식별값 추정과 PV를 분리. Worker 운영 반영. Next 후보는 READY이나 새 보안 gate 실패로 미승격 |
| CP-OPEN-010 | baseline 확보·효과 측정 대기 | 계정 D1 rowsRead UTC10/14 전체618,550/10/15 18:06까지597,305 확인. 부분 일자·트래픽 미보정이므로 절감률 계산 안 함. Vercel CPU/요금 동기간 비교 미완료 |
| CP-OPEN-011 | 현재 지표 확인·원인 규명 대기 | UTC 10/14 18:05~10/15 18:05 Worker479요청/errors0/clientDisconnected3. 해당 구간 exceededResources 없음. 과거 오류의 단계별 profiling/원인 입증은 미완료 |
| CP-OPEN-012 | 검증 완료 | published v2/34 subjects/216 rules. Next-main·Worker-scheduled·Worker-queue 실제 observation checksum 일치, fallback 아님 |
| CP-OPEN-013 | 부분 완료·관찰 중 | 게시 참조만으로 복구하지 못하도록 코드 보강. 실제 게시 기사 확인된 1건만 reconcile. 시작 시 running/expired351건; 350건 재큐잉은 미실행. 자동 회수 flag=false, 24시간 관찰 필요 |
| CP-OPEN-014 | 대표자 작업 | 승인 법적 문안·책임자 확정 필요. 허구 정보·주소 추가 안 함 |
| CP-OPEN-015 | gate 실패 확인 | GitHub CI `38777879643` 실제 실행. dependency audit 실패. 로컬 단위·타입·lint·build 통과와 CI 전체 성공을 구분 |
| CP-OPEN-016 | dry-run 완료·미적용 | 최신 백업 4,659기사/정규화 후보356. JSON/CSV 생성. 운영 일괄 변경 미실행 |
| CP-OPEN-017 | 권리·pilot blocked | 운영 테이블13/후보0, 기능·shadow·draft·autopublish=false 확인. 실데이터 권리/50건 pilot/2인 검토 필요 |
| CP-OPEN-018 | 실제 연동 미구현 | 기존 UI와 TikTok OAuth·게시 API를 구분. 제품 범위/실계정/심사 필요 |
| CP-OPEN-019 | NOT_RUN | Claude/ChatGPT 실제 웹 앱 검증 미실행 |
| CP-OPEN-020 | 선행조건 없음 | 실제 사용자 선택 컷이 없어 임의 상태/영수증 생성 안 함 |
| CP-OPEN-021 | NOT_IMPLEMENTED | 클라우드 주 실행·로컬 보조 파이프라인 신규 개발은 남음 |
| CP-OPEN-022 | 부분 검증 | 단위 117파일/592테스트 통과. 인증 관리자·3테마 전체 브라우저 smoke는 NOT_RUN |
| CP-OPEN-023 | 대표자 후속 | 사이트 표본/후보 기본 surface와 Search Console 전체 정상 판정을 구분. 라이브 테스트/요청은 콘솔 작업 |
| CP-OPEN-024 | 완료 | 소유권·비운영·alias 미사용 확인 후 이전 실패 후보 `dpl_7zLxBkW1QrXawnBQz3g5Dprs4RTa` 삭제, 재조회404 |
| CP-OPEN-025 | 갱신 | 최초 snapshot 보존, 최신 실행 결과/기획서 상단 연결로 상태 supersede |
| CP-OPEN-026 | NOT_IMPLEMENTED | MCP 호스팅 이전은 별도 target/운영 owner 결정과 구현이 남음. 기존 Vercel 유지 |
| CP-OPEN-027 | 재점검·진단 보완 완료 / 실제 URL 대기 | 10/16 표본2개×UA3·필수surface 정상, provider 최근24h 5xx 반환0. 진단 도구 수정/597테스트 통과. 첨부 Coverage는10/12 기준 색인495/미색인4,417, 발견됨4,309/NOINDEX44/5xx2/Soft4041이지만 URL열 없음. 실제 URL/시각 대기로 전체 해결 미확정. [ZIP 분석](./google-search-console-coverage-export-analysis-2026-10-16.md) |
| CP-OPEN-028 | 외부 blocked | 고정 gateway `ed90c7d` 후보의 Vercel 작성자 접근권한 차단 유지. backend SHA 대체·metadata 우회·DNS/Auth0/Fold3 변경 안 함 |
| CP-OPEN-029 | P0 신규·부분 수정 | 보안 audit Critical4→0/High36→6. 잔여 High6/Moderate31/Low3으로 CI 미통과. 새 Next production 승격 금지. 미패치 upstream/major 호환 검증 필요 |
| CP-OPEN-030 | P1 별도 Cloud project 확인 | Google Workspace MCP OAuth agentic 분류11/11 점검 안내 수신. 컬피 env/code에서 해당 client 식별 못함. 대표자가 메일의 Cloud project/client 실사용을 대조한 후 해당 AI client만 설정. Auth0/REST client 임의 변경 금지. [안내](./google-search-console-alert-check-2026-10-16.md) |

현재 Worker: `2ae251ab-28f0-45fe-aca9-a8db81314d15`, bindings/schedules 유지, health200/policyv2 확인. 메인 production은 `dpl_HyWykUJPnBq2dSryQaVgJi4Uzirs` 유지. 시험 후보 `dpl_DtSv1XXAC5jWG4ovW2dsPcuYtivT`는 이전 의존성으로 빌드됐으므로 보안 수정 후 배포 정본으로 재사용하지 않는다.

이하 1~10장 및 부록의 파일 수·시각·수치는 **최초 조사 이력**이다. 오래된 `NOT_RUN`, `이번 작업에서 push 미실행` 문구를 최신 상태로 해석하지 않는다.

## 1. 핵심 결론

1. main 작업 폴더에는 **142개 미커밋 파일(수정 89, 신규 53, staged 0)**이 있다.
2. 별도 운영 릴리스 저장소는 clean이지만 **운영 수정 8커밋이 upstream보다 앞서 있다**. 원격 branch ref도 직접 확인해 이전 기준선에 머무는 것을 확인했다. 미커밋 정리와 별도로 원격 보존이 필요하다.
3. 미커밋 파일이 곧 미배포 기능은 아니다. 공개 최적화, 연락처 교체, 캐시 fallback 수정은 운영 배포 기록이 있지만 main에서는 변경·신규 파일로 남아 있다.
4. 최신 로컬 백업과 2차 복제본은 존재한다. 그러나 **Supabase fallback 148.7일, 이미지 미확보 4,025개, 원본 디스크 사용률 92.8%**는 해결되지 않았다.
5. D-2 MCP 게이트웨이는 배포됐다. 실제 Claude/ChatGPT 웹 화면 확인과 선택 컷이 필요한 이미지 URL 양식 검증은 별도로 남아 있다.
6. 편집 자동화·정책 관리·TikTok 기능은 코드 존재, 운영 활성화, 실제 이용 권리, 외부 승인 상태를 각각 분리해야 한다. 예전 계획의 “배포 대기” 문구만으로 현재 미배포라고 단정하지 않는다.

## 2. 확인 방법과 한계

### 이번에 직접 확인

- 네 저장소의 HEAD, branch, upstream, porcelain 전체 파일 목록, staged 여부.
- native 릴리스 저장소의 upstream 이후 8커밋과 원격 branch SHA.
- `pnpm backup:local:status` 실행 결과.
- 백업 symlink 실제 경로, 2차 백업 mount 및 물리 디스크 분리.
- main의 `package.json` 명령과 관련 계획·배포 결과 문서.

### 최근 운영 증빙을 인용하되 이번에 재실행하지 않은 것

- 10월 14일 메인 사이트 배포, 연락처·캐시 수정 및 116파일/577테스트 결과.
- 10월 15일 MCP D-2 배포, tools/list 및 실제 영수증 검증.
- 10월 10일 공개 사이트 요청 최소화 전후 비교.
- 인증된 관리자 UI, 현재 Worker 동적 정책 flag/runtime observation, 외부 콘솔, 실수신 메일, 전체 CI는 이번에 재검증하지 않았다.
- 이번 작업의 단위 테스트·타입 검사·빌드·restore-check는 **NOT_RUN**이다. 백업 status의 ok가 이번 복원 리허설 통과를 뜻하지 않는다.
- 공개 URL을 반복 호출하거나 운영 D1 전체 테이블을 재조회하지 않았다.

## 3. Git 및 배포 기준선

| 구분 | 경로 | HEAD / 상태 | 잔여 작업 |
| --- | --- | --- | --- |
| main 작업 폴더 | `/mnt/win_d/Users/Documents/monet-registry-main` | `879179491ebf1800b7a941b6e3bf6519958ea15b`, `release/culturepeople-20260728`, dirty 142 | 운영 소스와 대조 후 변경별 보존·통합 |
| 운영 릴리스 저장소 | `/home/arbada/culturepeople-d1-hotfix-20261004` | `75c74f093efe48c05bc40e5277a4a903af4d334e`, clean, cached behind 0/ahead 8 | 8커밋 원격 보존 및 정본 통합 |
| 숏줍 작업 폴더 | `/home/arbada/shorts-automation` | `0004ba4031016ae9689be497718931ca2009bfeb`, dirty 3, upstream 미설정 | 컬피/MCP 결과 문서와 병행 작업 구분 |
| D-2 고정 소스 | `/home/arbada/shortjup-gateway-d2-20261015` | `6e522adaf29cdedc4cf294aaac94835f92a4305b`, detached, clean | 배포 재현용 보존, 최신 숏줍 전체로 덮어쓰지 않음 |

main upstream은 `origin/release/culturepeople-20260728`이고 로컬 캐시 비교는 behind 0/ahead 0이다. 이는 GitHub main 최신 상태나 운영 배포와 일치한다는 뜻이 아니다. 숏줍은 upstream 미설정이므로 변경 수만으로 미푸시 커밋 수를 추정하지 않았다.

native 원격 확인 명령: `git ls-remote origin refs/heads/hotfix/d1-tag-index-20261004`.
확인된 원격 SHA: `1176c42ec0ff3dd64f466cc06456d09b255d7f54`.
로컬 `75c74f0`과 다르며 아래 8커밋이 현재 branch upstream 이후에 존재한다. 다른 원격 ref에 같은 커밋이 있는지는 전수 확인하지 않았다.

### 3.1 운영 반영됐지만 branch 원격 보존이 남은 8커밋

오래된 것부터:

| 커밋 | 내용 |
| --- | --- |
| `db961e3` | 일간 D1 quota 보호·반복 읽기 감소 |
| `9e46f6c` | legacy media matcher·읽기 인덱스 복구 예약 |
| `cfcbfbf` | 공개 조회 캐시·Worker 일일 오류 경고 |
| `ff2c43c` | 공개 prefetch 억제·익명 표시 설정 캐시 |
| `503c8b6` | 카테고리·검색 payload 축소·팝업 설정 캐시 |
| `f5ef7c8` | provider fallback 회귀 검증 |
| `4a9b417` | 문의 이메일 정규화 |
| `75c74f0` | 공유 설정 캐시 밖에서 caller fallback 적용 |

금지: main dirty 폴더에 전체 cherry-pick/reset/checkout으로 덮어쓰기, 무차별 `git add .`, secret·backup·실제 대본·토큰 포함 커밋. 먼저 파일/부분 변경 단위 비교와 secret 검사, release manifest 대조를 한다. push·merge·폴더 삭제는 이번 작업에서 실행하지 않았다.

### 3.2 최근 운영 배포 기준

| 서비스 | 최근 확인된 배포 | 소스 | 근거 |
| --- | --- | --- | --- |
| 컬피 메인 | `dpl_HyWykUJPnBq2dSryQaVgJi4Uzirs` | `75c74f093efe48c05bc40e5277a4a903af4d334e` | contact-email release/promotion 증빙, D-2 전후 메인 배포 동일 확인 |
| MCP 게이트웨이 | `dpl_4d6CKkFrJfjqXsijLVYBbiDPTgMX` | `6e522adaf29cdedc4cf294aaac94835f92a4305b` | D-2 배포 결과 문서 |

“최근 확인된” 값이며 이번 문서 작성 중 provider alias API를 다시 호출한 것은 아니다. 새 배포 전 반드시 현재 alias·롤백 대상을 다시 확보한다.

## 4. 누적 미완료 작업 등록부

상태는 `개발 대기`, `검증 대기`, `외부 blocked`, `정리 대기`, `완료 이력`으로 구분한다. 우선순위는 실행 순서이며 결제를 자동 승인하는 의미가 아니다.

| ID | 우선순위 | 과제 / 현재 상태 | 다음 실행 및 완료 기준 |
| --- | --- | --- | --- |
| CP-OPEN-001 | P0 | 운영 8커밋 원격 보존·정본 통합 / 정리 대기 | branch 보호·원격 차이 확인 후 별도 통합 릴리스. main의 독립 변경 보존, 원격에서 운영 source SHA 재현 가능해야 완료 |
| CP-OPEN-002 | P0 | main 미커밋 142개 분류 / 정리 대기 | 부록 파일을 기능별·부분 변경별로 운영 SHA와 비교. 완료된 배포와 신규 개발을 분리하고 각 commit에 테스트/배포 증빙 연결 |
| CP-OPEN-003 | P0 | Supabase 원본 복구 / 외부 blocked | 대표자가 dashboard에서 프로젝트 존재·ref·Resume/다운로드 가능 여부 확인. 상태 출력의 fetch failed만으로 현재 복구 불가능/데이터 소실을 단정하지 않음 |
| CP-OPEN-004 | P0 | fresh Supabase export / 외부 blocked | recovery-check 통과 후 wrapper로 통합 백업 재생성, 양쪽 restore-check. fallback 대신 live export 및 최신성 확인이 완료 기준 |
| CP-OPEN-005 | P0 | 디스크 92.8% 사용 / 운영 조치 대기 | 보관 정책 dry-run·검증된 복원본·유일한 fallback 보존 후 공간 확보 계획. 95% 안전 차단을 낮추거나 임의 삭제하지 않음 |
| CP-OPEN-006 | P0 | 민감 백업 보호 / 현재 상태 재검증 필요 | 과거 평문 settings·NTFS 권한 문제를 최신 security audit/암호화 복원 증빙으로 재판정. 기존 스크립트 존재를 암호화 운영 완료로 간주하지 않음 |
| CP-OPEN-007 | P1 | 이미지 4,025개 미확보 / 외부 blocked | 원본 접근 복구 후 저부하 백필·hash/manifest 확인. 대량 재시도 금지. 현재 없는 원본을 코드로 재생성하지 않음 |
| CP-OPEN-008 | P1 | R2 이전·production URL 전환 / 검증 대기 | 로컬 확보·권리·원본/목적지 checksum·GET/TLS·기사별 mapping·rollback을 먼저 검증. 기존 계획의 100% 확보 전 전체 rewrite 금지 유지 |
| CP-OPEN-009 | P1 | Telegram 방문 통계 명칭·fallback / 개발 대기 | Worker의 `human_visitors || human_views` 및 Next의 key 누락 시 로그 건수 fallback 수정. UV 추정과 PV 분리, key 없음은 집계 불가. 실제 사람 증가라고 단정 금지 |
| CP-OPEN-010 | P1 | 사용량 개선 실효 측정 / 검증 대기 | D1 일간 reads·Worker errors·Vercel CPU를 동일 기간/트래픽 기준 비교. 요청 감소를 CPU/요금 감소율로 환산하지 않음 |
| CP-OPEN-011 | P1 | Worker exceededResources 원인 / 검증 대기 | 이전 9/340 오류는 과거 지표. 최신 invocation 로그·처리 단계별 시간 확인 후 범위 제한 재현. 단순 한도 상향·발행량 증가는 금지 |
| CP-OPEN-012 | P1 | 정책 관리자 동적 반영 / 운영 재확인 대기 | 현 운영 Next/Worker source·flag·published/applied version 확인. 문서의 7월 “미배포/501변경” 문구만으로 판정 금지. 다음 정상 invocation에서 version/checksum 일치와 fallback 증빙 확보 |
| CP-OPEN-013 | P1 | auto-press stale running 회수 / 현황 재검증 대기 | 기존 stale-recovery의 dry-run으로 현재 건수·lease·중복 발행 방지 확인. 7월 177건을 현재 수치로 재사용하지 않음 |
| CP-OPEN-014 | P1 | 법적 정책·설정 확정 / 대표자 작업 | 최근 cp-terms null 기록과 승인 문안·청소년보호책임자 확인. 현재 홍길동 노출이라고 재단정하지 않음. 공개 주소 재노출 금지, 기사 인용·과거 기록 변경 금지 |
| CP-OPEN-015 | P1 | CI·배포 gate 현황 / 검증 대기 | 기존 GitHub 실패/queued 기록은 7월 자료. 최신 run과 gate·manifest·rollback을 확인. 오래된 CI 성공 또는 실패를 현재 증빙으로 사용하지 않음 |
| CP-OPEN-016 | P2 | 카테고리 정규화 / dry-run 검토 대기 | 현재 감사 후 JSON/CSV·rollback mapping으로 승인 범위 확정. 과거 3,808건/332후보는 참고만. 실제 일괄 변경은 별도 승인 전 금지 |
| CP-OPEN-017 | P2 | 자체 기사화 실제 데이터 pilot / 외부 blocked | 권리 확인 100개 실제 기사, 합성 156개 배제, 실제 pilot 50건·2인 라벨·holdout/shadow 확보. 코드 MVP와 정확도·운영 완료를 분리 |
| CP-OPEN-018 | P2 | 알리닷 실제 TikTok 연동 / 범위 결정 대기 | 현재 공개 정책·내부 영상 UI는 실제 OAuth/게시가 아님. 실사용 제품 성격 결정 후 필요 scope·보유/삭제·실제 API·sandbox·심사 설계. 보여주기 성공 로그 생성 금지 |
| CP-OPEN-019 | P2 | MCP Claude/ChatGPT 웹 검증 / NOT_RUN | 실제 웹 앱의 새 인자 표시·longJup 읽기 조회. Codex 연결 도구 성공으로 대체하지 않음 |
| CP-OPEN-020 | P2 | MCP 선택 컷 이미지 URL 결박 / 선행조건 없음 | 사용자가 실제 컷을 선택한 경우에만 UID/hash/URL 양식 확인. 현재 receipt failed를 PASS로 바꾸지 않음 |
| CP-OPEN-021 | P2 | 클라우드 주 실행·로컬 보조 / 계획 상태 | notify 배치·발행시각 계약·클라우드 단독 복구부터 코드 대조. 로컬 꺼짐/lease 회수/중복 게시 없음 입증 전 로컬 owner 활성화 금지 |
| CP-OPEN-022 | P2 | 관리자·3테마 스모크 / 재검증 대기 | 최근 공개 smoke는 관리자 권한·전체 사이트 타입을 대체하지 않음. 로컬 mock부터 role·모바일·회귀 확인, 운영 site type 변경 금지 |
| CP-OPEN-023 | P2 | SEO·Google/Bing 후속 / 대표자·검증 작업 | 정상 게시 기사만 canonical/indexable/이미지 확인. Search Console 라이브 테스트·색인 요청은 대표자. 삭제 404·내부 noindex는 유지, 색인 보장 불가 |
| CP-OPEN-024 | P3 | 중간 Vercel 후보 정리 / 보류 | 연락처 작업의 미승격 후보 `dpl_7zLxBkW1QrXawnBQz3g5Dprs4RTa`는 API timeout으로 삭제 보류 기록. current/rollback 보호·소유권 확인 후에만 정리 |
| CP-OPEN-025 | P3 | 오래된 문서 현황 동기화 / 정리 대기 | 아래 모순을 각 문서 갱신일·근거와 함께 수정. 완료 이력을 지우지 말고 최신 상태로 supersede |
| CP-OPEN-026 | P2 | MCP 호스팅 이전 / 별도 계획 대조 필요 | 최근 사용자 요청은 있었으나 D-2는 기존 Vercel gateway 배포만 수행. 이전 계획의 현 source·터널/상시운영·OAuth·롤백 근거 확인 후 별도 결정. 현 배포 성공을 서버 이전 완료로 표시하지 않음 |
| CP-OPEN-027 | P1 | 10/15 Google 5xx·NOINDEX 알림 / 실제 대상 URL 확인 대기 | 메일 두 건 확인, 홈/feeds/health 200, 기사2개×UA3 blocking0, 관련61테스트 통과. 실제 보고서 URL·크롤링 시각은 미확인. 정상 표본으로 전체 해결 판정 금지. [조사 결과](./google-search-console-alert-check-2026-10-15.md) |
| CP-OPEN-028 | P1 | 글줍 MCP 후속 gateway B단계 / Vercel 작성자 권한 blocked | 10/16 backend 설치 증빙 해소, A단계 ed90c7d 준비 완료. 시험 dpl_87SLt5E99ATHTHstkKCPBK5JxqTT는 TEAM_ACCESS_REQUIRED/isVerified=false로 BLOCKED. 기존 운영 유지. 정식 GitHub 연결·owner/committer 권한 확인 후 같은 SHA로 재개. [B단계 결과](./culturepeople-glo-mcp-gateway-stage-b-result-2026-10-16.md) |

### 4.1 백업 최신 실측

`pnpm backup:local:status` 결과이며 서비스 전체 상태가 아니다.

| 항목 | 이번 결과 |
| --- | --- |
| latest snapshot | `2026-10-14T19-00-10-529Z` |
| completed | `2026-10-14T19:02:30.124Z` = 2026-10-15 04:02:30 KST |
| age / local backup | 약 9시간, ok |
| 통합 기사 / 중복 기사 | 4,659 / 3,067 |
| D1/Supabase rows | 43,262 / 3,095, 기사 수와 동일한 개념 아님 |
| Supabase | local_fallback, 148.7일, live export error: fetch failed |
| 이미지 | 4,034/8,059 URL 확보, 4,025 deferred |
| 실제 media store | 3,516 파일 / 약 425MB, URL 수와 파일 수는 dedupe로 다를 수 있음 |
| 최근 24시간 백필 | 24회, 신규 +0, deferred_dns 누계 96,600은 같은 4,025 URL의 반복 보류 횟수 |
| 원본 디스크 | 여유 약 135GB, 사용률 92.8%, danger |
| 2차 복제본 | 같은 snapshot, lag 0h, SQLite/mediaIndex 존재, 여유 약 182GB |
| lock | clear |

경로:
- 홈 `/home/arbada/culturepeople-backups`는 `/mnt/win_d/Users/Documents/monet-registry-main/culturepeople-backups`로 해석된다.
- 1차는 UUID `96B82074B8205551`, `nvme1n1p2`, NTFS.
- 2차 `/home/arbada/culturepeople-backups-second-copy`는 `nvme0n1p2`, ext4에 있다.
- 두 물리 디스크는 분리돼 있다. 다만 같은 컴퓨터이므로 화재·도난·랜섬웨어에 대비한 외부/오프라인 사본까지 확보됐다는 뜻은 아니다.
- 2차 lag=0은 Supabase 원본 최신성이나 실제 복원 성공을 의미하지 않는다.
- 이미지 backlog는 현재 원본 접근으로 blocked다. “300개씩 14회면 끝”이라는 추산은 원본 접근 복구 전에는 실행 일정으로 사용할 수 없다.

## 5. 완료 이력: 미완료로 다시 세지 않을 항목

| ID | 완료/반영 내용 | 근거 및 남은 경계 |
| --- | --- | --- |
| CP-DONE-001 | D1 읽기 quota 보호·캐시·keyset export·0008 인덱스 복구 | d1-quota-recurrence-remediation 문서. 0007/0008 재적용 금지. 앞으로 quota 초과가 절대 없다는 보장은 아님 |
| CP-DONE-002 | 공개 prefetch 억제·설정 캐시·카드 payload 축소 | 10/10 기록: prefetch 21/34→0, 홈 응답 약41% 감소. 운영 CPU 절감 실측은 별도 |
| CP-DONE-003 | 문의 이메일 교체·공유 설정 fallback 오류 수정 | 10/14 운영 source 75c74f0, 116파일/577테스트, 후보/운영 검증 증빙. main Git 정리는 남음 |
| CP-DONE-004 | D-2 MCP 게이트웨이 배포·스키마·읽기 영수증 | 10/15 결과 문서. 웹 앱 확인·선택 컷 조건은 OPEN-019/020 |
| CP-DONE-005 | 현재 로컬 백업 생성·2차 동기화 | 이번 status 확인. Supabase live 최신성·미확보 이미지·복원 리허설까지 완료라는 뜻 아님 |
| CP-DONE-006 | 알리닷 공개 페이지·내부 영상 UI 구현 기록 | 기존 기획서상 8월 배포 완료. 실제 TikTok 통합·승인은 제외, 이번 라이브 재검증 안 함 |

## 6. 미커밋 묶음별 정리 제안

공유 파일 `package.json`, lockfile, `db-server.ts`, `middleware.ts`, 기사 페이지, 배포 스크립트는 여러 기능이 섞여 있을 수 있다. 파일 단위 일괄 stage가 아니라 부분 변경 비교 후 분리한다. 아래는 commit 제안이며 실제 stage/commit을 하지 않았다.

| 묶음 | 파일군 예시 | 선행 검증 / 분리 기준 |
| --- | --- | --- |
| G1 D1 quota·백업·인덱스 | 0007/0008, d1-http-client, d1-keyset-export, backup, health, scheduler | 운영 8커밋과 중복 비교, migration ledger 보존, 재-backfill 금지 |
| G2 공개 사용량 최적화 | PublicLink, public settings, article preview, popup, 각 theme/list | 이미 배포된 10월 변경과 대조, CSP·관리자 인증 유지 |
| G3 법적 정보·알리닷 | legal-company-name, alidot, tiktok-review, Footer, site type | 실제 API와 prototype 구분, 연락처·주소·secret 재노출 방지 |
| G4 SEO·기사 시각·검색 | seo-copy, publication-date, metadata, sitemaps, category/tag | 삭제 기사 404, 내부 noindex, 자기 canonical 회귀 |
| G5 auto-press·업로드·Telegram | source selection, worker dispatch, image upload, watermark, notify | 기존 기사 중복/정책·author·retry 회귀, 보고서 PV/UV 분리 |
| G6 릴리스·검증 도구 | release gate, deploy, smoke, verify scripts/tests | clean artifact와 production source mapping, secret 없는 증빙 |
| G7 계획·분석·배포 문서 | 부록의 docs 파일과 이 대장 | 코드/운영 시점별 표기, raw 계정 데이터 금지 |

다른 저장소 문서는 해당 저장소 소유 작업과 합의해 커밋한다. “폴더 통합”을 이유로 native 운영 릴리스나 D-2 snapshot을 먼저 삭제하지 않는다. 원격 보존·재현·rollback 확인 후 별도 정리한다.

## 7. 문서 충돌·과거 수치 갱신 대상

이번에는 아래 문서를 수정하지 않고 이 대장에 차이만 기록한다.

| 문서 | 오래된 서술 / 후속 반영 필요 |
| --- | --- |
| post-production-deployment-audit-and-next-plan.md | 410/411파일, 62.2일, 7월 CI, 새 명령 8개 미존재는 과거. 현재 backup:security:audit/release:manifest/stale-recovery 등은 존재 |
| auto-press-blocked-subject-admin-plan.md | 501변경·clean release 불가·운영 코드 미배포는 7월 기록. 현재 native clean 운영 릴리스 존재, 동적 활성화는 별도 실측 필요 |
| development-master-plan.md 및 backup 계획 | secondCopy not_configured를 현재 사실로 재사용 금지. 실제 2차 존재. 미확보4,025개는 이번에도 유지 |
| d1-quota-recurrence-remediation.md | 10/5~10/7 disk98.2/94.7%, backup49.6/95.3h는 역사. 최신값은 4.1 사용 |
| original-editorial roadmap | 코드 완료와 실제 pilot·권리·자동 게시 blocked 분리 유지. 오래된 release gate 배포 대기 표현은 현재 source 대조 필요 |
| hybrid-local-cloud-publishing-plan.md | 설계 표의 limit/주기는 현 Worker 설정과 재대조 전 최신 SLA로 쓰지 않음 |
| tiktok-alidot 두 기획서 | 내부 UI prototype 완료와 TikTok OAuth/API 미구현·외부 심사 미완료를 분리 |

## 8. 다음 작업 순서 및 기존 명령

### 8.1 권장 순서

1. **소스 유실 방지:** 운영 8커밋의 원격 보존 계획과 main 142파일의 중복/고유 변경 매핑부터 확정.
2. **백업 위험 축소:** 민감정보 보관 audit, 두 사본 restore-check, disk retention dry-run. Supabase 콘솔 확인은 병렬.
3. **데이터 복구:** 원본 접근 확인 후 fresh export, 저부하 이미지 확보, R2 검증. 복구 전 대량 retry·전체 rewrite 금지.
4. **실제 사용자 지표:** Telegram UV/PV 표현·fallback을 좁게 수정하고 회귀 테스트.
5. **운영 검증:** Worker 오류 원인, 동적 정책 version, stale queue, 최신 CI·gate.
6. **제품 개발:** 권리 확보 편집 pilot, 카테고리 정규화, 로컬 보조, TikTok 실연동은 각각 범위 확정 후 진행.
7. **MCP 마감:** 실제 웹 앱 확인 및 정상 작업에서 선택 컷 결박 검증. 메인 사이트/DNS/Auth0/Fold3 변경으로 확대하지 않음.

### 8.2 존재를 확인한 명령

아래는 다음 작업용 목록으로 이번에 전부 실행한 것은 아니다. root·권한·옵션·출력 경로는 해당 스크립트 구현을 읽고 실행한다.

```bash
pnpm backup:local:status
pnpm backup:local:restore-check -- --root "$HOME/culturepeople-backups"
pnpm backup:local:restore-check -- --root "$HOME/culturepeople-backups-second-copy"
pnpm backup:security:audit
pnpm backup:retention:plan
pnpm ops:audit
pnpm supabase:recovery-check -- --require-storage
pnpm cloudflare:r2:media-readiness
pnpm auto-press:policy:sync-check
pnpm auto-press:stale-recovery
pnpm category:audit
pnpm category:normalize -- --dry-run
pnpm editorial:status
pnpm ops:env-drift-check
pnpm ci:typecheck
pnpm test:unit
```

`ops:supabase-recovered-backup`、`backup:local:sync-copy`、`release:manifest`、`release:gate`도 존재한다. 단, fresh backup·복제·publish·migration·deploy는 단순 상태 확인이 아니다. 이 문서 작성에서 실행하지 않았다. 신규 구현 명령을 기존 기능처럼 나열하지 않는다.

Windows에서는 `$HOME`를 PowerShell `$HOME` 또는 해당 사용자 경로로 지정하고 symlink/systemd 대신 실제 백업 root와 Task Scheduler를 사용한다. Linux `/mnt/win_d`를 하드코딩한 신규 런타임은 만들지 않는다. Node/pnpm 명령 계약은 공통으로 유지한다.

## 9. 외부 결정·이번에 실행하지 않은 위험 작업

### 대표자/실사용자 확인

- Supabase 프로젝트의 현재 보존·복구·다운로드 가능 상태 및 결제 여부. 오래된 복구 기한을 현재 보장으로 제시하지 않음.
- 회사 정책 문안·책임자·문의 수신·데이터 보유/삭제 기준 승인.
- 백업 암호키 보관 및 외부/오프라인 백업 대상.
- Google/Bing/Search Console 실제 화면 및 필요 시 GA4/Naver 도입·개인정보 정책.
- TikTok의 실제 제품 성격과 구현/신청 범위.
- Article Guard 실제 100건 권리 및 추가 실데이터 확보, 편집 책임자·pilot 라벨링.
- MCP 실제 웹 클라이언트에서 도구 확인 및 실제 편집 컷 선택.

### 미실행

운영 DB 쓰기, 기사 삭제·복구, 이미지 대량 다운로드, production URL rewrite, 카테고리 apply, 정책 publish, site type 변경, auto-news/뉴스레터 활성화, Git 통합/push, Vercel 배포·삭제, Fold3/Auth0/DNS 변경, 유료 생성·영상 업로드는 실행하지 않았다.

네이버·다음 뉴스 제휴/자동 송고는 제외한다. 삭제·위험·중복 제거 기사의 404는 정상이며 미해결 SEO 버그로 등록하지 않는다.

## 10. 누적 갱신 규칙

- 새 이슈는 CP-OPEN의 다음 번호를 부여하고 발견일·근거·담당·완료 조건을 기록한다. 기존 번호를 재사용하지 않는다.
- 완료 시 행을 지우지 않고 완료일·commit·테스트·deployment·운영 확인을 붙여 완료 이력으로 이동한다.
- blocked 해제는 실제 외부 상태 또는 검증 결과가 있어야 한다. 문서 수정이나 코드 존재만으로 완료 처리하지 않는다.
- Git inventory는 기준 HEAD와 시각을 함께 재생성한다. 다른 작업자의 변경을 “정리”한다며 revert하지 않는다.
- 증빙에는 token, SMTP 비밀번호, OAuth secret, 관리자 개인정보, 실제 원문 대본을 복사하지 않는다.
- 부록의 파일 수는 작업량·완성도·미배포 기능 수가 아니다. 내용이 섞인 공유 파일은 hunk별 검토가 필요하다.
- 이 대장도 현재 untracked이므로 후속 문서 commit에 포함할 후보이며 이번에는 커밋하지 않는다.

## 부록 A. main 미커밋 파일 전체

생성 직전 142개: tracked 수정 89개, untracked 53개. Git porcelain 앞 두 문자는 index/worktree 상태다. 아래 경로는 main 저장소 기준이다.

```text
 M .gitignore
 M cloudflare/workers/auto-press-retry-scheduler.js
 M next.config.ts
 M package.json
 M pnpm-lock.yaml
 M scripts/apply-d1-sql.mjs
 M scripts/browser-smoke.mjs
 M scripts/culturepeople-release-gate.mjs
 M scripts/deploy-culturepeople-vercel.mjs
 M scripts/local-culturepeople-backup.mjs
 M scripts/verify-portal-surface.mjs
 M src/app/about/page.tsx
 M src/app/advertising/page.tsx
 M src/app/api/cron/auto-press/route.ts
 M src/app/api/cron/cloudflare-usage-report/route.ts
 M src/app/api/health/route.ts
 M src/app/api/rss/route.ts
 M src/app/api/upload/image/route.ts
 M src/app/article/[id]/components/ArticleShare.tsx
 M src/app/article/[id]/components/ArticleSidebar.tsx
 M src/app/article/[id]/page.tsx
 M src/app/cam/about/page.tsx
 M src/app/cam/layout.tsx
 M src/app/cam/newsletter/page.tsx
 M src/app/cam/settings/hooks/useSettings.ts
 M src/app/cam/site-type/page.tsx
 M src/app/cam/terms/page.tsx
 M src/app/category/[slug]/components/CategoryArticleList.tsx
 M src/app/category/[slug]/components/CategoryPagination.tsx
 M src/app/category/[slug]/page.tsx
 M src/app/contact/page.tsx
 M src/app/layout.tsx
 M src/app/news-sitemap.xml/route.ts
 M src/app/page.tsx
 M src/app/privacy/page.tsx
 M src/app/reporter/[name]/page.tsx
 M src/app/search/components/SearchContent.tsx
 M src/app/search/page.tsx
 M src/app/sitemap.xml/route.ts
 M src/app/tag/[name]/TagArticleList.tsx
 M src/app/tag/[name]/page.tsx
 M src/app/terms/page.tsx
 M src/app/youth-policy/page.tsx
 M src/components/pages/culturepeople-landing/index.tsx
 M src/components/registry/culturepeople-footer-6/index.tsx
 M src/components/themes/culturepeople/CulturePeopleArticlePage.tsx
 M src/components/themes/culturepeople/CulturePeopleCategoryPage.tsx
 M src/components/themes/culturepeople/CulturePeopleFooter.tsx
 M src/components/themes/culturepeople/CulturePeopleHeader.tsx
 M src/components/themes/culturepeople/CulturePeopleLanding.tsx
 M src/components/themes/insightkorea/InsightKoreaArticlePage.tsx
 M src/components/themes/insightkorea/InsightKoreaCategoryPage.tsx
 M src/components/themes/insightkorea/InsightKoreaFooter.tsx
 M src/components/themes/insightkorea/InsightKoreaHeader.tsx
 M src/components/themes/insightkorea/InsightKoreaLanding.tsx
 M src/components/ui/PopupRenderer.tsx
 M src/config/site-data.json
 M src/lib/auto-press-source-selection.ts
 M src/lib/auto-press-worker-dispatch.ts
 M src/lib/cloudflare-usage-report.ts
 M src/lib/constants.ts
 M src/lib/d1-http-client.ts
 M src/lib/d1-server-db.ts
 M src/lib/db-server.ts
 M src/lib/db.ts
 M src/lib/server-upload-image.ts
 M src/lib/site-type.ts
 M src/lib/supabase-server-db.ts
 M src/lib/telegram-notify.ts
 M src/lib/telegram-settings.ts
 M src/lib/watermark.ts
 M src/middleware.ts
 M tests/unit/article-metadata-indexing.test.ts
 M tests/unit/auto-press-source-selection.test.ts
 M tests/unit/backup-status-and-ops-audit.test.ts
 M tests/unit/browser-smoke-public-mode.test.ts
 M tests/unit/cloudflare-usage-report.test.ts
 M tests/unit/d1-http-client.test.ts
 M tests/unit/d1-server-db.test.ts
 M tests/unit/db-server-read-adapter.test.ts
 M tests/unit/deploy-culturepeople-vercel.test.ts
 M tests/unit/legal-content-guard.test.ts
 M tests/unit/news-sitemap-route.test.ts
 M tests/unit/public-footer-fallback.test.ts
 M tests/unit/public-page-data-resilience.test.ts
 M tests/unit/rss-route.test.ts
 M tests/unit/sitemap-route.test.ts
 M tests/unit/verify-portal-surface.test.ts
 M vercel.json
?? cloudflare/d1/migrations/0007_article_tags.sql
?? cloudflare/d1/migrations/0008_public_read_indexes.sql
?? docs/culturepeople-d2-longjup-mcp-gateway-rollout-result-2026-10-15.md
?? docs/culturepeople-hybrid-local-cloud-publishing-plan.md
?? docs/d1-quota-recurrence-remediation.md
?? docs/tiktok-alidot-admin-review-console-plan.md
?? docs/tiktok-alidot-public-pages-plan.md
?? docs/traffic-report-analysis-2026-10-14.md
?? docs/vercel-usage-minimization-2026-10-10.md
?? public/alidot/alidot-symbol.png
?? public/tiktokOho8Dhr4glRI4oIO3Qdskcf3TSg0wK6z.txt
?? scripts/legal-company-name.mjs
?? scripts/lib/d1-keyset-export.mjs
?? scripts/lib/legal-company-name.mjs
?? scripts/recover-d1-read-indexes.mjs
?? scripts/verify-alidot-pages.mjs
?? scripts/verify-public-request-budget.mjs
?? scripts/verify-tiktok-review-page.mjs
?? src/app/alidot/page.tsx
?? src/app/alidot/privacy/page.tsx
?? src/app/alidot/terms/page.tsx
?? src/app/api/public/site-settings/route.ts
?? src/app/cam/alidot/tiktok-review/TikTokReviewForm.tsx
?? src/app/cam/alidot/tiktok-review/page.tsx
?? src/components/alidot/AlidotPolicyDocument.tsx
?? src/components/alidot/AlidotPublicShell.tsx
?? src/components/ui/PublicLink.tsx
?? src/lib/alidot-legal.ts
?? src/lib/article-publication-date.ts
?? src/lib/legal-company-name.ts
?? src/lib/public-article-preview.ts
?? src/lib/public-settings-client.ts
?? src/lib/public-site-settings.ts
?? src/lib/seo-copy.ts
?? src/lib/site-type-options.ts
?? src/lib/tiktok-review/fixture.ts
?? src/lib/tiktok-review/types.ts
?? src/lib/tiktok-review/validation.ts
?? tests/unit/alidot-public-pages.test.ts
?? tests/unit/article-publication-date.test.ts
?? tests/unit/auto-press-worker-dispatch.test.ts
?? tests/unit/d1-keyset-export.test.ts
?? tests/unit/d1-operations-regression.test.ts
?? tests/unit/home-seo-language-heading.test.ts
?? tests/unit/legal-company-name-script.test.ts
?? tests/unit/public-vercel-usage.test.ts
?? tests/unit/runtime-image-dependencies.test.ts
?? tests/unit/seo-copy.test.ts
?? tests/unit/site-type-consistency.test.ts
?? tests/unit/telegram-quota-fallback.test.ts
?? tests/unit/tiktok-review-auth.test.ts
?? tests/unit/tiktok-review-page-contract.test.ts
?? tests/unit/tiktok-review-validation.test.ts
```

## 부록 B. 숏줍 병행 변경 스냅샷

숏줍 저장소 전체 미구현 과제를 조사한 것이 아니라 컬피/MCP와 인접한 Git 상태만 기록한다. 타 작업자 파일은 수정하지 않았다.

```text
 M docs/shortjup-full-code-audit-remediation-rollout-report-2026-10-12.md
?? docs/culturepeople-d2-longjup-mcp-gateway-rollout-result-2026-10-15.md
?? docs/youtube-shorts-credits-only-verification-2026-10-12.json
```

두 결과 문서는 서로 다른 저장소에 같은 배포 결과를 보존한 것이다. 동일 파일명이라고 하나를 임의 삭제하지 않는다.

## 부록 C. 참고 자료

- [D-2 배포 결과](./culturepeople-d2-longjup-mcp-gateway-rollout-result-2026-10-15.md)
- [Vercel 사용 최소화](./vercel-usage-minimization-2026-10-10.md)
- [방문 통계 분석](./traffic-report-analysis-2026-10-14.md)
- [D1 quota 재발 방지](./d1-quota-recurrence-remediation.md)
- [운영 전수 감사](./post-production-deployment-audit-and-next-plan.md)
- [개발 마스터플랜](./development-master-plan.md)
- [백업 운영 계획](./culturepeople-backup-operations-plan.md)
- [로컬 백업 Runbook](./local-backup-runbook.md)
- [차단 정책 관리자](./auto-press-blocked-subject-admin-plan.md)
- [자체 기사화 로드맵](./culturepeople-original-editorial-automation-roadmap.md)
- [클라우드 주 실행·로컬 보조](./culturepeople-hybrid-local-cloud-publishing-plan.md)
- [알리닷 공개 페이지](./tiktok-alidot-public-pages-plan.md)
- [알리닷 내부 영상 UI](./tiktok-alidot-admin-review-console-plan.md)

연락처 변경·캐시 수정 증빙은 native 릴리스의 `.release-manifests/contact-email-{gate,release,promotion}.json` 및 `.ops-audit-runs/contact-email-*.json`을 사용한다. 민감 원본 migration backup은 이 문서/저장소에 복사하지 않는다.
