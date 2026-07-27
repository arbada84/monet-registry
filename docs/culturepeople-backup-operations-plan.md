# CulturePeople 백업 운영 개선 기획서

작성일: 2026-07-14  
범위: 백업, 복원, 이미지 보관, 2차 백업, 운영 경고, Linux/Windows 운영 절차  
제외 범위: 네이버뉴스/다음뉴스 자동 송고, 심사/제휴 준비, 운영 DB 대량 쓰기

## 1. 목적

이 문서의 목적은 "백업 파일이 생성되는가"가 아니라 "컬처피플 자료를 실제로 복원할 수 있고, 자동 백업이 장기간 조용히 실패하지 않게 운영되는가"를 기준으로 백업 체계를 개선하는 것이다.

현재 D1 중심 최신 기사 백업과 SQLite 복원 리허설은 정상화됐다. 다만 Supabase 프로젝트가 `project_unreachable_or_paused` 상태라 Supabase live export와 남은 이미지 4025개 확보는 막혀 있다. 따라서 즉시 개발 가능한 작업은 2차 백업, 실패 알림, 주간 restore-check, 마운트 경로 안정성 강화이며, Supabase fresh export와 이미지/R2 이전은 대표자 콘솔 복구 이후 진행한다.

## 2. 현재 백업 구조

### 실제 백업 위치

컬처피플 백업 본체는 1.8TB 드라이브 안의 repo-local 폴더에 있다.

```bash
findmnt -rnS UUID=96B82074B8205551 -o TARGET
```

2026-07-14 확인 기준 실제 마운트 위치는 다음과 같다.

```text
/media/arbada/96B82074B82055511
```

실제 백업 루트:

```text
/media/arbada/96B82074B82055511/Users/Documents/monet-registry-main/culturepeople-backups
```

현재 백업 크기:

```text
약 8.9G
```

### 홈 symlink 구조

기존 홈 경로는 실제 데이터가 아니라 호환용 symlink다.

```text
/home/arbada/culturepeople-backups
-> /media/arbada/96B82074B82055511/Users/Documents/monet-registry-main/culturepeople-backups
```

운영 스크립트나 과거 명령이 `~/culturepeople-backups`를 사용해도 현재 실제 1.8TB 드라이브 백업으로 연결된다.

### 1.8TB 드라이브 자동 마운트 경로 변동

Linux Mint 자동 마운트는 같은 NTFS 드라이브라도 항상 같은 디렉터리명을 보장하지 않는다. 기존 문서와 일부 설정은 `/media/arbada/96B82074B8205551`을 가리켰지만, 현재는 `/media/arbada/96B82074B82055511`로 마운트됐다.

이 문제 때문에 2026-07-09 이후 systemd 백업/이미지 작업이 `cd: ... No such file or directory`로 실패했다. 2026-07-14에 실제 설치된 user systemd 서비스와 repo 템플릿은 디스크 UUID를 기준으로 현재 마운트 위치를 찾도록 수정했다.

### UUID 기반 systemd 경로 탐색

현재 user systemd 서비스는 고정 경로 대신 아래 UUID를 사용한다.

```text
CULTUREPEOPLE_DISK_UUID=96B82074B8205551
```

서비스 실행 시 다음 방식으로 현재 마운트 위치를 찾는다.

```bash
MOUNT_ROOT="$(findmnt -rnS "UUID=$CULTUREPEOPLE_DISK_UUID" -o TARGET | head -n 1)"
CULTUREPEOPLE_REPO="$MOUNT_ROOT/Users/Documents/monet-registry-main"
CULTUREPEOPLE_BACKUP_ROOT="$CULTUREPEOPLE_REPO/culturepeople-backups"
```

관련 파일:

- `ops/systemd/culturepeople-local-backup.service`
- `ops/systemd/culturepeople-local-image-backfill.service`
- `/home/arbada/.config/systemd/user/culturepeople-local-backup.service`
- `/home/arbada/.config/systemd/user/culturepeople-local-image-backfill.service`

### 백업 데이터 구조

각 백업은 timestamp 폴더로 생성된다.

```text
culturepeople-backups/
  _media-store/
  _logs/
  _image-backfill-runs/
  _reports/
  media-url-index.json
  2026-07-13T16-01-29-979Z/
    raw/
      d1/
      supabase/
    merged/
      articles.json
      articles.ndjson
      culturepeople.sqlite
      merge-report.json
      media-candidates.json
    media/
      media-manifest.json
    backup-manifest.json
```

D1과 Supabase 원천 export는 `raw/d1`, `raw/supabase`로 분리 보관한다. 통합 기사 백업은 `merged/articles.json`과 `merged/culturepeople.sqlite`가 기준이다. 이미지 후보와 로컬 확보 상태는 `media/media-manifest.json`, `_media-store`, `media-url-index.json`에 기록된다.

