# MSI 데스크톱 개발 서버 이전 계획

기준일: 2026-11-15 KST. 최초 작성은 읽기 전용 조사와 계획 수립이었다. 이후 사용자 승인으로 컬피 코드·개발 환경·전체 보관 백업과 증빙의 검증 복사를 진행했다. 실제 결과는 [MSI 이전 결과서](msi-desktop-migration-result-2026-11-15.md)를 우선한다. 노트북 원본 삭제와 운영 배포는 하지 않았다.

## 1. 목표와 이전 범위

개발 코드, 미커밋 작업, 문서, 필요한 검증 자료와 로컬 백업 업무를 MSI에서 이어갈 수 있게 한다. 노트북을 꺼도 기존 공개 사이트와 Fold3 운영은 계속 동작해야 한다.

여기서 “모두 이전”은 개발에 필요한 자료와 업무를 빠짐없이 분류해 이전한다는 뜻이다. 홈 디렉터리 덮어쓰기, 모든 인증 파일 복제, Vercel 웹사이트의 자체 호스팅 전환, Fold3 운영 서버 복제는 포함하지 않는다. 웹 호스팅 이전은 별도 기획과 승인이 필요하다.

| 장치 또는 서비스 | 목표 역할 | 그대로 유지할 것 |
|---|---|---|
| MSI | 주 개발 작업본, 빌드, 로컬 회귀, 전환 검증 후 컬피 백업 예약 실행 | 기존 네트워크·RDP·다른 사용자 작업 |
| 노트북 | 원본 보존, MSI 원격 접속, 복귀 수단 | 검증 완료 전 소스·백업 삭제 금지 |
| Fold3 | 숏줍 운영·큐·세션·미디어 정본 | 새 운영 노드 등록 금지 |
| NAS 및 별도 물리 디스크 | 독립된 복구본 | 같은 MSI 디스크의 두 폴더를 이중화로 계산하지 않음 |
| Vercel·Cloudflare | 기존 웹·Worker·D1·R2 운영 | DNS·Auth0·OAuth·도메인·운영 설정 유지 |
| GitHub | 검토된 코드 변경 전달 | 미커밋 작업 이전을 Git clone만으로 대체하지 않음 |

## 2. 근거와 현재 상태

### 2.1 이번에 직접 확인한 상태

| 항목 | 11월 15일 확인 결과 | 해석 |
|---|---|---|
| MSI SSH | Wi-Fi `192.168.31.91`, 기존 호스트 키 고정 접속 성공 | 전송 전 다시 확인 |
| 호스트 | `arbada-MS-7B89` | `.90`과 `.91`을 별개 서버로 취급하지 않음 |
| MSI 디스크 | `/dev/nvme0n1p2`, 약 1.8TB, 사용 60%, 가용 약 697GB | 인수인계의 가용 1.7TB는 과거 수치 |
| MSI 메모리 | 총 46GiB, available 약 44GiB | 빌드 동시 실행 수는 실제 측정 후 결정 |
| MSI Node | `/home/arbada/.local/bin/node`, `v24.16.0` | 새 Node 설치부터 시작하지 않음 |
| MSI Python·Git | Python 3.12.3, Git 2.43.0 | 각 프로젝트 lockfile과 호환성 별도 검사 |
| MSI pnpm | SSH 기본 PATH 및 확인한 `~/.local/bin/pnpm`에서 실행 확인 안 됨 | 미설치 확정 아님. 기존 설치 경로 조사 필요 |
| MSI 프로세스 | 사용자 프로세스명에 `rsync`, `photorec`, Codex, Herdr 등 존재 | 작업 내용·쓰기 대상 미확인. 중지하거나 기존 전송과 겹치지 않게 할 것 |
| MSI 예약 작업 | 현재 사용자 timer 목록에서 컬피 timer 없음 | 시스템 전체 cron·다른 사용자까지 확인한 것은 아님 |
| 숏줍 staging | 전달받은 staging 아래 `shorts-automation` 존재 | 이번에는 전체 checksum 재검사하지 않음 |
| 컬피 소스 | `/mnt/win_d/Users/Documents/monet-registry-main` | 현재 실재하는 작업 경로 |
| 컬피 HEAD | `64de8cd1547a807c9db67cf87bb4d998f9e59c5f` | 운영 배포 소스와 같다는 뜻은 아님 |
| 컬피 Git 상태 | 수정 파일 26개, 미추적 항목 12개 | 이 문서 추가 전 `git status --short` 기준. 미추적 디렉터리 내부 개수와 다름 |
| 컬피 `.git` | 약 650MB | 로컬 브랜치와 index도 보존 대상 |
| 컬피 백업 | repo 내부 `culturepeople-backups`, 약 33GB | 코드 일반 복사와 분리 |
| 홈 백업 경로 | `/home/arbada/culturepeople-backups`가 위 경로를 가리키는 symlink | 링크만 복사하면 자료가 이전되지 않음 |
| 노트북 예약 | 컬피 backup·image-backfill·health·weekly-restore 다음 실행 존재 | MSI와 동시에 활성화하지 않음 |

