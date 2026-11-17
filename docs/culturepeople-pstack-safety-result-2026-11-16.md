# 컬피 pstack 운영 안전장치 적용 결과

기준일: 2026-11-16 KST. 대상 작업본은 `/home/arbada/projects/culturepeople/monet-registry-main`이다.

## 적용 범위와 현재 판정

이번 작업은 앞서 확인한 6개 개선 대상을 처리한다. 코드 검증과 실제 백업 전환을 구분한다. 기존 dirty 변경, 노트북 원본, 키, 암호화 보관본은 삭제하거나 일괄 커밋하지 않는다.

| 대상 | 반영 내용 | 상태 |
| --- | --- | --- |
| 백업 테스트 CI 연결 | `test:desktop-backup`과 GitHub CI 실행 단계 추가 | 코드 반영. 원격 CI 실행은 미확인 |
| 실제 복원 증거 기반 전환 | `backup:desktop:readiness`로 고정 runtime, 인증 파일, 리허설 증거, 예약 증거를 개별 판정 | 검사 구현. 실제 전환 blocked |
| dry-run 성공 오인 방지 | 사전 점검 계획은 `ok: null`, `state: planned`; 실행 성공만 `ok: true` | 구현 및 동작 테스트 |
| 무한 대기와 후속 호출 방지 | 단계당 기본 600000ms 제한, 필수 단계 실패 후 남은 검사 skipped | 구현 및 실제 대기 자식 프로세스 종료 테스트 |
| 읽기 인증과 권한 구분 | `SELECT 1` 성공은 조회 가능 증거일 뿐 읽기 전용 권한 증거가 아님을 출력 | 구현. 실제 토큰 권한은 미확인 |
| 누적 변경 분리 | 기존 change-group 명령에 백업, 사전 점검, AI, 홈, 재시도, 개발 환경, 문서 그룹 추가 | 현재 HEAD 대비 누락 분류 0건 확인 |

적용한 pstack 원칙은 `prove-it-works`, `sequence-verifiable-units`, 경계 검증, 명시적인 상태 모델링이다. dirty 작업본을 정리하기 위해 rebase/reset/clean을 하지 않았다.

## 재실행 명령

저장소 루트에서 실행한다. 아래 로컬 검사에는 운영 DB 쓰기나 유료 모델 호출이 없다.

```bash
pnpm test:desktop-backup
pnpm test:unit --maxWorkers=2 --testTimeout=120000
pnpm ci:typecheck
pnpm ci:lint
pnpm check:local-backup
pnpm check:auto-press-agent-loop
pnpm predeploy:ops-check -- --dry-run --json
pnpm backup:desktop:readiness
node scripts/change-group-report.mjs --base=HEAD --fail-on-unmatched --json
```

`backup:desktop:readiness`는 준비되지 않은 항목이 있으면 종료 코드 1을 반환한다. 이 명령은 마운트, 백업, 예약 변경을 실행하지 않는다. 설치된 runtime의 hash manifest도 수정하지 않는다.

`predeploy:ops-check`의 `--timeout-ms`는 1~7200000 범위의 정수다. 제한시간은 단계별이며 전체 작업 제한시간이 아니다. 필수 검사가 실패하면 후속 검사를 호출하지 않는다. 선택 검사의 실패는 후속 검사를 막지 않는다. timeout은 직접 실행한 자식 프로세스에 적용되며 하위 프로세스 트리 전체 종료를 보장하는 작업 관리자 기능은 아니다.

Windows에서도 Node 검사와 change-group 명령을 사용할 수 있다. 데스크톱 백업 runtime은 Linux의 fcntl, findmnt, gocryptfs, systemd를 사용하는 기존 호스트 전용 어댑터다. Windows에서 이를 그대로 실행한다고 문서화하지 않는다. Windows 복귀 시 Node 백업 스크립트와 Task Scheduler 절차를 사용하고 별도 검증한다. 새 Python 명령은 `python3`가 필요하며 Windows에서는 설치 환경에 따라 `py -3`를 사용한다.

## 실제 백업 전환이 막힌 이유

직접 검사한 결과는 다음과 같다.