## 3. 현재 건강 상태 요약

### 정상 항목

- 최신 백업: `2026-07-15T18-40-19-724Z`, KST 기준 `2026-07-16 03:42` 완료.
- `pnpm backup:local:status`: 통과.
- `pnpm backup:local:restore-check`: 통과.
- `pnpm ops:audit`: 통과.
- 통합 기사 수: `3795`.
- D1/Supabase raw rows: `34029/3095`.
- SQLite snapshot: `merged/culturepeople.sqlite`, 약 `113MB`.
- 복원 리허설: 최신 SQLite copy 생성, integrity check, sampled media `50/50` 확인.
- 백업 timer: active.
- 이미지 backfill timer: active.
- CulturePeople 관련 failed systemd unit: 없음.
- 백업 lock: clear.
- 2차 백업: `/home/arbada/culturepeople-backups-second-copy`, latest backup 일치, restore-check 통과.
- 1.8TB 드라이브 여유: 약 `118GB`, 사용률 약 `92.9%`.

### 경고 항목

- Supabase source가 `local_fallback`.
- Supabase fallback age가 약 `58.2일`, 기준 `3일` 초과.
- Supabase live export error: `fetch failed`.
- 이미지 백업은 `4034/8059`, 약 `50.1%`.
- 남은 이미지 `4025개`는 `ifducnfrjarmlpktrjkj.supabase.co` DNS/접근 문제로 deferred.
- 최근 24시간 이미지 backfill은 실행됐지만 신규 파일 `+0`.
- 1.8TB 드라이브 사용률이 `92.9%`라 90% warning 기준을 넘었다. 자동 삭제는 금지하고 정리 후보만 별도 검토한다.

### Blocked 항목

- Supabase fresh export: `project_unreachable_or_paused` 해소 전 blocked.
- Supabase Storage 이미지 4025개 확보: Supabase host 접근 복구 전 blocked.
- R2 production URL rewrite: 이미지 100% 로컬 확보와 rollback mapping 검증 전 blocked.
- Supabase fallback stale 해소: 대표자 dashboard 확인 전 blocked.

### 대표자 콘솔 확인 항목

- Supabase dashboard에서 프로젝트가 paused 상태인지 확인하고 필요 시 resume.
- project ref가 env URL의 `ifducnfrjarmlpktrjkj`와 일치하는지 확인.
- `images` bucket이 존재하고 접근 가능한지 확인.
- service role key가 교체됐거나 만료됐는지 확인.
- R2를 장기 저장소로 쓸지, 다른 object storage나 NAS를 쓸지 결정.

## 4. P0 과제

### P0-001. Supabase 복구 후 fresh export

- 목적: 오래된 Supabase local fallback 의존을 제거하고 D1/Supabase 2개 DB가 모두 최신인 통합 백업을 확보한다.
- 현재 상태: `project_unreachable_or_paused`, `local_fallback`, fallback age 약 `55.2일`.
- 개발 범위: `supabase:recovery-check` 통과 후 `backup:local:quiet`, `restore-check`, `status`를 순서대로 실행하는 안전 wrapper 검토. 기존 `ops:supabase-recovered-backup` script가 있다면 재사용한다.
- 제외 범위: Supabase dashboard resume, 결제, service role key 발급은 코드로 처리하지 않는다.
- 필요한 파일/스크립트 후보: `scripts/supabase-recovered-backup.mjs`, `scripts/supabase-recovery-check.mjs`, `scripts/run-local-backup-quiet.mjs`, `docs/culturepeople-ops-recovery-runbook.md`.
- 대표자 수동 작업: Supabase 프로젝트 resume, project ref 확인, `images` bucket 확인, service role key 확인.
- dry-run 명령: `pnpm supabase:recovery-check -- --require-storage`.
- apply 명령: Supabase ready 이후 `pnpm backup:local:quiet -- --root "$CULTUREPEOPLE_BACKUP_ROOT"`.
- 검증 명령: `pnpm backup:local:restore-check -- --root "$CULTUREPEOPLE_BACKUP_ROOT"`, `pnpm backup:local:status -- --root "$CULTUREPEOPLE_BACKUP_ROOT"`.
- 완료 기준: 최신 `backup-manifest.json`의 Supabase source가 `live_rest`, stale fallback warning이 사라짐.
- 실패/blocked 조건: recovery check가 `project_unreachable_or_paused`, `networkUnavailable`, 401/403을 반환.
- 리스크: 복구 직후 이미지 대량 재시도 시 부하가 커질 수 있으므로 `--max-new-media`를 낮게 유지한다.

### P0-002. 2차 백업 자동 동기화

