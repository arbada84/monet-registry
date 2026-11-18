# 데스크톱 현재 D1 백업 전환

## 사용자 지시와 정정

사용자가 기존 백업을 중지했고 데스크톱에서 백업해야 한다고 명시했다. 이를 소유자의 이전 예약 중지 선언과 데스크톱 실행 승인으로 기록했다. 다시 노트북의 systemd 중지 증거를 받아야 한다고 요구하지 않는다. 이 선언을 SSH로 독립 관측한 결과처럼 기록하지 않는다.

옛 암호화 자료 복원 및 Supabase fallback 복구를 **현재 D1 신규 백업의 선행조건으로 둔 것은 과도한 연결이었다.** 기존 `full` 프로필은 유지하고 별도의 `current-d1` 프로필을 구현·설치했다. 새 백업의 기술 조건은 실제 Cloudflare 접근 인증, 올바른 두 저장 장치, 실제 백업·복원 성공이다.

## 설치한 구조

- 보호 설정: `~/.config/culturepeople/desktop-backup.json`, profile `current-d1`.
- 소유자 선언: `~/.config/culturepeople/desktop-backup-owner-handoff.json`, 0600. `basis=owner-declaration`, 독립 노트북 관측은 false.
- 이전 설정 보존: `~/.config/culturepeople/desktop-backup.pre-current-d1-20261118.json`.
- 설치 wrapper: `~/.local/lib/culturepeople-desktop-backup/runtime.py`. 설정의 실제 SHA-256도 갱신했다. Node 백업 스크립트는 기존 clean 고정 runtime을 사용한다.
- primary: `/run/user/1000/culturepeople-backup-vaults/primary/d1-current`.
- second: `/run/user/1000/culturepeople-backup-vaults/second/d1-current`.
- 두 경로는 기존 gocryptfs 암호화 보기다. 실제 backing UUID가 서로 다른지 계속 검사한다. 옛 `backups` 경로·아카이브를 덮어쓰지 않는다.
- D1 전체 사용자 테이블을 page size 250 / 요청 사이 300ms로 읽는다. 쓰기 SQL을 실행하지 않는다. Supabase와 이미지 다운로드는 실행하지 않는다.
- JSON → SQLite → 검증 → 로컬 복원 → 2차 복제 → 양쪽 복원 → 디스크별 암호화 archive 및 각각 secure restore 순서다.
- 새 archive는 이미 준비된 데스크톱 archive 키를 사용한다. 옛 archive 키를 기다리지 않는다. 옛 이미지·Supabase 자료가 새 D1 전용 백업에 포함됐다고 표시하지 않는다.
- 실제 D1 백업과 두 archive 복원이 성공한 뒤에만 일일 timer를 활성화한다. 성공 증거가 fixture이거나, 두 복원이 같은 archive를 가리키거나, 중간 단계가 실패하면 활성화하지 않는다.

## 실제 실행 결과

- Python 안전 검사 30개 통과.
- 설치된 wrapper로 두 실제 암호화 볼륨을 올려 `check` 실행 성공. transient invocation `03830326be24470491106f9243e1f1cb`. 이 검사는 장치·마운트·고정 runtime 검사이며 원격 기사 백업이 아니다.
- `activate_current_d1.py` 기본 dry-run 성공.
- `activate_current_d1.py --apply` 실제 시도: `desktop-backup.env` 없음으로 네트워크 요청 전에 중단. timer 활성화/새 백업 실행 없음.
- readiness: fixedRuntime / ownerHandoff 통과. credentials 없음, 실제 current D1 결과 없음.
- 프로젝트의 알려진 보호 설정·Wrangler 경로·이전 staging에서 사용 가능한 Cloudflare 인증 파일을 찾지 못했다. 비밀값을 출력하지 않았다. Vercel 인증은 Cloudflare 인증을 대신하지 못한다.

**현재 남은 최초 실행 장애물은 Cloudflare D1 접속 인증이다. 소유자 결정이나 옛 복호화 키가 아니다.** 실제 첫 실행 후 데이터/복원 오류가 발견되면 별도로 해결해야 하며, 아직 실행하지 않은 것을 성공으로 예측하지 않는다.

## 인증 연결과 즉시 전환

데스크톱 터미널에서 한 번 실행한다. 토큰을 채팅이나 명령 인자로 넣지 않고 숨김 입력한다.

```sh
python3 /home/arbada/projects/culturepeople/monet-registry-main/ops/desktop-backup/connect_d1.py --activate-backup
```

도구는 SELECT 1 성공 후 인증을 0600 파일에 저장하고 실제 백업·양쪽 복원을 실행한다. 검증이 성공하면 timer를 enable/start하고 실제 active 상태를 확인한다. 인증 연결만 됐다고 백업 성공으로 출력하지 않는다. SELECT 성공만으로 토큰에 쓰기 권한이 없다고 주장하지 않는다.

이미 인증이 연결돼 있다면:

```sh
python3 ops/desktop-backup/activate_current_d1.py
python3 ops/desktop-backup/activate_current_d1.py --apply
python3 ops/desktop-backup/runtime.py readiness
systemctl --user status culturepeople-desktop-backup.timer
journalctl --user -u culturepeople-current-d1-bootstrap.service -n 80 --no-pager
```

기본은 dry-run이며 `--apply`일 때만 백업/예약 변경을 한다. 활성화 중 인증·SQL 원문·토큰을 출력하지 않는다. 새 예약의 기존 시각은 03:20 및 최대 45분 분산이다.

## 보존과 rollback

노트북 데이터와 옛 archive 두 사본은 그대로 유지했다. 옛 키 확보·옛 Supabase/이미지 복원은 별도 후속 과제다. 새 키의 외부 복구 사본도 권장하지만, 소유자가 승인한 현재 D1 백업 실행을 옛 자료 복원과 다시 결박하지 않는다.

되돌릴 때 timer를 먼저 stop/disable하고 보호 설정을 보존된 이전 JSON으로 되돌린다. 새 백업·옛 백업·키를 삭제하지 않는다. 기존 `full` 프로필의 보수적인 검증을 몰래 완화하지 않았다.

Python/systemd wrapper는 Linux 전용이다. Windows에서는 고정 runtime의 기존 Node 백업·SQLite·verify·sync·restore 명령을 사용하고, 예약은 `local-backup-runbook.md`의 Task Scheduler 경로로 구성한다. 두 OS가 같은 SQLite에 동시에 쓰지 않는다. 이번 변경은 공개 홈페이지·Worker·DNS·AI 설정에 영향을 주지 않는다.
