# CulturePeople local backup runbook

This runbook backs up CulturePeople article data and article media to this
computer without writing to the production service.

## Current backup root

Linux Mint 현재 기본 백업 루트는 repo 안의 `culturepeople-backups`다.
스크립트 기본값도 이 위치를 사용하며, 필요한 경우 `CULTUREPEOPLE_BACKUP_ROOT`
환경변수로 덮어쓴다.

```bash
MOUNT_ROOT="$(findmnt -rnS UUID=96B82074B8205551 -o TARGET | head -n 1)"
cd "$MOUNT_ROOT/Users/Documents/monet-registry-main"
export CULTUREPEOPLE_BACKUP_ROOT="$PWD/culturepeople-backups"
```

기존 `$HOME/culturepeople-backups` 경로는 호환용 symlink로만 유지한다.
Windows로 돌아갈 때는 같은 repo 위치에서 `$env:CULTUREPEOPLE_BACKUP_ROOT`를
Windows 경로로 지정한 뒤 동일한 package script를 실행한다.

주의: Linux Mint 자동 마운트는 같은 NTFS 드라이브를
`/media/arbada/96B82074B8205551` 또는 `/media/arbada/96B82074B82055511`
처럼 다른 디렉터리명으로 붙일 수 있다. 운영 명령과 systemd 서비스는
고정 경로가 아니라 `UUID=96B82074B8205551` 기준 `findmnt` 결과를 사용한다.

## Backup shape

Each run creates a timestamped folder under the backup root:

```text
$CULTUREPEOPLE_BACKUP_ROOT/
  _media-store/
    files/<hash-prefix>/<content-hash>.<ext>
  2026-05-25T03-20-00-000Z/
    raw/
      d1/
        schema.json
        export-manifest.json
        tables/*.json
      supabase/
        export-manifest.json
        tables/*.json
    merged/
      articles.json
      articles.ndjson
      culturepeople.sqlite
      merge-report.json
      media-candidates.json
    media/
      media-manifest.json
    backup-manifest.json
  media-url-index.json
```

The two online databases are preserved separately in `raw/d1` and
`raw/supabase`. `merged/articles.json` is the unified local article backup:
D1 is treated as the current primary DB, and Supabase-only articles are kept.
Duplicate articles are reported in `merged/merge-report.json`.
`merged/culturepeople.sqlite` is a single-file SQLite snapshot generated from
the local JSON backup. It stores merged articles, duplicate-source references,
raw D1/Supabase rows, media candidates, and media file manifests without
contacting remote services.

## Safety defaults

- Remote access is read-only.
- The script talks to Cloudflare D1 and public managed media URLs directly,
  not through the Next.js app server.
- Default page sizes are small: D1 `100`, Supabase `100`.
- Default delays are conservative: D1 `200ms`, Supabase `300ms`, media `700ms`.
- Media concurrency defaults to `1`.
- A root-level `media-url-index.json` lets later runs reuse already downloaded
  media from local disk instead of downloading the same URL again.
- Media files are stored once under `_media-store/`, outside timestamped backup
  folders, so retention cleanup does not delete the local media archive.
- Use `--max-new-media <n>` for low-load incremental media backup. Cached media
  is reused in the manifest, while only uncached URLs count against the limit.
- `--min-free-gb` defaults to `10`, so a run fails before backup work begins if
  the local backup disk is too full.
- External article image URLs are skipped unless `--include-external-media` is
  passed.
- `--all-tables` is available, but should be used carefully because tables such
  as view logs can be larger than article data.

## Required environment

The script loads `.env.local`, `.env.production.local`, `.env.vercel.local`,
and shell environment variables.

For D1:

```text
CLOUDFLARE_ACCOUNT_ID
CLOUDFLARE_API_TOKEN
CLOUDFLARE_D1_DATABASE_ID or D1_DATABASE_ID
```

If no D1 database ID is set, the script tries to resolve
`CLOUDFLARE_D1_PROD_DB`, `D1_DATABASE_NAME`, or `culturepeople-prod` by name.

For Supabase:

```text
NEXT_PUBLIC_SUPABASE_URL or SUPABASE_URL
SUPABASE_SERVICE_KEY
```

If Supabase is quota-restricted or unavailable, the script looks for a local
fallback export in `exports/supabase`. When that fallback exists, it is copied
into the new backup so the two-DB merge can still be produced, but
`backup-manifest.json` records `sources.supabase.source: "local_fallback"` and
the live REST error. Use `--no-supabase-fallback` when you want the run to fail
instead of using the local snapshot.