- 목적: 1.8TB 드라이브 단일 장애에 대비해 별도 저장소에 복원 가능한 second copy를 만든다.
- 현재 상태: `/home/arbada/culturepeople-backups-second-copy` 생성 완료, latest timestamp 일치, restore-check 통과. 단, 같은 물리 디스크가 아니지만 루트 파티션 여유가 약 `62GB`라 장기 보관용으로는 부족하다.
- 개발 범위: 기존 `backup:local:sync-copy`를 이용해 target에 최신 백업, SQLite, manifests, media store, 최근 로그를 동기화. `backup:local:status`, `backup:local:restore-check-all`, `predeploy:ops-check`는 `--second-copy`, `CULTUREPEOPLE_BACKUP_SECOND_COPY`, `$HOME/.config/culturepeople/backup-second-copy-path` 순서로 2차 백업 경로를 자동 인식한다. `backup:local:quiet`는 설정된 2차 백업 경로가 있으면 새 백업 후 `sync-copy --apply`와 `restore-check-all`을 자동 실행한다.
- 제외 범위: 대표자가 선택하지 않은 외장디스크/NAS/R2 계정 생성.
- 필요한 파일/스크립트 후보: `scripts/sync-local-backup-copy.mjs`, `scripts/restore-local-backup-copies.mjs`, `scripts/local-culturepeople-backup-status.mjs`, 신규 systemd service/timer는 신규 구현 필요.
- 대표자 수동 작업: 2차 백업 대상 선택. 예: 다른 외장디스크, NAS, R2, 다른 로컬 드라이브.
- dry-run 명령: `pnpm backup:local:sync-copy -- --target <second-copy> --dry-run`.
- apply 명령: `pnpm backup:local:sync-copy -- --target <second-copy> --apply`.
- 검증 명령: `pnpm backup:local:restore-check -- --root <second-copy>`, `pnpm backup:local:restore-check-all -- --root "$CULTUREPEOPLE_BACKUP_ROOT"`, `pnpm backup:local:status -- --root "$CULTUREPEOPLE_BACKUP_ROOT"`.
- 완료 기준: second copy latest timestamp가 primary와 24시간 이내, second copy restore-check 통과.
- 실패/blocked 조건: target 미지정, target free space 부족, target이 primary 내부 경로, NTFS permission/metadata 차이.
- 리스크: 같은 물리 디스크 안의 다른 폴더는 진짜 2차 백업이 아니다.

### P0-003. 백업 실패/지연 알림

- 목적: 백업이 조용히 며칠씩 실패하는 상황을 막는다.
- 현재 상태: `backup:local:status`와 `ops:audit`은 경고를 출력하지만 별도 push 알림은 확정되지 않았다.
- 개발 범위: backup age > 24h, Supabase stale, image +0, disk 90/95%, lock stale, systemd failed unit을 감지해 Telegram 또는 로컬 report로 알림. Telegram 발송은 기존 설정 존재 여부 확인 후 구현한다.
- 제외 범위: secret 원문 출력, 운영 DB 쓰기, 대량 라이브 호출.
- 필요한 파일/스크립트 후보: `scripts/local-culturepeople-backup-status.mjs`, `scripts/culturepeople-ops-audit.mjs`, 신규 `scripts/backup-health-notify.mjs`는 신규 구현 필요.
- 대표자 수동 작업: Telegram bot/chat id 사용 여부 승인, 알림 받을 채널 결정.
- dry-run 명령: 신규 구현 필요 `pnpm backup:health:notify -- --dry-run`.
- apply 명령: 신규 구현 필요 `pnpm backup:health:notify -- --apply`.
- 검증 명령: `pnpm backup:local:status -- --json`, `pnpm ops:audit -- --json`, `systemctl --user --failed`.
- 완료 기준: 실패 조건이 있을 때 한 번만 명확히 알림, 정상 상태에서는 중복 알림 없음.
- 실패/blocked 조건: Telegram secret 없음, network unavailable, 알림 중복 폭주.
- 리스크: 알림에 경로와 secret이 섞이지 않도록 redaction 필요.

### P0-004. 주간 restore-check 자동화

