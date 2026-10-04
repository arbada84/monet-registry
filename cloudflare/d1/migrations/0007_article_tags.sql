-- Normalize article tags so public tag pages use an indexed exact lookup.
-- Additive and idempotent; existing article rows are not changed.

PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS article_tags (
  article_id TEXT NOT NULL REFERENCES articles(id) ON DELETE CASCADE,
  tag TEXT NOT NULL,
  PRIMARY KEY (article_id, tag)
);

CREATE INDEX IF NOT EXISTS idx_article_tags_tag_article
  ON article_tags(tag, article_id);

INSERT OR IGNORE INTO article_tags (article_id, tag)
SELECT
  a.id,
  trim(CAST(item.value AS TEXT))
FROM articles AS a
JOIN json_each(
  CASE
    WHEN json_valid(a.tags) AND json_type(a.tags) = 'array' THEN a.tags
    ELSE '[]'
  END
) AS item
WHERE trim(CAST(item.value AS TEXT)) <> '';

WITH RECURSIVE split(article_id, rest, tag) AS (
  SELECT
    id,
    COALESCE(tags, '') || ',',
    ''
  FROM articles
  WHERE tags IS NOT NULL
    AND NOT (json_valid(tags) AND json_type(tags) = 'array')

  UNION ALL

  SELECT
    article_id,
    substr(rest, instr(rest, ',') + 1),
    trim(substr(rest, 1, instr(rest, ',') - 1))
  FROM split
  WHERE rest <> ''
)
INSERT OR IGNORE INTO article_tags (article_id, tag)
SELECT article_id, tag
FROM split
WHERE tag <> '';
