# Phase 21-01 Summary: Registry Payload Baseline And CI Guard

**Completed:** 2026-05-25
**Milestone:** v5.0 Registry Payload And API Weight Reduction

## Completed Work

- Added `scripts/registry-payload-report.mjs` to measure generated registry artifact sizes and enforce thresholds.
- Added `docs/registry-payload-baseline.json` with the current 1,014 component registry baseline.
- Added `pnpm registry:payload-report` and `pnpm check:registry-payload`.
- Added `check:registry-payload` to `pnpm ci:all`.
- Opened v5.0 planning state from the Linux-native working tree and marked 21-01 complete.

## Baseline

- `public/generated/registry.json`: 1,316,916 bytes, 149,764 gzip bytes, 1,014 components.
- `registry.json`: 426,736 bytes.
- `public/generated/tag-index.json`: 313,531 bytes.
- Searchable text across component entries: 226,646 bytes.
- Largest component entry: 1,296 bytes.

## Next

- 21-02 should define the summary/detail/search artifact contract and migration checklist before changing service reads.
