# Phase 16-02 Summary: reconciliation and stuck-run behavior

## Completed

- Extended `reconcileAutoPressObservedRuns()` beyond no-item orphaned runs.
- Added stale Worker lease recovery:
  - expired `running` items with attempts remaining return to `queued`
  - reason code is `WORKER_LEASE_EXPIRED`
  - run counters are refreshed
  - a warning event is appended for operators
- Added exhausted queue item dead-lettering:
  - `queued` or expired `running` items at `max_attempts` become `fail`
  - `retryable=0` makes them visible through the D1 DLQ operating model
  - reason code falls back to `QUEUE_ITEMS_STUCK` when no better item reason exists
  - run counters are refreshed and an error event is appended
- Extended `pnpm check:auto-press-agent-loop` to guard the reconciliation reason codes and counter refresh call.
- Added unit tests for both final DLQ conversion and expired lease requeue behavior.

## Verification

- `pnpm test:unit -- auto-press-observability` - 55 files, 308 tests passed
- `pnpm check:auto-press-agent-loop`
- `pnpm ci:typecheck`

## Follow-Up

Continue with Phase 17:

- Validate manual run creation, polling, continuation, cancellation, and item-level retry from `/cam/auto-press`.
- Verify dashboard panels show D1 run summary, events, items, retry queue, DLQ, source quality, and health without leaking secrets.