- 목적: 백업 생성뿐 아니라 복원 가능성을 주기적으로 검증한다.
- 현재 상태: `pnpm backup:local:restore-check`는 존재하고 최신 백업에서 통과했다. 주간 자동 timer는 신규 구현 필요.
- 개발 범위: primary와 second copy에 대해 주 1회 restore-check 실행, 결과를 `_logs` 또는 `_reports`에 저장, 실패 시 알림과 연결.
- 제외 범위: 운영 DB 복원 apply, 프로덕션 서비스 전환.
- 필요한 파일/스크립트 후보: `scripts/restore-local-culturepeople-backup.mjs`, `scripts/restore-local-backup-copies.mjs`, 신규 systemd timer는 신규 구현 필요.
- 대표자 수동 작업: second copy 대상 결정.
- dry-run 명령: `pnpm backup:local:restore-check -- --root "$CULTUREPEOPLE_BACKUP_ROOT"`.
- apply 명령: 신규 구현 필요 `systemctl --user start culturepeople-local-restore-check.service`.
- 검증 명령: `journalctl --user -u culturepeople-local-restore-check.service -n 120 --no-pager`, `pnpm backup:local:restore-check-all -- --root "$CULTUREPEOPLE_BACKUP_ROOT" --second-copy <second-copy>`.
- 완료 기준: 주간 restore-check 결과가 로그로 남고 실패 시 알림 후보에 포함.
- 실패/blocked 조건: sqlite3 CLI 없음, backup root 미마운트, second copy 없음.
- 리스크: 오래 걸리는 restore-check가 daily backup과 겹치지 않도록 timer 시간을 분리해야 한다.

### P0-005. 마운트 경로 고정 또는 UUID 기반 점검 강화

- 목적: 자동 마운트 이름 변경으로 백업이 실패하는 문제를 재발 방지한다.
- 현재 상태: systemd는 UUID 기반으로 수정됐지만 문서 일부는 예전 `/media/...5551` 경로를 여전히 예시로 쓴다.
- 개발 범위: systemd, runbook, status 출력에 `findmnt -rnS UUID=96B82074B8205551` 기반 진단을 반영. 장기적으로 `/mnt/culturepeople-data` 고정 mountpoint를 검토한다.
- 제외 범위: fstab 수정은 대표자 확인 없이 적용하지 않는다.
- 필요한 파일/스크립트 후보: `ops/systemd/*.service`, `docs/local-backup-runbook.md`, `docs/culturepeople-ops-recovery-runbook.md`, 신규 mount-check script는 신규 구현 필요.
- 대표자 수동 작업: 고정 mountpoint를 만들지 결정, fstab 사용 여부 승인.
- dry-run 명령: `findmnt -rnS UUID=96B82074B8205551 -o SOURCE,TARGET,FSTYPE,SIZE,AVAIL,USE%`.
- apply 명령: systemd는 적용 완료. fstab 고정 mountpoint는 신규 구현 필요이며 대표자 승인 필요.
- 검증 명령: `systemctl --user cat culturepeople-local-backup.service`, `systemctl --user start culturepeople-local-image-backfill.service`.
- 완료 기준: 마운트 경로가 `...5551` 또는 `...55511`로 바뀌어도 service가 repo를 찾아 실행.
- 실패/blocked 조건: 드라이브가 아예 마운트되지 않음, UUID 변경, NTFS dirty bit.
- 리스크: fstab 오설정 시 부팅/마운트 불편이 생길 수 있다.

## 5. P1 과제

### P1-001. 이미지 4025개 복구 후 R2 이전 준비

- 목적: Supabase Storage 의존을 줄이고 이미지 원본을 장기 보관 가능한 object storage로 이전한다.
- 현재 상태: `4034/8059` 확보, `4025`개 Supabase URL은 DNS/deferred.
- 개발 범위: Supabase 복구 후 저부하 image backfill, materialized 100% 확인, R2 copy readiness 재검증.
- 제외 범위: Supabase 복구 전 대량 재시도.
- 필요한 파일/스크립트 후보: `scripts/local_media_backfill.py`, `scripts/r2-media-readiness-report.mjs`, R2 copy script는 기존 존재 여부 확인 필요.
- 대표자 수동 작업: Supabase 복구, R2 사용/결제/도메인 판단.
- dry-run 명령: `pnpm cloudflare:r2:media-readiness`.
- apply 명령: R2 copy apply는 기존 script 확인 필요. 없으면 신규 구현 필요.
- 검증 명령: `pnpm backup:local:status`, `pnpm cloudflare:r2:media-readiness`.
- 완료 기준: missing media `0`, R2 public URL 샘플 검증, rewrite 후보와 rollback mapping 생성.
- 실패/blocked 조건: Supabase DNS 실패, storage bucket 접근 제한, R2 credential 없음.
- 리스크: 이미지 URL rewrite를 성급히 적용하면 기사 이미지가 깨질 수 있다.

### P1-002. R2 copy/readiness 검증