`du` 용량은 할당 공간의 반올림 값이다. 실제 전송 바이트·파일 수는 전송 manifest로 다시 산출한다. MSI 디스크 사용 증가 원인은 조사하지 않았다. 프로세스명만으로 복구 작업이 원인이라고 단정하지 않는다.

### 2.2 전달받은 완료 기록

숏줍 두 폴더는 11월 14일 1차 검증 복사 완료 기록이 있다. 일반 파일 11,007개, 최종 2,467,086,048바이트, checksum dry-run 종료 0, 추가 전송 0, 삭제 0, 당시 양쪽 HEAD `7d7b8144c8342201e31f3c999dee568d6e94f8a1`이다. 이 수치는 사용자 인수인계 기준이며 이번 재측정값은 아니다.

노트북의 `/home/arbada/.local/state/msi-migration/20261114/copy-result.md`도 확인했다. 이 파일의 최초 바이트 수와 후속 문서 반영 수치를 최종값과 혼동하지 않는다. 숏줍 원본 HANDOFF와 이전 기획서의 옛 “미연결·미전송” 기록보다 후속 복사 결과를 우선한다.

### 2.3 아직 확인하지 않은 것

MSI staging 전체 파일의 현재 무결성, 다른 디스크 용량, NAS 접근, 모든 프로젝트 최신 작업본, Claude 인증, 실제 RDP 사용성, 컬피 최신 백업 복원 상태, 독립 2차 사본의 최신 상태, 현재 운영 배포 SHA는 미확인이다. 과거 Supabase stale 일수·이미지 미확보 건수를 현재 실측처럼 재사용하지 않는다.

## 3. 전체 자료 목록과 목적지

다른 프로젝트도 이 목록에 포함하되, 컬피 세션에서 다른 서비스의 실행 설정을 바꾸지 않는다. 프로젝트별 담당자가 최신 HANDOFF를 확인한 뒤 진행한다.

| 묶음 | 원본 | MSI 목적지 제안 | 선행조건 |
|---|---|---|---|
| 숏줍 개발 | `/home/arbada/shorts-automation` | 기존 staging 검증 후 `/home/arbada/shorts-automation` | 복사 후 변경분, 외부 worktree 참조 확인 |
| 숏줍 프롬프트 | `/home/arbada/shortjup-new-prompts` | 기존 staging 검증 후 같은 홈 경로 | 승인본·근거·history·비Git 자료 보존 |
| 컬피 개발 | 현재 실재하는 `/mnt/win_d/Users/Documents/monet-registry-main` | `/home/arbada/projects/culturepeople/monet-registry-main` | 목적지 충돌·dirty 상태·참조 파일 조사 |
| 컬피 백업 | repo 내부 실제 백업 루트 | `/home/arbada/data/culturepeople-backups` | 로컬 복원 검증·보안 감사·전송 용량 확정 |
| 컬피 release·증빙 | 등록된 worktree, `.deploy-logs`, `.release-manifests`, 각 audit 디렉터리 | `/home/arbada/archives/culturepeople-migration/20261115/` | 실제 존재 여부, secret 포함 여부, 참조 관계 조사 |
| 타닥 | 최신 작업본 확정 필요 | `/home/arbada/projects/tadak/` 후보 | Android SDK/JDK·생성물·원본 분류 |
| 돈줍 | 최신 작업본 확정 필요 | `/home/arbada/projects/donjup/` 후보 | 로컬 DB와 유지보수 timer 소유권 별도 계획 |
| TradeJoop | 최신 작업본 확정 필요 | `/home/arbada/projects/tradejoop/` 후보 | 거래 실행·관찰·주문 권한을 개발 복사와 분리 |
| 기타 자료 | 사용자 스킬·도구 소스·미완료 연구·첨부·대화 증빙 | 프로젝트별 archive | 전체 홈 자동 병합 금지, 누락 목록 작성 |

