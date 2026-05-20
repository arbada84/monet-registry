# Phase 13-05 Summary: final size compliance pass

## Status

- Implemented and locally verified.
- This was a closure pass after Phase 13-02/13-03/13-04 to enforce the stated "under 300 lines per extracted file" maintainability target.

## Changes

- Split article edit media handlers out of `useArticleEditor.ts`.
  - Added `hooks/articleEditorMedia.ts`.
  - Keeps thumbnail upload and external image reupload behavior isolated and easier to test.
- Split article edit save flow out of `useArticleEditor.ts`.
  - Added `hooks/articleEditorSave.ts`.
  - Keeps save validation, timeout progress, thumbnail stripping, `updateArticle`, and activity logging in one focused unit.
- Split article edit side effects out of `useArticleEditor.ts`.
  - Added `hooks/useArticleEditorEffects.ts`.
  - Keeps article loading, admin settings loading, distribution defaults, dirty draft persistence, keyboard save shortcut, and timer cleanup outside the page state composer.
- Split watermark image upload UI out of `WatermarkSettingsSection.tsx`.
  - Added `WatermarkImageUpload.tsx`.
  - Preserves `noWatermark=1` upload behavior and 2MB client-side size guard.

## Size Evidence

All files in the settings and article edit split are now below 300 lines.

| Area | Largest file after pass | Lines |
|------|--------------------------|-------|
| Article edit | `useArticleEditor.ts` | 261 |
| Article edit | `ArticleMetadataForm.tsx` | 252 |
| Article edit | `useArticleEditorEffects.ts` | 171 |
| Settings | `SmtpSettingsSection.tsx` | 282 |
| Settings | `WatermarkSettingsSection.tsx` | 269 |
| Settings | `useSettings.ts` | 208 |

## Verification

- `pnpm exec tsc --noEmit --pretty false`: passed.
- `pnpm test:unit`: 54 files, 301 tests passed.
- `pnpm ci:lint`: passed.
- `pnpm ci:validate`: passed with pre-existing metadata warnings, 0 invalid entries.
- `pnpm check:automation`: passed.
- `node scripts/auto-press-agent-loop-verify.mjs`: passed.
- `pnpm build`: passed.
- Targeted admin E2E with mutation enabled:
  - command: `E2E_ADMIN_MUTATION_ENABLED=1 pnpm test:e2e -- e2e/admin/article-lifecycle.test.ts e2e/admin/settings.test.ts`
  - result: 2 files passed, 4 tests passed, 1 publish/public-page test skipped by safety gate.

## Notes

- No user-facing behavior was intentionally changed.
- The first `pnpm build` attempt exceeded the tool timeout but completed in the background. A second explicit `pnpm build` run completed successfully and captured the green exit code.