- 목적: R2에 올릴 수 있는 파일과 아직 막힌 파일을 구분한다.
- 현재 상태: R2 readiness 기준 `copyRequired=4018`, `readyForRewrite=4018`, production rewrite blocked.
- 개발 범위: readiness report를 운영자가 읽기 쉽게 요약하고, R2 copy 결과와 공개 URL 검증을 분리.
- 제외 범위: production URL rewrite apply.
- 필요한 파일/스크립트 후보: `scripts/r2-media-readiness-report.mjs`, R2 copy/verify scripts는 기존 파일 확인 필요.
- 대표자 수동 작업: R2 bucket, token, custom domain 결정.
- dry-run 명령: `pnpm cloudflare:r2:media-readiness -- --json`.
- apply 명령: 신규 구현 또는 기존 R2 copy script 확인 필요.
- 검증 명령: 신규 구현 필요 `pnpm cloudflare:r2:media-verify -- --sample 20`.
- 완료 기준: R2에 복사된 파일 수와 public URL 검증 수가 report에 남음.
- 실패/blocked 조건: R2 token 없음, bucket 없음, public URL 정책 미정.
- 리스크: private bucket 상태에서 rewrite하면 공개 기사 이미지가 보이지 않는다.

### P1-003. production URL rewrite 금지 조건과 해제 조건

- 목적: 이미지 100% 확보 전 운영 URL을 바꾸지 않도록 안전 게이트를 둔다.
- 현재 상태: `productionRewriteAllowed=false`, blocked reason은 `4025 downloadable media URLs are not materialized locally`.
- 개발 범위: rewrite planner는 dry-run/report-only로 유지하고, 해제 조건을 명문화한다.
- 제외 범위: 실제 DB update.
- 필요한 파일/스크립트 후보: URL rewrite planner는 신규 구현 필요.
- 대표자 수동 작업: rewrite 승인 전 샘플 기사 확인.
- dry-run 명령: 신규 구현 필요 `pnpm media:url-rewrite:plan -- --dry-run`.
- apply 명령: 신규 구현 필요, 이미지 100% 확보 전 금지.
- 검증 명령: `pnpm cloudflare:r2:media-readiness`, 샘플 기사 이미지 확인.
- 완료 기준: missing media `0`, R2 public URL 샘플 통과, rollback mapping 존재.
- 실패/blocked 조건: missing media > 0, rewriteCandidateArticles 영향 범위 불명확.
- 리스크: rollback mapping 없이 apply하면 복구가 어렵다.

### P1-004. 디스크 사용률 80/90/95% 경고 정책

- 목적: 1.8TB 드라이브가 꽉 차서 백업이 멈추는 상황을 예방한다.
- 현재 상태: 사용률 약 `92.9%`. `backup:local:status`는 30/20/10GB 기준과 90/95% 사용률 기준을 함께 표시한다.
- 개발 범위: GB 기준과 사용률 기준을 함께 표시. 90% warning, 95% danger, 10GB block은 구현됨. 80% notice와 cleanup planner는 신규 구현 필요.
- 제외 범위: 자동 삭제 apply. 삭제는 dry-run 후보만 제시한다.
- 필요한 파일/스크립트 후보: `scripts/local-culturepeople-backup-status.mjs`, 신규 cleanup planner는 신규 구현 필요.
- 대표자 수동 작업: retention 기간과 삭제 허용 기준 승인.
- dry-run 명령: 신규 구현 필요 `pnpm backup:local:cleanup-plan -- --dry-run`.
- apply 명령: 신규 구현 필요, 대표자 확인 전 금지.
- 검증 명령: `pnpm backup:local:status -- --json`, `df -h`.
- 완료 기준: 90/95% 상태가 warnings/health에 표시. 80% notice와 cleanup planner는 후속 작업으로 분리.
- 실패/blocked 조건: NTFS statfs 값 불일치, target mount missing.
- 리스크: retention cleanup이 `_media-store`를 지우면 이미지 archive가 깨질 수 있다.

### P1-005. backup retention 정책 재점검

- 목적: 90일 보관과 디스크 여유 사이의 균형을 잡는다.
- 현재 상태: timestamped backup retention은 90일 기준이나 `_media-store`는 retention으로 삭제하지 않는다.
- 개발 범위: timestamped old backup cleanup dry-run, `_logs` 보관 기간, `_reports` 보관 기간 정책 정리.
- 제외 범위: media store 자동 삭제.
- 필요한 파일/스크립트 후보: `scripts/local-culturepeople-backup.mjs`, 신규 cleanup report는 신규 구현 필요.
- 대표자 수동 작업: 몇 일치 백업을 반드시 보관할지 결정.
- dry-run 명령: 신규 구현 필요 `pnpm backup:local:retention-plan -- --dry-run`.
- apply 명령: 신규 구현 필요 `pnpm backup:local:retention-plan -- --apply`.
- 검증 명령: `pnpm backup:local:restore-check` 최신/second copy 기준.
- 완료 기준: cleanup 후에도 최신 backup과 second copy restore-check 통과.
- 실패/blocked 조건: second copy 없음, 최신 백업 stale.
- 리스크: 오래된 raw export가 유일한 Supabase 증빙일 수 있으므로 Supabase 복구 전 과도 삭제 금지.