위 표는 계획 수립 당시 제안이다. 후속 실행에서 컬피 개발 경로와 별도 staging을 만들었고, 백업은 평문 data 경로가 아닌 staging 상위 `encrypted/`에 암호화 보관했다. 나머지 실제 상태는 결과서를 확인한다. MSI에 같은 이름의 자료가 있으면 별도 staging을 만들고 대조하며 이미 개발 중인 작업본 위에 덮어쓰지 않는다.

### 컬피 Git 관계 주의

현재 등록 worktree는 4개다. main 외에 홈의 `culturepeople-release-seo-20260807`, 예전 마운트의 `.claude/worktrees/suspicious-lewin-b741dc`, `/tmp/culturepeople-alidot-release`가 기록되어 있다. 뒤 두 항목은 Git에서 prunable로 표시되지만 삭제해도 된다는 증거는 아니다.

각 `.git` 파일과 common-dir, 로컬 전용 브랜치, 미커밋·미추적 파일을 따로 보존한다. `git worktree prune`, `git clean`, reset, 일괄 commit을 하지 않는다. MSI 사본의 worktree 경로 수리는 원본 관계를 기록하고 사본에서만 수행한다. 주 저장소 `.git`을 보존해도 별도 worktree의 미커밋 파일까지 자동 보존되는 것은 아니다.

## 4. 이전할 자료의 분류

| 분류 | 처리 |
|---|---|
| 소스·문서·tests·AGENTS·lockfile·미커밋·미추적 | Git 이력과 실제 파일 둘 다 복사하고 hash 대조 |
| `.deploy-logs` 등 운영 증빙 | 비밀 검사 후 별도 비공개 archive. 필요한 참조는 경로 대응표로 유지 |
| `node_modules`, `.next`, venv, 캐시 | 재생성. 외부 의존성 symlink는 위치만 기록하고 대상 환경 재구성 |
| `.env*`, Vercel·Cloudflare·SSH·OAuth·메일 인증 | 일반 복사 제외. 필요한 권한만 별도 보안 절차로 설정 |
| 백업 JSON·SQLite·manifest·미디어 | 일반 코드 필터에서 제외한 뒤 별도 백업 전송에 반드시 포함 |
| 실행 중 DB/WAL/SHM | 단순 파일 복사 금지. 소유 서비스의 일관된 snapshot 절차 사용 |
| 대화·Codex·Claude·Herdr 기록 | 필요한 기록만 비공개 archive. 인증·소켓·실행 DB와 분리 |

`.gitignore`는 전송 제외 목록이 아니다. ignored 문서·증빙·데이터도 필요한지 조사한다. 반대로 `.git/config`, 과거 커밋, 로그에 인증이 들어 있을 수 있으므로 `.git`이라고 무조건 공개 가능한 자료로 보지 않는다. symlink 대상이 staging 밖이면 목록에 남기고 `rsync -L`로 무작정 따라가지 않는다.

전체 raw 백업에는 설정·메일·관리자 정보 등 민감 자료가 포함될 수 있다. SSH 전송만으로 저장 시 암호화가 보장되지 않는다. MSI 저장소 암호화 여부와 접근 권한을 확인하고, 미충족이면 암호화 사본만 먼저 이전한다. NTFS의 mode를 Linux에 그대로 복제해 평문 777 자료를 만들지 않는다. 목적지 디렉터리 0700, 민감 일반 파일 0600을 기본으로 하고 실행 파일 권한은 분류해 설정한다.

## 5. 실행 단계와 통과 조건

### 0단계. 범위와 장치 재확인