`backup:local:verify`, `backup:local:restore-check`, and
`backup:local:status` warn when that fallback is older than 3 days, and they
include the original Supabase REST error. Use
`--supabase-fallback-max-age-days <n>` to change the threshold or
`--fail-stale-supabase-fallback` for a strict manual check. The default systemd
service warns but does not fail on stale fallback, so media backup can continue
while Supabase access is quota-restricted.

## Recovery targets

Initial operating targets:

- RPO: latest D1-backed local backup within 24 hours.
- Supabase RPO after project recovery: live Supabase export within 24 hours.
- RTO: read-only article recovery from local SQLite/JSON within 4 hours.
- Full service recovery target: 24 hours.
- Retention: 90 days for timestamped backup directories.
- Disk warning: 30 GB available or 90% used.
- Disk danger: 20 GB available or 95% used.
- Backup-run block threshold: 10 GB available.

`backup:local:status` prints these targets and reports health for backup
freshness, Supabase fallback, disk, image backfill, and lock state. The disk
block threshold is enforced by backup runs through `--min-free-gb`; status is a
read-only warning surface. Treat 30 GB free or 90% used as "make/verify second
copy now", 20 GB free or 95% used as "pause image backfill or large copy
apply", and 10 GB free as "do not start new large backup work".

## Test first

Run a structure-only sample first:

```bash
pnpm check:local-backup
pnpm backup:local:test -- --out "$HOME/culturepeople-backups-test"
```

Then test a tiny media download:

```bash
pnpm backup:local -- --sample --max-media 2 --out "$HOME/culturepeople-backups-test"
```

Run the same media test again. `media.reused` should increase when the cached
files are reused locally.

Inspect:

```bash
ls "$HOME/culturepeople-backups-test"
pnpm backup:local:sqlite -- --root "$HOME/culturepeople-backups-test"
pnpm backup:local:verify -- --root "$HOME/culturepeople-backups-test" --require-sqlite
pnpm backup:local:restore-check -- --root "$HOME/culturepeople-backups-test"
pnpm backup:local:status -- --root "$HOME/culturepeople-backups-test"
```

Open the latest `backup-manifest.json` and confirm:

- `sources.d1.ok` is `true`
- `sources.supabase.ok` is `true`
- `sources.supabase.source` is either `live_rest` or `local_fallback`
- `merge.kept.total` is greater than `0`
- `media.downloaded` is greater than `0` for the media test

## Full backup

Use the low-load incremental defaults. This downloads at most 300 new media
files per run, then continues from the next uncached URL on the next run:

```bash
pnpm backup:local -- --out "$CULTUREPEOPLE_BACKUP_ROOT" --media-concurrency 1 --media-delay-ms 1500 --media-timeout-ms 90000 --media-retries 1 --media-retry-delay-ms 5000 --max-new-media 300 --min-free-gb 10 --retention-days 90
pnpm backup:local:sqlite
pnpm backup:local:verify -- --require-sqlite
pnpm backup:local:restore-check
pnpm backup:local:status
```

For chat/systemd-friendly output, use the quiet wrapper. It runs the same
low-load backup, SQLite creation, verification, and status check, but stores
full command output in `<backup-root>/_logs` and prints only a compact summary:

```bash
pnpm backup:local:quiet -- --root "$CULTUREPEOPLE_BACKUP_ROOT"
```

When a second copy is configured, the quiet wrapper also runs
`backup:local:sync-copy --apply` and `backup:local:restore-check-all` after the
primary restore rehearsal. Use `--skip-second-copy-sync` only for troubleshooting
the primary backup chain.

The backup script creates `.backup.lock` under the backup root while it runs.
This prevents an automatic backup and a manual backup from downloading the same
remote media at the same time. If a machine powers off mid-backup, the lock is
treated as stale after 12 hours by default; adjust with
`--lock-stale-minutes`.

Media downloads retry once by default for timeout, network, rate-limit, and 5xx
errors. The low-load service waits 5 seconds before that retry and does not
retry permanent 4xx responses.

Recently failed media URLs and hosts are put on a local cooldown before they
are retried. This prevents one unreachable storage host from blocking all
future DB/SQLite backups or making the daily job spend its whole window on the
same failed 300 media URLs. Adjust with
`--media-failure-cooldown-hours`; the default is 168 hours.

For a one-time full media sweep after the cache has been built, omit
`--max-new-media`.

## Image-only backfill

The regular DB backup runs daily. Images can also be backfilled separately from
local manifests without re-exporting D1/Supabase:

