-- Auto-press queue controls, leases, and usage counters
-- Created: 2026-05-12
--
-- Additive only. Do not edit 0002_auto_press_observability.sql after it has
-- been applied to production D1.

PRAGMA foreign_keys = ON;

ALTER TABLE auto_press_runs ADD COLUMN execution_mode TEXT;
ALTER TABLE auto_press_runs ADD COLUMN candidate_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE auto_press_runs ADD COLUMN message TEXT;

ALTER TABLE auto_press_items ADD COLUMN priority INTEGER NOT NULL DEFAULT 100;
ALTER TABLE auto_press_items ADD COLUMN attempt_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE auto_press_items ADD COLUMN max_attempts INTEGER NOT NULL DEFAULT 3;
ALTER TABLE auto_press_items ADD COLUMN lease_until TEXT;
ALTER TABLE auto_press_items ADD COLUMN canonical_url TEXT;
ALTER TABLE auto_press_items ADD COLUMN normalized_title TEXT;
ALTER TABLE auto_press_items ADD COLUMN published_at TEXT;
ALTER TABLE auto_press_items ADD COLUMN image_url TEXT;
ALTER TABLE auto_press_items ADD COLUMN image_check_json TEXT;
ALTER TABLE auto_press_items ADD COLUMN ai_provider TEXT;
ALTER TABLE auto_press_items ADD COLUMN ai_model TEXT;

CREATE INDEX IF NOT EXISTS idx_auto_press_items_queue_ready
  ON auto_press_items(status, next_retry_at, priority, created_at);

CREATE INDEX IF NOT EXISTS idx_auto_press_items_lease
  ON auto_press_items(status, lease_until);

CREATE INDEX IF NOT EXISTS idx_auto_press_items_canonical_url
  ON auto_press_items(canonical_url);

CREATE INDEX IF NOT EXISTS idx_auto_press_items_normalized_title
  ON auto_press_items(normalized_title, published_at);

CREATE TABLE IF NOT EXISTS auto_press_source_stats (
  id TEXT PRIMARY KEY,
  date TEXT NOT NULL,
  source_id TEXT NOT NULL,
  source_name TEXT,
  candidate_count INTEGER NOT NULL DEFAULT 0,
  queued_count INTEGER NOT NULL DEFAULT 0,
  processed_count INTEGER NOT NULL DEFAULT 0,
  published_count INTEGER NOT NULL DEFAULT 0,
  skipped_duplicate_count INTEGER NOT NULL DEFAULT 0,
  skipped_no_image_count INTEGER NOT NULL DEFAULT 0,
  failed_count INTEGER NOT NULL DEFAULT 0,
  ai_call_count INTEGER NOT NULL DEFAULT 0,
  image_upload_count INTEGER NOT NULL DEFAULT 0,
  consecutive_failures INTEGER NOT NULL DEFAULT 0,
  last_failure_code TEXT,
  last_failure_message TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_auto_press_source_stats_date_source
  ON auto_press_source_stats(date, source_id);

CREATE INDEX IF NOT EXISTS idx_auto_press_source_stats_source_date
  ON auto_press_source_stats(source_id, date DESC);

CREATE TABLE IF NOT EXISTS auto_press_daily_usage (
  date TEXT PRIMARY KEY,
  jobs_processed INTEGER NOT NULL DEFAULT 0,
  ai_calls INTEGER NOT NULL DEFAULT 0,
  publishes INTEGER NOT NULL DEFAULT 0,
  image_uploads INTEGER NOT NULL DEFAULT 0,
  source_fetch_failures INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