SSH 호스트·현재 IP·남은 공간·기존 전송 작업·프로젝트 목적지 충돌을 다시 확인한다. 호스트 키가 달라지면 중단하고 사용자 또는 별도 신뢰 경로로 확인한다. 호스트 키 검증을 끄지 않는다.

최소 필요 공간은 전송 대상 실제 바이트 + 재설치 의존성 + 빌드 최대 사용량 + 롤백 보관량 + 안전 여유로 계산한다. 초기 작업 기준 MSI 가용 200GB 이상도 함께 요구하되 이것만으로 용량 검증을 대신하지 않는다. 필요한 양이 697GB를 넘으면 archive 보관 위치를 먼저 정한다. 기존 `photorec`·`rsync` 작업 소유자와 I/O 사용량을 확인하기 전 대량 checksum·전송을 겹치지 않는다.

### 1단계. 변경 동결 전 목록 확보

원본별 HEAD, branch, staged·unstaged patch, 미추적 전체 목록, submodule, worktree, symlink, 외부 참조, 크기를 manifest로 남긴다. patch만 보존하면 미추적 파일이 빠지므로 파일 사본도 필요하다. secret 값은 manifest에 쓰지 않는다.

컬피의 11월 13일 GPT 전환 변경은 미커밋 상태로 존재한다. 이 구현을 놓치거나 이전을 이유로 운영 적용 완료로 바꾸지 않는다. 검증 기록과 실제 deployment를 분리한다.

### 2단계. 코드 staging 복사

컬피는 `/home/arbada/.migration/20261115-culturepeople-laptop-copy/` 같은 독립 경로에 먼저 보존한다. 적용 전 전송 필터와 dry-run을 검토한다. `--delete`, `--remove-source-files`, `git add .`를 사용하지 않는다. 이번 단계에서 노트북 writer는 계속 동작할 수 있으므로 결과는 1차 사본이다.

신규 구현 필요: `migration-code-filter.rules`와 파일 manifest 생성·검증 도구. 기존 숏줍 필터를 컬피에 그대로 쓰지 말고 컬피의 백업·배포 증빙·ignored 자료별 포함 여부를 확인한다. 이 기획에서는 범용 rsync 명령을 곧바로 실행 가능한 이전 스크립트처럼 제공하지 않는다.

### 3단계. 개발 환경 재구성

Node는 확인된 24.16.0과 repo `engines: 24.x`, `.nvmrc`를 대조한다. pnpm은 `packageManager`의 9.12.2를 사용한다. 기본 PATH의 실행 파일뿐 아니라 비대화형 SSH·systemd에서도 같은 버전인지 확인한다.

설치 lifecycle script와 네트워크 접근을 확인한 뒤 `pnpm install --frozen-lockfile`로 재구성한다. 외부 registry 접근은 발생하지만 모델 호출은 하지 않는다. Playwright/Puppeteer 브라우저 다운로드와 OS 라이브러리는 별도 설치 용량으로 계산한다. Python 3.12는 존재하므로 프로젝트별 요구사항에 맞는 새 venv만 만든다. Windows node_modules나 노트북 바이너리를 복사해 재사용하지 않는다.

신규 MSI `.env.local`에는 초기부터 운영 credential을 넣지 않는다. 로컬 테스트의 원격 DB fallback을 먼저 차단하고 fixture·임시 DB로 검사한다. 빌드 코드가 운영 API나 모델을 부르는지 조사한 뒤 안전한 build만 허용한다. Claude·Codex는 설치·인증 유무만 확인하고 유료 시험 호출은 하지 않는다. Gemini/Antigravity 협업 중지는 그대로다.

### 4단계. 백업 자료 복사와 복원 검증

첫 전송은 최신 백업만으로 복원 가능한 최소 사본을 먼저 만들 수 있다. 그러나 최종 “전부 이전” 완료 조건에는 보관 대상 전체 timestamp 폴더, raw D1/Supabase export, merged SQLite, 전체 `_media-store`, 각 media manifest·`media-url-index.json`, 필요한 logs·암호화 증빙이 포함된다. 보관 제외 항목은 사유와 원본 위치를 별도 기록한다.

