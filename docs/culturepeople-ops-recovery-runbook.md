# CulturePeople 운영 복구 Runbook

작성일: 2026-06-15

이 문서는 장애 대응 시 먼저 읽기 전용 확인을 하고, 그 다음에만 쓰기/배포/롤백을 수행하기 위한 절차다. 네이버뉴스·다음뉴스는 심사/제휴 전이므로 포털 뉴스 자동 송고 복구 절차는 없다. 현재 복구 대상은 검색 색인, RSS/sitemap, auto-press, 백업, 배포다.

## 공통 원칙

- 현재 Linux Mint 백업 루트는 1.8TB NTFS 드라이브의 repo-local `culturepeople-backups`다. 자동 마운트 경로가 바뀔 수 있으므로 고정 `/media/...` 경로 대신 UUID로 찾는다.
- 먼저 `MOUNT_ROOT="$(findmnt -rnS UUID=96B82074B8205551 -o TARGET | head -n 1)"`와 `export CULTUREPEOPLE_BACKUP_ROOT="$MOUNT_ROOT/Users/Documents/monet-registry-main/culturepeople-backups"`를 설정한 뒤 `pnpm ops:audit -- --root "$CULTUREPEOPLE_BACKUP_ROOT"`로 로컬 증빙을 확인한다.
- 라이브 확인은 소량만 수행한다: `pnpm verify:portal -- --base https://culturepeople.co.kr`.
- 대량 IndexNow 제출, 이미지 대량 재시도, DB write는 읽기 전용 진단 후 별도 단계에서만 수행한다.
- secret 원문은 터미널 로그, 문서, 배포 로그에 남기지 않는다.
- Linux의 systemd user timer/journal 절차는 편의용이다. Windows로 돌아갈 때는 Task Scheduler와 `$env:CULTUREPEOPLE_BACKUP_ROOT\_logs`를 기준으로 같은 스크립트를 실행한다.

## Supabase paused 또는 unreachable

읽기 전용 확인:

```bash
pnpm supabase:recovery-check -- --require-storage
pnpm backup:local:status -- --root "$CULTUREPEOPLE_BACKUP_ROOT"
```

대표자 콘솔 확인:

- Supabase dashboard에서 프로젝트가 paused 상태인지 확인하고 resume.
- project ref가 `ifducnfrjarmlpktrjkj`인지 확인.
- `images` bucket 존재와 접근 정책 확인.
- service role key가 교체되었는지 확인.

복구 후 실행:

```bash
pnpm backup:local:quiet -- --root "$CULTUREPEOPLE_BACKUP_ROOT"
pnpm backup:local:restore-check -- --root "$CULTUREPEOPLE_BACKUP_ROOT"
pnpm backup:local:status -- --root "$CULTUREPEOPLE_BACKUP_ROOT"
```

완료 기준:

- recovery check에서 DB export와 storage copy가 ready.
- 최신 backup manifest의 Supabase source가 `live_rest`.
- stale fallback warning이 사라진다.

## Supabase service role key 불일치

읽기 전용 확인:

```bash
pnpm supabase:recovery-check -- --require-storage
```

쓰기/설정 단계:

- Supabase dashboard에서 service role key를 재발급한다.
- Vercel/Shell 환경변수에 프로젝트 전용 값으로 갱신한다.
- 로그에 key 원문을 출력하지 않는다.

완료 기준:

- `supabase:recovery-check`가 401/403 없이 통과한다.

## Storage host DNS 실패 또는 이미지 백필 정체

읽기 전용 확인:

```bash
pnpm backup:local:status -- --root "$CULTUREPEOPLE_BACKUP_ROOT"
```

Windows 확인:

```powershell
pnpm backup:local:status -- --root "$env:USERPROFILE\culturepeople-backups"
py -3 scripts\local_media_backfill.py --root "$env:USERPROFILE\culturepeople-backups" --max-new-media 5 --delay-ms 2000
```

복구 기준:

- `latest run deferred recent media failures`가 줄어든다.
- 이미지 백필 24시간 +0 warning이 사라진다.

주의:

- host 접근이 복구되기 전 `--max-new-media`를 크게 올리지 않는다.
- 기본 hourly timer와 단일 concurrency를 유지한다.

## Cloudflare D1 API 접근 실패

읽기 전용 확인:

```bash
pnpm ops:audit -- --root "$CULTUREPEOPLE_BACKUP_ROOT"
node scripts/backfill-portal-publication.mjs --source d1 --log-preview 3
```

대표자/운영 확인:

- Cloudflare API token 권한과 만료 여부.
- `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_D1_DATABASE_ID`, `CLOUDFLARE_API_TOKEN` 값의 프로젝트 일치 여부.

쓰기 단계:

- token 교체 후 dry-run을 먼저 재실행한다.
- 대량 backfill apply는 후보 수와 batch size를 확인한 뒤 실행한다.

## Vercel production deploy 실패

읽기 전용 확인:

```bash
pnpm deploy:culturepeople -- --help
test -n "$CULTUREPEOPLE_VERCEL_TOKEN" && echo "token set" || echo "token missing"
```

배포 단계:

```bash
pnpm deploy:culturepeople
pnpm verify:portal -- --base https://culturepeople.co.kr
```

롤백:

- Vercel dashboard에서 직전 production deployment를 promote/rollback한다.
- CLI 사용 시 토큰은 `CULTUREPEOPLE_VERCEL_TOKEN`만 사용한다.

## Cloudflare auto-press Worker 실패

읽기 전용 확인:

```bash
pnpm check:auto-press-agent-loop
```

중단 스위치:

- `AUTO_PRESS_WORKER_ENABLED=false`
- `AUTO_PRESS_WORKER_DRY_RUN=true`
- 관리자 auto-press 설정에서 cron/worker 비활성화

복구:

- worker secret과 Vercel `AUTO_PRESS_WORKER_SECRET` 일치 여부 확인.
- 이전 worker version 재배포 또는 dashboard rollback.

## IndexNow 성공 로그 누락

읽기 전용 확인:

```bash
pnpm ops:audit -- --root "$CULTUREPEOPLE_BACKUP_ROOT"
node scripts/backfill-portal-publication.mjs --source d1 --base https://culturepeople.co.kr --log-preview 3
```

복구 전 확인:

- `/cam/seo`의 IndexNow key.
- `/{key}.txt`가 200으로 key 본문을 반환하는지 확인.
- `authFailed: 0`인지 확인.

쓰기 단계:

```bash
node scripts/backfill-portal-publication.mjs --source d1 --base https://culturepeople.co.kr --apply --batch-size 50 --delay-ms 1200
```

주의:

- 후보 수가 크면 batch size를 낮춘다.
- 승인형 뉴스 포털 송고가 아니라 검색 색인 알림이다.

## IndexNow key 유출 또는 교체

읽기 전용 확인:

```bash
pnpm verify:portal -- --base https://culturepeople.co.kr --indexnow-key "$NEW_KEY"
```

설정 단계:

- `/cam/seo`에서 새 key 저장.
- 이전 key txt가 404인지 확인.
- 새 key txt가 200인지 확인.
- Bing Webmaster Tools와 Naver Search Advisor에서 key 상태를 확인한다.

## 로컬 백업 lock 장기 유지

읽기 전용 확인:

```bash
pnpm backup:local:status -- --root "$CULTUREPEOPLE_BACKUP_ROOT"
ps -fp <pid>
```

Windows 확인:

```powershell
pnpm backup:local:status -- --root "$env:USERPROFILE\culturepeople-backups"
Get-Process -Id <pid>
```

복구:

- 해당 pid가 살아 있으면 기다린다.
- process가 없고 stale로 표시될 때만 `.backup.lock`을 제거한다.

## 운영 증빙 보관

- `.deploy-logs/`: 배포와 portal verification.
- `.portal-backfill-runs/`: IndexNow dry-run/apply/blocked 결과.
- `$CULTUREPEOPLE_BACKUP_ROOT/_logs`: quiet backup 전체 로그.
- `backup-manifest.json`: D1/Supabase source와 merge 결과.
- `media-manifest.json`: 이미지 백업 결과.
- `media-url-index.json`: 로컬 이미지 캐시 인덱스.
- Linux `journalctl --user`: systemd user timer/service 실행 이력.
- Windows Task Scheduler History와 `%USERPROFILE%\culturepeople-backups\_logs`: Windows 주기 실행 이력과 quiet backup 전체 로그.

## 대표자 수동 콘솔 작업

- Supabase dashboard: 프로젝트 resume, project ref, storage bucket, service role key.
- Naver Search Advisor: 사이트 소유 확인, sitemap/RSS 제출, IndexNow/key 상태 확인.
- Google Search Console: sitemap/news-sitemap 제출.
- Bing Webmaster Tools: IndexNow 수신 확인.
- Google AdSense: ads.txt 경고 해소 확인.
- 네이버뉴스/다음뉴스: 심사/제휴 신청 가능 조건과 제출 창구 확인. 승인 전 자동 송고 개발은 보류.
