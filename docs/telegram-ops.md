# CulturePeople Telegram Operations

This document covers the first production-safe Telegram rollout: outbound notifications, daily report, and setup/test endpoints.

## Environment Variables

Set these only in server-side environments such as Vercel Environment Variables.

```env
TELEGRAM_ENABLED=true
TELEGRAM_BOT_TOKEN=replace_with_rotated_token
TELEGRAM_ALLOWED_CHAT_IDS=123456789
TELEGRAM_WEBHOOK_SECRET=long_random_path_secret
TELEGRAM_WEBHOOK_HEADER_SECRET=optional_telegram_header_secret
TELEGRAM_ALLOW_TEMP_LOGIN=false
TELEGRAM_NOTIFICATION_TYPES=cron_failure,ai_failure,security,mail_failure
TELEGRAM_TIMEOUT_MS=3500
```

Important: rotate any bot token that has been pasted into chat, logs, screenshots, or issue trackers.

## Chat ID Setup

1. Send `/start` to the bot from the Telegram account that should receive alerts.
2. Sign in to `/cam`.
3. Open `GET /api/telegram/chat-id`.
4. Copy the returned `chatIds` value into `TELEGRAM_ALLOWED_CHAT_IDS`.
5. Deploy or restart the server.
6. Send a test with `POST /api/telegram/test`.

The numeric id returned by `getMe` is the bot id, not the admin chat id.

## Admin UI

After deployment, use `/cam/telegram` to:

- Inspect Telegram environment status without exposing the bot token
- Register or remove the webhook
- Send a test message
- Discover chat id candidates after sending `/start` to the bot
- Review recent delivery logs for message/webhook success or failure
- Review pending and completed command audit logs

## Commands

The webhook endpoint is:

```text
https://culturepeople.co.kr/api/telegram/webhook/{TELEGRAM_WEBHOOK_SECRET}
```

Register it with Telegram after deployment:

```bash
curl -X POST "https://api.telegram.org/bot$TELEGRAM_BOT_TOKEN/setWebhook" \
  -H "Content-Type: application/json" \
  -d '{"url":"https://culturepeople.co.kr/api/telegram/webhook/REPLACE_SECRET","secret_token":"REPLACE_HEADER_SECRET"}'
```

Or use the protected server-side endpoint after signing in to `/cam`:

- `GET /api/telegram/webhook-config`: inspect Telegram webhook status
- `POST /api/telegram/webhook-config`: register the configured webhook URL
- `DELETE /api/telegram/webhook-config`: remove the webhook
- `GET /api/telegram/deliveries`: inspect recent Telegram delivery results
- `GET /api/telegram/audit`: inspect pending and completed Telegram command actions

Supported commands:

- `/status`: automation and Telegram configuration status
- `/today`: articles published today
- `/top`: top articles this month
- `/mails`: recently synced mail
- `/report`: generate the daily report immediately
- `/run_auto_press [count]`: request manual auto-press execution
- `/article_off <id>`: request article deactivation
- `/article_delete <id>`: request article soft delete to trash
- `/maintenance_on [minutes] [message]`: request public maintenance mode
- `/maintenance_off`: request maintenance mode off
- `/grant_temp_login [minutes]`: request a one-time temporary admin recovery link
- `/confirm <code>`: confirm a pending action within 2 minutes
- `/cancel <code>`: cancel a pending action
- `/help`: command list

Only chat ids in `TELEGRAM_ALLOWED_CHAT_IDS` are accepted. Mutating commands require a second `/confirm <code>` step and are recorded in `cp-telegram-command-audit`.

## Delivery Log

Every high-level Telegram send and webhook registration/removal stores a compact operational record in `cp-telegram-delivery-log`. It includes timestamp, action, success/failure, Telegram method, target chat count, a short preview, and any failure message. The log is intentionally capped to the latest 200 records and is best-effort only: a logging failure never blocks the notification itself.

## Maintenance Mode

`/maintenance_on 30 서비스 점검 중입니다` stores `cp-maintenance-mode` and replaces public pages with a maintenance screen for 30 minutes. Admin pages under `/cam`, Telegram webhook, health checks, and API routes are not replaced by the public maintenance screen.

## Recovery Login

`/grant_temp_login 5` is disabled unless `TELEGRAM_ALLOW_TEMP_LOGIN=true` is set. When enabled, it creates a one-time recovery link that expires in at most 10 minutes and stores only a SHA-256 hash of the token in `cp-admin-recovery-tokens`.

## Current Notification Scope

- Auto press registration sends title, source, registered time, status, summary, image when available, public article URL, admin list URL, and source URL.
- Auto news registration also sends a notice if it is manually run, but auto news should remain disabled by default because of copyright risk.
- Mail sync sends a batch summary for newly arrived mail.
- Existing critical DB notifications are mirrored to Telegram for `cron_failure`, `ai_failure`, `security`, and `mail_failure`.
- Daily report route is `/api/cron/telegram-daily-report` and is scheduled for `0 0 * * *`, which is 09:00 KST when Vercel cron is evaluated in UTC.

## Safety Notes

- `/article_delete` performs a soft delete only. It moves the article to trash and does not purge database rows or storage files.
- Temporary login links should stay disabled unless there is an active admin access incident.
- Do not send full third-party article bodies to Telegram. Use summaries and links.
- Visitor reporting uses a salted daily visitor hash. It estimates unique visitors without storing raw IP addresses.

## Verification

- `pnpm test:unit -- telegram-notify` verifies Telegram status masking and webhook registration payloads without calling the real Telegram API.
- `pnpm predeploy:safety -- --allow-dirty --no-fetch` checks for obvious Telegram token leaks in source files and validates required Telegram environment combinations when `TELEGRAM_ENABLED=true`.
