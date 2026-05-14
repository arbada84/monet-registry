-- Auto-press duplicate guards
-- Created: 2026-05-14
--
-- Additive only. Keep previous migrations immutable after production apply.

PRAGMA foreign_keys = ON;

CREATE UNIQUE INDEX IF NOT EXISTS idx_articles_active_source_url_unique
  ON articles(source_url)
  WHERE deleted_at IS NULL
    AND source_url IS NOT NULL
    AND trim(source_url) <> '';