```bash
pnpm backup:local:media-backfill -- --root "$CULTUREPEOPLE_BACKUP_ROOT" --max-new-media 50 --delay-ms 2000
```

This Python worker reads the newest `merged/media-candidates.json`, updates the
root `media-url-index.json`, and stores files under `_media-store`. It performs
one DNS check per host before downloading, so an unreachable storage host is
deferred without retrying thousands of image URLs. On Linux, install the
`culturepeople-local-image-backfill.timer` user timer to run it hourly at low
load. On Windows, run the same script with:

```powershell
py -3 scripts\local_media_backfill.py --root "$env:USERPROFILE\culturepeople-backups" --max-new-media 50 --delay-ms 2000
```

`backup:local:status` reads only local files. Use it to check media progress,
remaining media URLs, the latest backup result, backup lock state, and the
estimated number of low-load runs still needed. It also reports the backup
disk's available space and an estimate of how much space may remain after the
remaining media URLs are downloaded. If Supabase live export is quota-restricted
or unavailable, it also reports the fallback snapshot age so stale two-DB
coverage is visible without opening JSON files.

For a combined read-only operations audit:

```bash
pnpm ops:audit -- --root "$CULTUREPEOPLE_BACKUP_ROOT"
pnpm ops:audit -- --root "$CULTUREPEOPLE_BACKUP_ROOT" --base https://culturepeople.co.kr
```

The first command uses local evidence only. The second adds small live
`/ads.txt`, RSS/feed, sitemap, news-sitemap, and optional IndexNow key route
checks through `verify:portal`. It does not submit new URLs unless
`--run-indexnow-dry-run` is explicitly provided, and dry-run mode still avoids
IndexNow writes.

## Restore rehearsal

Use this before trusting a backup for recovery:

```bash
pnpm backup:local:restore-check -- --root "$CULTUREPEOPLE_BACKUP_ROOT"
```

What it checks:

- Latest backup manifests and raw D1/Supabase article exports exist.
- `merged/articles.json` and media manifests are readable.
- `merged/culturepeople.sqlite` can be copied to a temporary restore directory.
- The copied SQLite opens with `sqlite3`, passes `PRAGMA integrity_check`, and
  contains the required `articles`, `raw_rows`, `media_candidates`, and
  `media_files` tables.
- Row counts in the SQLite copy match the JSON manifests.
- A bounded sample of materialized media files exists on disk.

The command is read-only for production. On Windows, the same package script
works if `sqlite3.exe` is on `PATH`; otherwise pass `--skip-sqlite-cli` for a
header/copy-only rehearsal and install SQLite before relying on the backup for
actual recovery.

## Second local copy

Keep a second copy outside the primary backup root, preferably on another disk.
The sync command is Node-based, so the same package script works on Linux and
Windows. It is dry-run by default and writes only with `--apply`.

`backup:local:status`, `backup:local:restore-check-all`, and
`predeploy:ops-check` discover the second copy in this order:

1. Explicit `--second-copy <dir>`
2. `CULTUREPEOPLE_BACKUP_SECOND_COPY`
3. `$HOME/.config/culturepeople/backup-second-copy-path`

Linux example:

```bash
pnpm backup:local:sync-copy -- --source "$CULTUREPEOPLE_BACKUP_ROOT" --target "/media/arbada/backup-drive/culturepeople-backups-copy" --dry-run
pnpm backup:local:sync-copy -- --source "$CULTUREPEOPLE_BACKUP_ROOT" --target "/media/arbada/backup-drive/culturepeople-backups-copy" --apply
mkdir -p "$HOME/.config/culturepeople"
printf '%s\n' "/media/arbada/backup-drive/culturepeople-backups-copy" > "$HOME/.config/culturepeople/backup-second-copy-path"
pnpm backup:local:restore-check -- --root "/media/arbada/backup-drive/culturepeople-backups-copy"
pnpm backup:local:restore-check-all -- --root "$CULTUREPEOPLE_BACKUP_ROOT" --second-copy "/media/arbada/backup-drive/culturepeople-backups-copy"
pnpm backup:local:status -- --root "$CULTUREPEOPLE_BACKUP_ROOT" --second-copy "/media/arbada/backup-drive/culturepeople-backups-copy"
```

Windows example:

```powershell
pnpm backup:local:sync-copy -- --source "$env:USERPROFILE\culturepeople-backups" --target "D:\culturepeople-backups-copy" --dry-run
pnpm backup:local:sync-copy -- --source "$env:USERPROFILE\culturepeople-backups" --target "D:\culturepeople-backups-copy" --apply
New-Item -ItemType Directory -Force "$env:USERPROFILE\.config\culturepeople" | Out-Null
Set-Content -Path "$env:USERPROFILE\.config\culturepeople\backup-second-copy-path" -Value "D:\culturepeople-backups-copy"
pnpm backup:local:restore-check -- --root "D:\culturepeople-backups-copy"
pnpm backup:local:restore-check-all -- --root "$env:USERPROFILE\culturepeople-backups" --second-copy "D:\culturepeople-backups-copy"
pnpm backup:local:status -- --root "$env:USERPROFILE\culturepeople-backups" --second-copy "D:\culturepeople-backups-copy"
```

The sync includes the latest timestamped backup, `backup-manifest.json`,
`merged/culturepeople.sqlite`, media manifests, `media-url-index.json`, the
referenced `_media-store` files, and recent `_logs`. A second copy is considered
fresh when its latest backup timestamp matches the primary latest backup, or
its lag is within the configured `--second-copy-max-lag-hours` threshold.

For DB-only recovery snapshots:

```bash
pnpm backup:local -- --no-media --out "$CULTUREPEOPLE_BACKUP_ROOT"
pnpm backup:local:verify
```

## Linux periodic backup

Copy the user systemd templates:

```bash
mkdir -p "$HOME/.config/systemd/user"
cp ops/systemd/culturepeople-local-backup.service "$HOME/.config/systemd/user/"
cp ops/systemd/culturepeople-local-backup.timer "$HOME/.config/systemd/user/"
```

The user systemd service should discover the Windows-mounted checkout by disk
UUID, not by a fixed `/media/...` directory name. The service should contain:

```text
Environment=CULTUREPEOPLE_DISK_UUID=96B82074B8205551
ExecStart=/usr/bin/bash -lc 'set -euo pipefail; MOUNT_ROOT="$(findmnt -rnS "UUID=$CULTUREPEOPLE_DISK_UUID" -o TARGET | head -n 1)"; CULTUREPEOPLE_REPO="$MOUNT_ROOT/Users/Documents/monet-registry-main"; CULTUREPEOPLE_BACKUP_ROOT="$CULTUREPEOPLE_REPO/culturepeople-backups"; cd "$CULTUREPEOPLE_REPO" && pnpm backup:local:quiet -- --root "$CULTUREPEOPLE_BACKUP_ROOT"'
```

Enable the timer:

```bash
systemctl --user daemon-reload
systemctl --user enable --now culturepeople-local-backup.timer
systemctl --user list-timers culturepeople-local-backup.timer
```

Manual run through systemd:

```bash
systemctl --user start culturepeople-local-backup.service
journalctl --user -u culturepeople-local-backup.service -n 80 --no-pager
```

The systemd service runs the quiet wrapper, which performs backup, SQLite
snapshot creation, verification, optional second-copy sync, restore-check-all,
and local status reporting in that order.
Verification uses `--require-sqlite` so a missing or unreadable unified
snapshot fails the run. The full output is saved under
`$CULTUREPEOPLE_BACKUP_ROOT/_logs`, keeping journal and chat output compact. The
SQLite step requires the `sqlite3` command on `PATH`; Ubuntu packages it as
`sqlite3`.

## Windows fallback

The same script works from PowerShell:

```powershell
pnpm backup:local -- --sample --no-media --out "$env:USERPROFILE\culturepeople-backups-test"
pnpm backup:local -- --out "$env:USERPROFILE\culturepeople-backups" --media-concurrency 1 --media-delay-ms 1500 --media-timeout-ms 90000 --media-retries 1 --media-retry-delay-ms 5000 --max-new-media 300 --min-free-gb 10 --retention-days 90
pnpm backup:local:sqlite -- --root "$env:USERPROFILE\culturepeople-backups"
pnpm backup:local:restore-check -- --root "$env:USERPROFILE\culturepeople-backups"
pnpm backup:local:status -- --root "$env:USERPROFILE\culturepeople-backups"
```

For Task Scheduler:

- Program: `pnpm.cmd`
- Arguments:
  `backup:local:quiet -- --root "%USERPROFILE%\culturepeople-backups"`
- Start in: the repo folder
- Schedule: daily, off-peak time

Keep the backup folder outside the repo on both Linux and Windows.
The quiet wrapper now runs a local restore rehearsal after verification. It
copies `merged/culturepeople.sqlite` into a temporary directory, opens the copy,
checks required tables and row counts, samples local media files, then removes
the temporary directory. Use `--skip-restore-check` only when troubleshooting
backup generation itself.
