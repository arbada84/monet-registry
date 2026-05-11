# CulturePeople Auto Press Worker

Cloudflare Worker that processes `auto_press_items` outside Vercel.

## Required bindings

- `DB`: Cloudflare D1 database with `0001`, `0002`, and `0003` migrations applied.
- `AUTO_PRESS_QUEUE`: Cloudflare Queue named `auto-press-jobs`.
- `MEDIA_BUCKET`: R2 bucket for article images.

## Required secrets

- `AUTO_PRESS_WORKER_SECRET`: shared secret for `/enqueue` and `/process`.
- `GEMINI_API_KEY`: Gemini API key for AI editing.

## Optional variables

- `PUBLIC_MEDIA_BASE_URL`: public R2 bucket or custom-domain base URL.
- `AUTO_PRESS_WORKER_BATCH_SIZE`: scheduled polling batch size, default `3`.
- `AUTO_PRESS_DAILY_AI_LIMIT`: daily AI call cap, default `50`.
- `AUTO_PRESS_DAILY_PUBLISH_LIMIT`: daily publish cap, default `30`.
- `AUTO_PRESS_DAILY_IMAGE_LIMIT`: daily image upload cap, default `50`.

## Endpoints

- `GET /health`: binding and configuration status.
- `POST /enqueue`: enqueue queued D1 items for a run. Body: `{ "runId": "...", "limit": 100 }`.
- `POST /process`: protected manual D1 polling fallback. Body: `{ "limit": 3 }`.

If Queue publishing is not wired yet, the scheduled trigger still polls D1 queued items and processes them in small batches.
