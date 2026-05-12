-- Auto-press observability and retry queue
-- Created: 2026-05-03
--
-- These tables make every manual/cron auto-press run auditable at run,
-- article, event, and retry-queue level.

PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS auto_press_runs (
  id TEXT PRIMARY KEY,
  source TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'running',
  preview INTEGER NOT NULL DEFAULT 0,
  requested_count INTEGER NOT NULL DEFAULT 0,
  processed_count INTEGER NOT NULL DEFAULT 0,
  published_count INTEGER NOT NULL DEFAULT 0,
  previewed_count INTEGER NOT NULL DEFAULT 0,
  skipped_count INTEGER NOT NULL DEFAULT 0,
  failed_count INTEGER NOT NULL DEFAULT 0,
  queued_count INTEGER NOT NULL DEFAULT 0,
  started_at TEXT NOT NULL,
  completed_at TEXT,
  last_event_at TEXT,
  duration_ms INTEGER,
  triggered_by TEXT,
  options_json TEXT NOT NULL DEFAULT '{}',
  warnings_json TEXT NOT NULL DEFAULT '[]',
  media_storage_json TEXT NOT NULL DEFAULT '{}',
  summary_json TEXT NOT NULL DEFAULT '{}',
  error_code TEXT,
  error_message TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_auto_press_runs_status_started ON auto_press_runs(status, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_auto_press_runs_started ON auto_press_runs(started_at DESC);

CREATE TABLE IF NOT EXISTS auto_press_items (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL REFERENCES auto_press_runs(id) ON DELETE CASCADE,
  source_id TEXT,
  source_name TEXT,
  source_url TEXT,
  source_item_id TEXT,
  bo_table TEXT,
  title TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'queued',
  reason_code TEXT,
  reason_message TEXT,
  article_id TEXT,
  article_no INTEGER,
  retryable INTEGER NOT NULL DEFAULT 0,
  retry_count INTEGER NOT NULL DEFAULT 0,
  next_retry_at TEXT,
  body_chars INTEGER NOT NULL DEFAULT 0,
  image_count INTEGER NOT NULL DEFAULT 0,
  warnings_json TEXT NOT NULL DEFAULT '[]',
  raw_json TEXT NOT NULL DEFAULT '{}',
  started_at TEXT,
  completed_at TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_auto_press_items_run ON auto_press_items(run_id, created_at ASC);
CREATE INDEX IF NOT EXISTS idx_auto_press_items_status ON auto_press_items(status, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_auto_press_items_source_url ON auto_press_items(source_url);
CREATE INDEX IF NOT EXISTS idx_auto_press_items_reason ON auto_press_items(reason_code, updated_at DESC);

CREATE TABLE IF NOT EXISTS auto_press_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id TEXT NOT NULL REFERENCES auto_press_runs(id) ON DELETE CASCADE,
  item_id TEXT REFERENCES auto_press_items(id) ON DELETE SET NULL,
  level TEXT NOT NULL DEFAULT 'info',
  code TEXT NOT NULL,
  message TEXT NOT NULL DEFAULT '',
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_auto_press_events_run_created ON auto_press_events(run_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_auto_press_events_item_created ON auto_press_events(item_id, created_at DESC);

CREATE TABLE IF NOT EXISTS auto_press_retry_queue (
  id TEXT PRIMARY KEY,
  run_id TEXT REFERENCES auto_press_runs(id) ON DELETE SET NULL,
  item_id TEXT REFERENCES auto_press_items(id) ON DELETE SET NULL,
  article_id TEXT,
  article_no INTEGER,
  title TEXT NOT NULL DEFAULT '',
  source_url TEXT,
  source_name TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  reason_code TEXT NOT NULL,
  reason_message TEXT NOT NULL DEFAULT '',
  attempts INTEGER NOT NULL DEFAULT 0,
  max_attempts INTEGER NOT NULL DEFAULT 6,
  next_attempt_at TEXT,
  last_attempt_at TEXT,
  payload_json TEXT NOT NULL DEFAULT '{}',
  result_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_auto_press_retry_status_next ON auto_press_retry_queue(status, next_attempt_at ASC);
CREATE INDEX IF NOT EXISTS idx_auto_press_retry_article ON auto_press_retry_queue(article_id);
CREATE INDEX IF NOT EXISTS idx_auto_press_retry_run ON auto_press_retry_queue(run_id, created_at DESC);