- 고정 백업 runtime SHA와 clean 상태 검사 통과.
- `/home/arbada/.config/culturepeople/desktop-backup.env` 없음.
- `/home/arbada/.config/culturepeople/desktop-backup-cutover.json` 없음.
- `culturepeople-desktop-backup.timer`는 disabled.
- 문서에 기록된 노트북 주소 `192.168.31.198:22`는 현재 연결 거부. 이 데스크톱에는 노트북의 전용 SSH 개인키도 없다. 키를 복제하거나 호스트 키 검증을 끄지 않았다.

따라서 이번 작업은 새 D1 전체 백업이나 두 디스크의 실제 최신 백업 복원, 노트북 예약 중지, 데스크톱 예약 활성화를 완료한 것이 아니다. 기존 합성 fixture 결과를 운영 완료 증거로 바꾸지 않는다.

인증 연결은 데스크톱의 대화형 터미널에서 실행한다. 토큰을 채팅이나 명령 인자에 넣지 않는다.

```bash
python3 /home/arbada/projects/culturepeople/monet-registry-main/ops/desktop-backup/connect_d1.py
pnpm backup:desktop:readiness
```

토큰은 Cloudflare에서 대상 계정의 D1 읽기 권한으로 발급 여부를 별도로 확인한다. SELECT 성공만으로 쓰기 권한 부재를 선언하지 않으며, 확인 목적의 운영 DB 쓰기도 하지 않는다.

다음 전환 순서는 `docs/msi-desktop-backup-cutover-2026-11-16.md`를 따른다. 노트북 예약 중지 증거, 기존 키로 과거 자료 복원, 실제 새 백업, 서로 다른 두 archive 복원, off-host 키 복구 증거가 있어야 한다. 증거 JSON을 임의로 만들거나 boolean만 채워 전환하지 않는다.

## 누적 변경 검토 순서

분류는 내용 검토나 배포 승인이 아니다. `deployable` 역시 배포 완료나 테스트 통과를 뜻하지 않는다.

1. 백업 안전장치와 사전 점검: Python 테스트, Node 회귀, 타입 검사. 설치본 변경은 hash manifest와 실제 전환 검증을 동반해야 한다.
2. 개발 환경과 CI: 기존 lockfile 및 Node 24 변경을 별도 검토. package.json은 공유 파일이므로 이번 명령 추가와 기존 의존성 변경을 hunk 단위로 구분한다.
3. AI 제공사와 메일: 기존 변경 보존, provider 전환 회귀 확인. 실제 모델 호출은 별도 승인 범위다.
4. 재시도와 호출량: Worker 및 cron 변경의 회귀와 운영 반영 여부를 분리한다.
5. 공개 홈과 테마: 별도 브라우저 검증 및 배포 증거가 필요하다. 이번 안전장치 테스트가 화면 검증을 대신하지 않는다.
6. 문서와 출력물: 과거 스냅샷과 현재 상태를 구분하고 secret 및 개인정보 포함 여부를 검토한 뒤 보존한다.

`git add .` 또는 모든 dirty 변경의 일괄 커밋은 하지 않는다. 이번 작업에서는 커밋, push, Vercel 및 Worker 배포를 실행하지 않았다.

## 검증 기록

- Python 안전 검사: 19개 통과.
- 전체 Vitest: 135개 파일, 717개 테스트 통과(첫 전체 실행).
- `check:local-backup`, `check:auto-press-agent-loop`, `ci:lint` 통과.
- 첫 타입 검사에서 신규 테스트 mock의 반환 타입 문제 발견. mock을 실제 반환 계약에 맞게 수정하고 타입 검사 및 전체 테스트 재실행.
- 수정 후 `ci:typecheck` 종료 0, 전체 Vitest 재실행도 135개 파일 및 717개 테스트 통과. Python 재실행도 19개 통과.
- 현재 HEAD 대비 변경 분류는 73개 경로, unmatched 0개다. 이 수치는 검사 시점의 스냅샷이며 다른 작업이 이어지면 달라질 수 있다.
- 이번에 수정한 tracked 파일의 `git diff --check` 통과. 기존 change-group 파일 전체의 개행을 바꾸지 않고 추가한 구간만 수정했다.
- readiness는 인증과 전환 증거가 없어 종료 1. 의도한 운영 차단 결과다.
- 이번 수정 파일의 whitespace 검사는 별도로 확인한다. 전체 worktree에는 다른 작업자의 `src/app/page.tsx` CRLF 관련 whitespace 경고가 있어 임의 수정하지 않는다.
