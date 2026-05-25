# CulturePeople local backup runbook

This runbook backs up CulturePeople article data and article media to this
computer without writing to the production service.

## Backup shape

Each run creates a timestamped folder under the backup root:

```text
~/culturepeople-backups/
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
      merge-report.json
      media-candidates.json
    media/
      files/<hash-prefix>/<content-hash>.<ext>
      media-manifest.json
    backup-manifest.json
```

The two online databases are preserved separately in `raw/d1` and
`raw/supabase`. `merged/articles.json` is the unified local article backup:
D1 is treated as the current primary DB, and Supabase-only articles are kept.
Duplicate articles are reported in `merged/merge-report.json`.

## Safety defaults

- Remote access is read-only.
- The script talks to Cloudflare D1 and public managed media URLs directly,
  not through the Next.js app server.
- Default page sizes are small: D1 `100`, Supabase `100`.
- Default delays are conservative: D1 `200ms`, Supabase `300ms`, media `700ms`.
- Media concurrency defaults to `1`.
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

Inspect:

```bash
ls "$HOME/culturepeople-backups-test"
```

Open the latest `backup-manifest.json` and confirm:

- `sources.d1.ok` is `true`
- `sources.supabase.ok` is `true`
- `sources.supabase.source` is either `live_rest` or `local_fallback`
- `merge.kept.total` is greater than `0`
- `media.downloaded` is greater than `0` for the media test

## Full backup

Use the low-load defaults:

```bash
pnpm backup:local -- --out "$HOME/culturepeople-backups" --media-concurrency 1 --media-delay-ms 700 --retention-days 90
```

For DB-only recovery snapshots:

```bash
pnpm backup:local -- --no-media --out "$HOME/culturepeople-backups"
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

## Windows fallback

The same script works from PowerShell:

```powershell
pnpm backup:local -- --sample --no-media --out "$env:USERPROFILE\culturepeople-backups-test"
pnpm backup:local -- --out "$env:USERPROFILE\culturepeople-backups" --media-concurrency 1 --media-delay-ms 700 --retention-days 90
```

For Task Scheduler:

- Program: `pnpm.cmd`
- Arguments:
  `backup:local -- --out "%USERPROFILE%\culturepeople-backups" --media-concurrency 1 --media-delay-ms 700 --retention-days 90`
- Start in: the repo folder
- Schedule: daily, off-peak time

Keep the backup folder outside the repo on both Linux and Windows.
