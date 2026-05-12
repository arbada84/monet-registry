# Supabase Quota Recovery Runbook

## Current Symptom

When Supabase returns HTTP `402` with `exceed_storage_size_quota`, the project is restricted at the platform level. In that state the app cannot reliably read `articles`, `site_settings`, or Storage bucket contents, so dashboards may look like there are `0` articles even though the data still exists.

## Immediate Recovery

1. Open the Supabase project dashboard.
2. Go to Storage usage and identify the bucket over quota. This project primarily uses the `images` bucket.
3. Free space through the Supabase dashboard or temporarily upgrade the project plan/quota.
4. After access is restored, run:

```bash
pnpm storage:report -- --bucket=images --top=30
pnpm predeploy:safety -- --allow-dirty --no-fetch
```

The storage report is read-only. It lists bucket totals, large year/month prefixes, and the largest objects so cleanup can be planned safely.

## Do Not Do Blind Deletes

Do not bulk-delete Storage objects directly from scripts until article bodies and thumbnails are checked. Many article records reference `images/YYYY/MM/...` URLs. Deleting referenced objects will break live article images.

Recommended cleanup order:

1. Use `pnpm storage:report -- --bucket=images --top=50`.
2. Review the largest prefixes and objects.
3. Cross-check whether those URLs are referenced by article `thumbnail` or `body`.
4. Delete only confirmed unused objects or old duplicate migration artifacts.

## Recurrence Prevention

Server-side image uploads now use the same image optimization settings as admin uploads:

- Non-GIF images are resized to the configured maximum width.
- Non-GIF images are converted to WebP when image optimization is enabled.
- Watermarks are applied after optimization.
- GIF files are preserved to avoid breaking animation.

The default image optimization setting is WebP quality `80` and max width `1920`.