## 6. P2 과제

### P2-001. 백업 운영 대시보드 또는 리포트

- 목적: CLI를 매번 보지 않아도 백업 freshness, Supabase stale, image deferred, second copy 상태를 확인한다.
- 현재 상태: CLI report는 존재, 관리자 UI 연결은 별도 검토 필요.
- 개발 범위: local-only report JSON 생성, `/cam` 노출 여부 검토.
- 제외 범위: local path와 secret 원문 노출.
- 필요한 파일/스크립트 후보: `scripts/culturepeople-ops-audit.mjs`, 관리자 UI는 신규 구현 필요.
- 대표자 수동 작업: 관리자 화면에 local backup 상태를 보여도 되는지 결정.
- dry-run 명령: `pnpm ops:audit -- --json`.
- apply 명령: 신규 구현 필요.
- 검증 명령: `pnpm ops:audit`, 관리자 smoke는 기존 명령 확인 필요.
- 완료 기준: 운영자가 정상/경고/blocked를 한눈에 구분.
- 실패/blocked 조건: Vercel 서버에서 로컬 백업 디렉터리에 접근 불가.
- 리스크: 서버 UI에 로컬 전용 경로를 노출하면 보안/혼란이 생길 수 있다.

### P2-002. 관리자 화면에서 백업 상태 확인

- 목적: CLI 대신 관리자에서 백업 상태를 확인한다.
- 현재 상태: 직접 연결 여부 불명확.
- 개발 범위: local report 파일을 기반으로 read-only 표시. Vercel production에서 직접 로컬 백업을 읽는 구조는 피한다.
- 제외 범위: 관리자 UI에서 백업 실행 버튼 제공.
- 필요한 파일/스크립트 후보: 신규 구현 필요.
- 대표자 수동 작업: 노출할 범위 승인.
- dry-run 명령: 신규 구현 필요.
- apply 명령: 신규 구현 필요.
- 검증 명령: 관리자 smoke test는 기존 명령 확인 필요.
- 완료 기준: 관리자 화면에 freshness, Supabase stale, image coverage, second copy 상태 표시.
- 실패/blocked 조건: local report 업로드/동기화 경로 없음.
- 리스크: 잘못된 stale 정보가 운영 판단을 흐릴 수 있다.

### P2-003. Windows 복귀 시 Task Scheduler 대체 절차

- 목적: Linux Mint systemd에만 의존하지 않고 Windows로 돌아갈 수 있게 한다.
- 현재 상태: 문서 일부에 Windows 명령 예시가 있으나 UUID 기반 Linux systemd와 같은 수준의 절차는 부족하다.
- 개발 범위: PowerShell용 backup root 설정, Task Scheduler 등록 절차, Windows 경로 restore-check 절차 문서화.
- 제외 범위: Windows에서 지금 즉시 작업 스케줄러 등록.
- 필요한 파일/스크립트 후보: `docs/local-backup-runbook.md`, 신규 `.ps1` helper는 신규 구현 필요.
- 대표자 수동 작업: Windows에서 백업을 둘 드라이브 문자 결정.
- dry-run 명령: `pnpm backup:local:status -- --root "$env:CULTUREPEOPLE_BACKUP_ROOT"`.
- apply 명령: 신규 구현 필요 PowerShell Task Scheduler 등록 명령.
- 검증 명령: `pnpm backup:local:restore-check -- --root "$env:CULTUREPEOPLE_BACKUP_ROOT"`.
- 완료 기준: Windows에서도 backup/status/restore-check 명령이 동일하게 동작.
- 실패/blocked 조건: Windows node/pnpm/python/sqlite3 미설치.
- 리스크: Windows drive letter가 바뀌면 Linux mount 변동과 같은 문제가 재발한다.

### P2-004. 문서/운영 증빙 정리

- 목적: 다음 점검 때 토큰과 시간을 줄인다.
- 현재 상태: 여러 문서에 과거 `/media/...5551` 경로와 오래된 상태값이 남아 있다.
- 개발 범위: runbook에 UUID 기반 경로를 반영하고, 현재 상태는 이 문서를 기준으로 링크한다.
- 제외 범위: 모든 오래된 문서의 대규모 정리.
- 필요한 파일/스크립트 후보: `docs/local-backup-runbook.md`, `docs/culturepeople-ops-recovery-runbook.md`, `docs/development-master-plan.md`.
- 대표자 수동 작업: 없음.
- dry-run 명령: `rg -n "96B82074B8205551|96B82074B82055511|culturepeople-backups" docs ops scripts`.
- apply 명령: 문서 수정.
- 검증 명령: `pnpm backup:local:status`, `systemctl --user cat culturepeople-local-backup.service`.
- 완료 기준: 현재 운영 기준 문서가 UUID 기반 경로와 최신 상태를 설명.
- 실패/blocked 조건: 문서와 실제 systemd가 다시 달라짐.
- 리스크: 과거 기록과 현재 기준을 구분하지 않으면 혼란이 생긴다.

