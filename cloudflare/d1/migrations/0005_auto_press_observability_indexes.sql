-- Auto-press observability indexes and article traceability
-- Created: 2026-05-24
--
-- Additive only. Keep previous migrations immutable after production apply.

PRAGMA foreign_keys = ON;

ALTER TABLE articles ADD COLUMN auto_press_item_id TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_articles_auto_press_item_id_unique
  ON articles(auto_press_item_id)
  WHERE auto_press_item_id IS NOT NULL
    AND trim(auto_press_item_id) <> '';

CREATE INDEX IF NOT EXISTS idx_auto_press_runs_reconcile
  ON auto_press_runs(status, updated_at, last_event_at, started_at, created_at);

CREATE INDEX IF NOT EXISTS idx_auto_press_items_dead_letter
  ON auto_press_items(status, retryable, completed_at, updated_at, created_at);

CREATE INDEX IF NOT EXISTS idx_auto_press_items_source_quality
  ON auto_press_items(source_id, source_name, created_at);

CREATE INDEX IF NOT EXISTS idx_auto_press_retry_due
  ON auto_press_retry_queue(status, attempts, max_attempts, next_attempt_at, created_at);
