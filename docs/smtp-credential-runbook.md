# SMTP Credential Runbook

## Purpose

CulturePeople resolves SMTP settings from Vercel environment variables first. Existing `cp-newsletter-settings` DB values remain as a compatibility fallback, but production credentials should live in Vercel.

## Required Vercel Variables

Set these in the Vercel project for Production, Preview, and Development as needed:

| Variable | Required | Notes |
| --- | --- | --- |
| `SMTP_HOST` | Yes | SMTP server host, for example `smtp.example.com`. |
| `SMTP_PORT` | Yes | Usually `465` for SSL or `587` for STARTTLS. |
| `SMTP_USER` | Yes | SMTP account username, often an email address. |
| `SMTP_PASS` | Yes | SMTP password or app password. Never store this in repo files. |
| `SMTP_SECURE` | Yes | `true` for SSL, `false` for STARTTLS. |
| `SMTP_SENDER_EMAIL` | Recommended | Sender email used in newsletter/system mail. Falls back to `SMTP_USER`. |
| `SMTP_SENDER_NAME` | Recommended | Sender display name. Falls back to `컬처피플`. |
| `SMTP_REPLY_TO_EMAIL` | Optional | Reply-to email. Falls back to sender email. |

## Fallback Behavior

- Runtime sending uses env values before DB values for host, port, user, password, secure mode, sender, and reply-to.
- If an env value is present, admin saves preserve the existing DB fallback for that field instead of overwriting it with masked or blank values.
- `/api/db/settings?key=cp-newsletter-settings` returns `smtpRuntimeStatus` for admin UI display, but never returns raw SMTP passwords.
- The DB `smtpPass` value is only a temporary fallback. Remove it after the Vercel env migration is verified.

## Migration Steps

1. Add the required SMTP variables in Vercel.
2. Trigger a production deployment from `main`.
3. Open `/cam/settings` or `/cam/newsletter` and confirm the SMTP status shows Vercel-managed fields.
4. Run the SMTP connection test from the admin screen.
5. Send a small manual newsletter only after an operator explicitly approves a live send.
6. After successful smoke checks, clear legacy DB SMTP password data during a planned maintenance window.

## Smoke Checks

- `/cam/settings` shows SMTP runtime status and does not display a password value.
- `/cam/newsletter` shows the same SMTP runtime status.
- `/api/smtp/test` succeeds with env-managed SMTP settings.
- Manual newsletter send and article publish notification continue to use the shared SMTP resolver.
- Production `/api/health` remains `status: ok` after deployment.

## Rollback

If env-managed SMTP fails, remove or correct the Vercel SMTP variables and redeploy. The app will fall back to DB settings only for fields that do not have an env value.
