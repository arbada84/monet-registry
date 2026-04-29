-- CulturePeople Cloudflare D1 initial schema
-- Created: 2026-04-28
--
-- This schema is intentionally SQLite/D1-first. It keeps the current CMS fields
-- while separating media metadata from article rows so R2 usage can be audited.

PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS articles (
  id TEXT PRIMARY KEY,
  no INTEGER UNIQUE,
  title TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'news',
  date TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft',
  views INTEGER NOT NULL DEFAULT 0,
  body TEXT NOT NULL DEFAULT '',
  thumbnail TEXT,
  thumbnail_alt TEXT,
  tags TEXT,
  author TEXT,
  author_email TEXT,
  summary TEXT,
  slug TEXT UNIQUE,
  meta_description TEXT,
  og_image TEXT,
  scheduled_publish_at TEXT,
  updated_at TEXT,
  source_url TEXT,
  deleted_at TEXT,
  parent_article_id TEXT,
  review_note TEXT,
  audit_trail_json TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  ai_generated INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_articles_status_date ON articles(status, date DESC, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_articles_category_status_date ON articles(category, status, date DESC);
CREATE INDEX IF NOT EXISTS idx_articles_author_status_date ON articles(author, status, date DESC);
CREATE INDEX IF NOT EXISTS idx_articles_source_url ON articles(source_url);
CREATE INDEX IF NOT EXISTS idx_articles_deleted_at ON articles(deleted_at);
CREATE INDEX IF NOT EXISTS idx_articles_scheduled_publish_at ON articles(scheduled_publish_at);
CREATE INDEX IF NOT EXISTS idx_articles_views ON articles(views DESC);

CREATE TABLE IF NOT EXISTS article_search_index (
  article_id TEXT PRIMARY KEY REFERENCES articles(id) ON DELETE CASCADE,
  title TEXT NOT NULL DEFAULT '',
  summary TEXT NOT NULL DEFAULT '',
  tags TEXT NOT NULL DEFAULT '',
  body_excerpt TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_article_search_title ON article_search_index(title);
CREATE INDEX IF NOT EXISTS idx_article_search_tags ON article_search_index(tags);

CREATE TABLE IF NOT EXISTS site_settings (
  key TEXT PRIMARY KEY,
  value_json TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE IF NOT EXISTS comments (
  id TEXT PRIMARY KEY,
  article_id TEXT NOT NULL REFERENCES articles(id) ON DELETE CASCADE,
  article_title TEXT,
  author TEXT NOT NULL,
  content TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  status TEXT NOT NULL DEFAULT 'pending',
  ip TEXT,
  parent_id TEXT REFERENCES comments(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_comments_article_status_created ON comments(article_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_comments_status_created ON comments(status, created_at DESC);

CREATE TABLE IF NOT EXISTS view_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  article_id TEXT NOT NULL,
  timestamp TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  path TEXT NOT NULL DEFAULT '/',
  visitor_key TEXT,
  is_admin INTEGER NOT NULL DEFAULT 0,
  is_bot INTEGER NOT NULL DEFAULT 0,
  bot_name TEXT
);

CREATE INDEX IF NOT EXISTS idx_view_logs_timestamp ON view_logs(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_view_logs_article_timestamp ON view_logs(article_id, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_view_logs_visitor_day ON view_logs(visitor_key, substr(timestamp, 1, 10));

CREATE TABLE IF NOT EXISTS distribute_logs (
  id TEXT PRIMARY KEY,
  article_id TEXT NOT NULL,
  article_title TEXT NOT NULL,
  portal TEXT NOT NULL,
  status TEXT NOT NULL,
  timestamp TEXT NOT NULL,
  message TEXT NOT NULL DEFAULT ''
);

CREATE INDEX IF NOT EXISTS idx_distribute_logs_timestamp ON distribute_logs(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_distribute_logs_article ON distribute_logs(article_id);

CREATE TABLE IF NOT EXISTS notifications (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  message TEXT NOT NULL DEFAULT '',
  metadata_json TEXT NOT NULL DEFAULT '{}',
  read INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_notifications_read_created ON notifications(read, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_created ON notifications(created_at DESC);

CREATE TABLE IF NOT EXISTS media_objects (
  id TEXT PRIMARY KEY,
  provider TEXT NOT NULL DEFAULT 'r2',
  bucket TEXT NOT NULL,
  object_key TEXT NOT NULL,
  public_url TEXT NOT NULL,
  source_url TEXT,
  content_hash TEXT,
  content_type TEXT,
  byte_size INTEGER NOT NULL DEFAULT 0,
  width INTEGER,
  height INTEGER,
  article_id TEXT REFERENCES articles(id) ON DELETE SET NULL,
  usage_type TEXT NOT NULL DEFAULT 'article',
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  last_seen_at TEXT
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_media_objects_bucket_key ON media_objects(bucket, object_key);
CREATE INDEX IF NOT EXISTS idx_media_objects_hash ON media_objects(content_hash);
CREATE INDEX IF NOT EXISTS idx_media_objects_article ON media_objects(article_id);
CREATE INDEX IF NOT EXISTS idx_media_objects_created ON media_objects(created_at DESC);

CREATE TABLE IF NOT EXISTS cloudflare_usage_snapshots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  report_date TEXT NOT NULL,
  worker_requests INTEGER NOT NULL DEFAULT 0,
  worker_cpu_ms INTEGER NOT NULL DEFAULT 0,
  d1_rows_read INTEGER NOT NULL DEFAULT 0,
  d1_rows_written INTEGER NOT NULL DEFAULT 0,
  d1_storage_bytes INTEGER NOT NULL DEFAULT 0,
  r2_storage_bytes INTEGER NOT NULL DEFAULT 0,
  r2_class_a_ops INTEGER NOT NULL DEFAULT 0,
  r2_class_b_ops INTEGER NOT NULL DEFAULT 0,
  estimated_monthly_usd REAL NOT NULL DEFAULT 0,
  raw_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_cloudflare_usage_report_date ON cloudflare_usage_snapshots(report_date);

CREATE TABLE IF NOT EXISTS migration_runs (
  id TEXT PRIMARY KEY,
  source TEXT NOT NULL,
  started_at TEXT NOT NULL,
  completed_at TEXT,
  status TEXT NOT NULL,
  articles_total INTEGER NOT NULL DEFAULT 0,
  articles_imported INTEGER NOT NULL DEFAULT 0,
  media_total INTEGER NOT NULL DEFAULT 0,
  media_copied INTEGER NOT NULL DEFAULT 0,
  errors_json TEXT NOT NULL DEFAULT '[]',
  notes TEXT
);

CREATE TABLE IF NOT EXISTS migration_row_checksums (
  source_table TEXT NOT NULL,
  source_id TEXT NOT NULL,
  target_id TEXT NOT NULL,
  checksum TEXT NOT NULL,
  checked_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  PRIMARY KEY (source_table, source_id)
);