`backup:local:sync-copy`는 로컬 파일시스템 대상 도구이며 SSH 원격 경로를 받는 도구로 취급하지 않는다. 최신 사본 중심 동작이므로 이것만 실행해 모든 과거 백업을 옮겼다고 표시하지 않는다. 원격 전송은 별도 rsync와 checksum 검증 또는 승인된 암호화 운반 절차로 진행한다.

1. 원본 최신 completed backup의 manifest·SQLite·미디어 참조를 검증한다.
2. MSI의 비활성 staging으로 초기 전송한다. 실행 중 snapshot과 lock은 완료본으로 간주하지 않는다.
3. 최종 전송 창에 노트북 컬피 backup·image-backfill timer를 멈추고 현재 실행 완료를 기다린다. 진행 중 작업 강제 종료는 피한다.
4. checksum 최종 차이 반영 후 MSI에서 실제 restore-check와 media 참조 검증을 실행한다.
5. 과거 백업 포함 전체 보관 대상 manifest와 경로가 일치하는지 확인한다. 절대경로로 원본 노트북 파일을 우연히 읽어 통과하지 않게 한다.
6. 기존 독립 2차 사본은 유지한다. MSI 디스크 내 추가 복제본을 별도 물리 사본으로 표시하지 않는다.

Supabase 원격 복구나 미확보 이미지 회복은 장치 이전으로 해결되지 않는다. 최신 fallback과 미확보 목록을 누락 없이 옮기고 그대로 경고한다. 이전을 이유로 이미지 URL rewrite·대량 다운로드를 하지 않는다.

### 5단계. 백업 예약 업무 전환

현 `ops/systemd`의 네 서비스는 `CULTUREPEOPLE_DISK_UUID=96B82074B8205551`에서 repo와 백업 경로를 만든다. MSI 디스크 UUID나 repo 배치와 맞지 않으므로 그대로 설치하면 안 된다.

신규 구현 필요: 서비스에서 개발 repo와 백업 root를 분리해 명시적으로 받는 경로 설정. 고정된 홈 경로 또는 올바른 mount 확인을 사용하고, 폴더가 없을 때 빈 곳에 새 백업을 만들지 않게 실패 처리한다. `scripts/lib/backup-root.mjs`의 실제 우선순위는 환경변수 → 존재하는 홈 백업 경로 → repo 내부다. MSI에서는 `CULTUREPEOPLE_BACKUP_ROOT=/home/arbada/data/culturepeople-backups`를 명시한다. 기존 문서의 “항상 repo 기본” 설명과 차이를 경로 관련 후속 수정에 반영한다.

전환 순서는 노트북 writer 중지·drain → 마지막 복사·MSI 복원 통과 → MSI에서 제한된 수동 백업 1회 → 결과 검증 → MSI timer만 enable이다. 노트북 timer의 원래 enabled 상태와 calendar를 기록해 rollback에 사용한다. health·weekly-restore도 새 root를 확인한 뒤 전환한다. 장치별 lock 파일은 서로를 막지 못하므로 “양쪽 lock이 있으니 안전”하다고 판단하지 않는다.

MSI 수동 백업은 이 단계에서 별도로 승인된 제한 실행으로만 진행한다. 실제 쓰기 대상은 로컬 백업이며 원격 D1은 읽기만 수행해야 한다. 이전 전체에 필요한 새 export·이미지 백필을 자동으로 묶지 않는다. 사용자 로그인 없이 timer가 필요하면 linger와 부팅 후 PATH를 검증한 뒤 설정한다. 기존 서비스를 무조건 재설치하지 않는다.

### 6단계. 주 개발 작업본 전환

프로젝트별 원본 에디터·에이전트의 쓰기를 잠시 멈추고 최종 증분 전송과 checksum을 실행한다. MSI HEAD·index·미커밋·미추적 목록이 원본과 일치해야 한다. 그 뒤 staging을 보존한 상태에서 안정된 작업 경로로 전환한다. 같은 프로젝트를 양쪽에서 동시에 편집하지 않는다.

전환 이후 새 변경은 Git으로 전달한다. 미검토 dirty 전체 커밋을 요구하지 않으며, 다른 작업자 변경은 기능별로 검토한다. Codex/Herdr의 새 세션 cwd와 HANDOFF에 MSI 정본을 명시한다. 과거 앱 대화·PTY가 파일 복사만으로 자동 재개된다고 약속하지 않는다.

