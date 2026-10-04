-- Additive indexes only. No article, log or policy rows are modified.
CREATE INDEX IF NOT EXISTS idx_articles_public_category_date
  ON articles(category, date DESC, created_at DESC)
  WHERE status = '게시' AND deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_articles_active_created
  ON articles(created_at DESC)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_auto_press_items_active_created
  ON auto_press_items(created_at ASC)
  WHERE status IN ('queued', 'running');