## 7. 운영 명령 모음

### 현재 존재하는 명령

```bash
pnpm backup:local:status
pnpm backup:local:restore-check
pnpm ops:audit
pnpm cloudflare:r2:media-readiness
pnpm supabase:recovery-check -- --require-storage
pnpm backup:local:sync-copy -- --target <second-copy> --dry-run
pnpm backup:local:sync-copy -- --target <second-copy> --apply
systemctl --user list-timers --all | grep culturepeople
journalctl --user -u culturepeople-local-backup.service -n 120 --no-pager
```

### 추가로 유용한 현재 존재 명령

```bash
pnpm backup:local:quiet -- --root "$CULTUREPEOPLE_BACKUP_ROOT"
pnpm backup:local:media-backfill -- --root "$CULTUREPEOPLE_BACKUP_ROOT" --max-new-media 50 --delay-ms 2000
pnpm backup:local:restore-check-all -- --root "$CULTUREPEOPLE_BACKUP_ROOT" --second-copy <second-copy>
systemctl --user cat culturepeople-local-backup.service culturepeople-local-image-backfill.service
findmnt -rnS UUID=96B82074B8205551 -o SOURCE,TARGET,FSTYPE,SIZE,AVAIL,USE%
```

### 신규 구현 필요 명령 후보

```bash
pnpm backup:health:notify -- --dry-run
pnpm backup:health:notify -- --apply
pnpm backup:local:cleanup-plan -- --dry-run
pnpm backup:local:retention-plan -- --dry-run
pnpm media:url-rewrite:plan -- --dry-run
pnpm cloudflare:r2:media-verify -- --sample 20
```

## 8. 대표자가 직접 해야 하는 작업

- Supabase dashboard에서 project paused/resume 상태 확인.
- Supabase project ref와 env URL의 `ifducnfrjarmlpktrjkj` 일치 확인.
- Supabase `images` bucket 접근 확인.
- Supabase service role key 재발급 여부 확인.
- 2차 백업 대상 선택: 외장디스크, NAS, R2, 다른 로컬 드라이브 중 하나.
- R2 사용 여부, 결제, bucket, public domain 결정.
- Windows 복귀 가능성을 위해 Windows에서 사용할 백업 드라이브 문자 또는 경로 결정.

## 9. 개발 우선순위

1. 2차 백업 자동 동기화.
2. 백업 실패/지연 알림.
3. 주간 restore-check 자동화.
4. Supabase 복구 후 fresh export wrapper.
5. 이미지/R2 이전 readiness 강화.

이 순서가 현실적인 이유는 Supabase 복구는 외부 콘솔 작업이 선행되어야 하지만, 2차 백업과 알림, restore-check는 현재 코드와 로컬 파일만으로 바로 개선할 수 있기 때문이다.

## 10. 다음 개발 프롬프트

### 1단계. 2차 백업 자동 동기화만 구현

```text
docs/culturepeople-backup-operations-plan.md 기준으로 1단계 P0-002 2차 백업 자동 동기화만 개발해줘.

진행 방식:
- 더 묻지 말고 현재 코드와 docs/culturepeople-backup-operations-plan.md, docs/local-backup-runbook.md, scripts/sync-local-backup-copy.mjs, scripts/restore-local-backup-copies.mjs, package.json을 먼저 읽어.
- 기존 변경사항은 되돌리지 말고 필요한 파일만 좁게 수정해.
- 운영 DB 쓰기, 이미지 대량 다운로드, 라이브 대량 호출은 하지 마.
- 기본은 dry-run이고 --apply가 있을 때만 실제 복제되게 유지해.
- Linux Mint 기준으로 구현하되 Windows 복귀 가능성을 문서에 남겨.

반드시 처리:
- second copy target을 인자로 받는 wrapper 또는 문서화된 실행 흐름을 정리해.
- `backup:local:sync-copy -- --target <second-copy> --dry-run`과 `--apply`가 최신 백업, SQLite, manifest, media store, 최근 로그를 포함하는지 확인해.
- second copy에서 `backup:local:restore-check`가 통과하는 검증 흐름을 추가/보완해.
- `backup:local:status -- --second-copy <second-copy>` 기준 freshness/lag 확인 절차를 문서화해.
- systemd timer로 자동화할 경우 target이 없으면 실패를 명확히 로그에 남기고 primary 백업을 건드리지 않게 해.

검증:
- `pnpm check:local-backup`
- `pnpm backup:local:sync-copy -- --target /tmp/culturepeople-backups-copy --dry-run`
- `pnpm backup:local:sync-copy -- --target /tmp/culturepeople-backups-copy --apply`
- `pnpm backup:local:restore-check -- --root /tmp/culturepeople-backups-copy`
- `pnpm backup:local:status -- --second-copy /tmp/culturepeople-backups-copy`

완료 보고:
- 수정 파일
- 실행한 검증 명령과 결과
- 실제 2차 백업 target을 대표자가 정해야 하는지 여부
- 다음 작업 1개
```