### 7단계. 나머지 프로젝트와 관찰

숏줍 기존 staging 검증, 컬피 코드·백업 전환, 타닥·돈줍·TradeJoop 등 프로젝트별 개발 전환 순으로 진행한다. 운영 관련 DB·timer는 각 담당 인수인계에 따라 별도 전환한다. 돈줍·TradeJoop timer를 컬피 작업에서 중지하지 않는다.

컬피는 일간 백업 2회 성공과 주간 복원 1회 성공, MSI 재부팅 후 접속·예약 경로 확인, 독립 2차 사본 복원을 완료하면 안정화로 표시한다. 다른 프로젝트는 각각 테스트 기준을 충족해야 한다. 전체 완료 전에도 노트북 원본 삭제는 별도 사용자 승인 없이는 하지 않는다.

## 6. 검증 명령

아래 package 명령은 현재 `package.json`에 존재한다. 후속 실행에서는 원격 credential 없는 MSI 사본에서 typecheck·단위 검사·빌드를 통과했고, 암호화 사본을 RAM에 복원해 검사했다. 평문 운영 백업 root가 준비됐다는 뜻은 아니다. 실제 실행 조건과 수치는 결과서를 확인한다.

### 접속 재확인

```bash
ssh -o BatchMode=yes -o StrictHostKeyChecking=yes \
  -o HostKeyAlias=192.168.31.90 -o IdentitiesOnly=yes \
  -o ConnectTimeout=6 -i /home/arbada/.ssh/msi_remote_ed25519 \
  arbada@192.168.31.91 'hostname; df -h /home; node --version; python3 --version'
```

개인키는 노트북에 둔다. 네트워크가 바뀌면 먼저 기존 `msi-vpn` 별칭의 호스트·검증된 키를 대조한다. 정상 Wi-Fi failover는 수정하지 않는다.

### MSI 개발 검증

```bash
cd /home/arbada/projects/culturepeople/monet-registry-main
node --version
pnpm --version
pnpm install --frozen-lockfile
pnpm ci:typecheck
pnpm test:unit
pnpm check:local-backup
pnpm check:auto-press-agent-loop
```

`pnpm build`는 build 시 네트워크·env 동작 점검 후 별도로 실행한다. 공개 브라우저 검사는 운영 DB와 격리한 fixture 서버에서 수행한다. build와 unit runner의 native 의존성 경로 변경이 충돌할 수 있으므로 처음에는 직렬 실행한다.

### MSI 백업 검증

```bash
export CULTUREPEOPLE_BACKUP_ROOT=/home/arbada/data/culturepeople-backups
pnpm backup:local:status -- --root "$CULTUREPEOPLE_BACKUP_ROOT"
pnpm backup:local:restore-check -- --root "$CULTUREPEOPLE_BACKUP_ROOT"
pnpm backup:security:audit -- --root "$CULTUREPEOPLE_BACKUP_ROOT"
pnpm ops:audit -- --root "$CULTUREPEOPLE_BACKUP_ROOT"
pnpm predeploy:ops-check -- --root "$CULTUREPEOPLE_BACKUP_ROOT" --dry-run
```

로컬 증거만 검사하도록 `ops:audit`에 `--base`를 붙이지 않는다. 감사 명령의 실제 동작과 보고서 저장 위치도 실행 전에 확인한다. 이전 전용 전송 manifest 검증과 예약 작업 소유자 검사는 신규 구현 필요다.

### Windows 대체 절차

Windows 복귀 시 Node24와 같은 pnpm 버전을 사용하고 `$env:CULTUREPEOPLE_BACKUP_ROOT`를 실제 Windows 경로로 지정한다. Node 기반 검증 명령은 공통으로 사용한다. `python3`가 없으면 스크립트의 Python 호출 방식과 `py -3` 대체 가능 여부를 확인한다. systemd 대신 Task Scheduler에 같은 명령을 등록하되 Linux 쪽 writer부터 중지한다. Windows에서도 같은 공유 SQLite에 직접 쓰지 않는다.

## 7. 인증과 외부 서비스 인계

