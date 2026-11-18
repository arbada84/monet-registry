-- Bound dedupe reads by the actual predicate, including on D1 without ANALYZE.
CREATE INDEX IF NOT EXISTS idx_articles_deleted_created
  ON articles(deleted_at, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_articles_status_deleted_created
  ON articles(status, deleted_at, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_auto_press_items_status_created
  ON auto_press_items(status, created_at);
CREATE INDEX IF NOT EXISTS idx_auto_press_items_status_source
  ON auto_press_items(status, source_url);