### 2단계. 백업 실패 알림과 주간 restore-check 구현

```text
docs/culturepeople-backup-operations-plan.md 기준으로 2단계 백업 실패/지연 알림과 주간 restore-check 자동화를 개발해줘.

진행 방식:
- 더 묻지 말고 현재 코드와 백업 문서를 먼저 읽어.
- 운영 DB 쓰기, 이미지 대량 다운로드, 라이브 대량 호출은 하지 마.
- 알림은 secret 원문을 출력하지 말고 redaction을 적용해.
- Telegram 설정이 없으면 로컬 report/log 기반으로 구현하고, Telegram 발송은 설정 발견 시만 활성화해.

반드시 처리:
- backup age > 24h, Supabase fallback stale, image backfill +0, disk 90/95%, lock stale, systemd failed unit을 감지하는 health summary를 만든다.
- 알림 명령은 기본 dry-run, --apply에서만 실제 발송하게 한다.
- 주간 restore-check용 systemd service/timer 또는 동등한 package script를 추가한다.
- restore-check 결과를 `_logs` 또는 `_reports`에 남긴다.
- Windows Task Scheduler 대체 절차를 문서화한다.

검증:
- `pnpm backup:local:status -- --json`
- `pnpm ops:audit -- --json`
- 신규 알림 dry-run 명령
- `pnpm backup:local:restore-check`
- `systemctl --user list-timers --all | grep culturepeople`
- `journalctl --user -u <new-restore-check-service> -n 120 --no-pager`

완료 보고:
- 수정 파일
- 알림 조건
- 주간 restore-check 일정
- 대표자가 설정해야 하는 secret/대상
- 남은 리스크
```

### 3단계. Supabase 복구 후 fresh export와 이미지/R2 readiness 구현

```text
docs/culturepeople-backup-operations-plan.md 기준으로 3단계 Supabase 복구 후 fresh export와 이미지/R2 readiness를 보강해줘.

진행 방식:
- 더 묻지 말고 현재 코드와 백업/R2 관련 문서를 먼저 읽어.
- Supabase가 아직 `project_unreachable_or_paused`이면 fresh export나 이미지 대량 백필을 실행하지 말고 blocked로 처리해.
- 모든 위험 작업은 dry-run 우선, --apply에서만 실제 실행.
- production URL rewrite는 이미지 100% 확보와 rollback mapping 전까지 금지.

반드시 처리:
- `pnpm supabase:recovery-check -- --require-storage` 결과가 ready일 때만 fresh backup을 실행하는 wrapper를 점검/보완한다.
- Supabase 복구 후 `backup:local:quiet`, `restore-check`, `status` 순서가 자동으로 이어지게 한다.
- image backfill은 낮은 concurrency와 제한된 `--max-new-media`를 유지한다.
- R2 readiness report에 missing media, copyRequired, readyForRewrite, blockedReasons를 명확히 남긴다.
- production URL rewrite planner는 dry-run만 구현하거나 기존 상태를 보류로 문서화한다.

검증:
- `pnpm supabase:recovery-check -- --require-storage`
- `pnpm backup:local:quiet -- --root "$CULTUREPEOPLE_BACKUP_ROOT"`는 Supabase ready일 때만 실행
- `pnpm backup:local:restore-check`
- `pnpm backup:local:status`
- `pnpm cloudflare:r2:media-readiness`

완료 보고:
- Supabase ready 여부
- fresh export 실행 여부와 이유
- 이미지 확보율
- R2 readiness 결과
- production rewrite blocked/allowed 상태
```

## 11. 완료 기준 요약

- 백업은 24시간 RPO 안에서 생성된다.
- 최신 backup restore-check가 통과한다.
- second copy가 설정되고 24시간 이내 lag를 유지한다.
- 백업 실패/지연/디스크 위험/이미지 +0/Supabase stale이 알림 또는 명확한 report로 남는다.
- Supabase 복구 후 local fallback이 `live_rest`로 대체된다.
- 이미지 100% 확보 전 production URL rewrite는 계속 blocked 상태를 유지한다.