권한을 여는 순서는 Git 읽기 → 개발 검증 → Git push → 백업용 제한 권한 → 필요한 경우에만 프로젝트별 배포 권한이다. 기존 권한을 무조건 복제하지 않는다.

Vercel 토큰, Cloudflare, Supabase, Telegram, 메일, MCP의 Auth0·OAuth, Codex·Claude 로그인은 별도 인증이다. MSI에 필요한 것만 안전한 대화형 입력 또는 승인된 암호화 전송으로 설정하고 값을 채팅·로그·Git에 출력하지 않는다. SSH 개인키와 인증된 브라우저 프로필을 일괄 복사하지 않는다.

API 키를 `.env.local`에 두는 기존 앱 방식을 사용할 때도 일반 코드 전송과 분리한다. 파일 0600, ignore, 필요한 실행 사용자만 접근 가능한지 검증한다. 암호화 백업 키는 백업 본체와 별도로 보관하고 키가 존재한다는 이유만으로 복원 가능하다고 판단하지 않는다.

GitHub 연결·Vercel 소유자 문제, GPT 전환 미배포, API 과금은 이전 과정에서 임의로 변경하지 않는다. Gemini/Antigravity는 재개 확인 전 협업 호출을 하지 않는다. auto-news·뉴스레터 중지도 유지한다.

## 8. 완료 조건과 복귀

| 판정 | 필요한 증거 | 불합격 시 |
|---|---|---|
| 자료 복사 완료 | 전체 대상 manifest·hash·제외 사유·dirty 차이·참조 대응표 | 원본 보존, 재전송 |
| 개발 환경 완료 | 버전·typecheck·unit·안전한 build와 fixture 검사 | MSI를 주 작업본으로 전환하지 않음 |
| 백업 이전 완료 | 전체 보관 대상·최신 복원·미디어 참조·독립 사본·단일 writer | MSI timer 활성화 보류 |
| 주 작업본 전환 완료 | 에이전트 cwd·문서·Git 전달·편집 담당 일치 | 양쪽 편집 중지 후 차이 대조 |
| 운영 안정화 | 일간 2회·주간 복원·재부팅 후 접속과 실행 증거 | MSI writer 중지·drain 후 노트북으로 복귀 |

개발 rollback은 MSI에서 생긴 미커밋 변경도 보존한 뒤 노트북으로 차이를 반영한다. 오래된 노트북 작업본부터 편집하기 시작하지 않는다. 백업 rollback은 MSI writer 중지 → 완료 상태 확인 → 필요한 최신 파일 반영·검증 → 노트북 timer만 복원 순서다. 코드 이전 실패를 이유로 공개 Vercel이나 Fold3를 rollback할 필요는 없다.

## 9. 가장 먼저 진행할 작업

먼저 MSI 용량·기존 I/O 작업과 전체 프로젝트의 최신 원본을 확인하고 비밀을 제외한 전송 manifest와 필터를 만든다. 이어 이미 복사된 숏줍 자료를 재검증하고 컬피 코드와 약 33GB 백업을 별도 staging에 준비한다.

신규 구현 필요 항목은 전송 manifest 검증, 컬피용 필터, 옛 절대경로 감사, MSI 서비스 경로 설정과 단일 writer 검증이다. 기존 package script로 표시하지 않는다. 기존 backup·status·restore·security 명령은 재사용한다.

### 다음 실행 요청문

> 이 계획서와 각 프로젝트의 AGENTS/HANDOFF를 읽고 MSI 이전 0~2단계를 진행해줘. 호스트 키 검증과 기존 I/O 작업을 확인하고 최신 원본·dirty 파일·외부 worktree·참조 데이터를 목록화해. 비밀정보를 제외하는 전송 manifest와 프로젝트별 필터를 먼저 만들고 검증해. 코드 staging은 dry-run 후 단방향 복사하고 checksum으로 대조해. 백업은 코드와 분리해 보안·일관성을 검토하되 실제 전송과 예약 전환은 4~5단계 조건을 충족한 뒤 진행해. 기존 staging에 새 변경이 있으면 덮어쓰지 말고 분리해. 노트북 원본 삭제, 서비스 시작, timer 전환, 인증 일괄 이전, 모델 호출, 배포는 하지 말고 실제 진행 범위와 잔여 항목을 이 문서에 기록해줘.
