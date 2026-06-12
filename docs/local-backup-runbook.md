# CulturePeople local backup runbook

This runbook backs up CulturePeople article data and article media to this
computer without writing to the production service.

## Backup shape

Each run creates a timestamped folder under the backup root:

```text
~/culturepeople-backups/
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

`backup:local:verify` and `backup:local:status` warn when that fallback is
older than 3 days, and they include the original Supabase REST error. Use
`--supabase-fallback-max-age-days <n>` to change the threshold or
`--fail-stale-supabase-fallback` for a strict manual check. The default systemd
service warns but does not fail on stale fallback, so media backup can continue
while Supabase access is quota-restricted.

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
pnpm backup:local -- --out "$HOME/culturepeople-backups" --media-concurrency 1 --media-delay-ms 1500 --media-timeout-ms 90000 --media-retries 1 --media-retry-delay-ms 5000 --max-new-media 300 --min-free-gb 10 --retention-days 90
pnpm backup:local:sqlite
pnpm backup:local:verify -- --require-sqlite
pnpm backup:local:status
```

For chat/systemd-friendly output, use the quiet wrapper. It runs the same
low-load backup, SQLite creation, verification, and status check, but stores
full command output in `<backup-root>/_logs` and prints only a compact summary:

```bash
pnpm backup:local:quiet -- --root "$HOME/culturepeople-backups"
```

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

`backup:local:status` reads only local files. Use it to check media progress,
remaining media URLs, the latest backup result, backup lock state, and the
estimated number of low-load runs still needed. It also reports the backup
disk's available space and an estimate of how much space may remain after the
remaining media URLs are downloaded. If Supabase live export is quota-restricted
or unavailable, it also reports the fallback snapshot age so stale two-DB
coverage is visible without opening JSON files.

For DB-only recovery snapshots:

```bash
pnpm backup:local -- --no-media --out "$HOME/culturepeople-backups"
pnpm backup:local:verify
```

## Linux periodic backup

Copy the user systemd templates:

```bash
mkdir -p "$HOME/.config/systemd/user"
cp ops/systemd/culturepeople-local-backup.service "$HOME/.config/systemd/user/"
cp ops/systemd/culturepeople-local-backup.timer "$HOME/.config/systemd/user/"
```

Edit `~/.config/systemd/user/culturepeople-local-backup.service` if the repo is
not at `~/dev/monet-registry-main`. On the current Windows-mounted checkout,
set:

```text
Environment=CULTUREPEOPLE_REPO=/media/arbada/96B82074B8205551/Users/Documents/monet-registry-main
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
snapshot creation, verification, and local status reporting in that order.
Verification uses `--require-sqlite` so a missing or unreadable unified
snapshot fails the run. The full output is saved under
`~/culturepeople-backups/_logs`, keeping journal and chat output compact. The
SQLite step requires the `sqlite3` command on `PATH`; Ubuntu packages it as
`sqlite3`.

## Windows fallback

The same script works from PowerShell:

```powershell
pnpm backup:local -- --sample --no-media --out "$env:USERPROFILE\culturepeople-backups-test"
pnpm backup:local -- --out "$env:USERPROFILE\culturepeople-backups" --media-concurrency 1 --media-delay-ms 1500 --media-timeout-ms 90000 --media-retries 1 --media-retry-delay-ms 5000 --max-new-media 300 --min-free-gb 10 --retention-days 90
pnpm backup:local:sqlite -- --root "$env:USERPROFILE\culturepeople-backups"
pnpm backup:local:status -- --root "$env:USERPROFILE\culturepeople-backups"
```

For Task Scheduler:

- Program: `pnpm.cmd`
- Arguments:
  `backup:local -- --out "%USERPROFILE%\culturepeople-backups" --media-concurrency 1 --media-delay-ms 1500 --media-timeout-ms 90000 --media-retries 1 --media-retry-delay-ms 5000 --max-new-media 300 --min-free-gb 10 --retention-days 90`
- Start in: the repo folder
- Schedule: daily, off-peak time

Keep the backup folder outside the repo on both Linux and Windows.
