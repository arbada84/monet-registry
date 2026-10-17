// Return aggregates only; do not download article bodies, keys, or log messages.
export const INDEXNOW_STATUS_SQL = `
WITH legacy AS (
  SELECT CASE WHEN json_valid(value_json) AND json_type(value_json)='array'
    THEN value_json ELSE '[]' END AS logs
  FROM site_settings WHERE key='cp-distribute-logs'
), successful_keys AS (
  SELECT CAST(article_id AS TEXT) AS article_key FROM distribute_logs
  WHERE status='success' AND portal LIKE '%IndexNow%'
  UNION
  SELECT CAST(json_extract(j.value,'$.articleId') AS TEXT)
  FROM legacy, json_each(legacy.logs) j
  WHERE json_extract(j.value,'$.status')='success'
    AND json_extract(j.value,'$.portal') LIKE '%IndexNow%'
), coverage AS (
  SELECT CASE WHEN by_id.article_key IS NOT NULL OR by_no.article_key IS NOT NULL THEN 1 ELSE 0 END AS covered
  FROM articles a
  LEFT JOIN successful_keys by_id ON by_id.article_key=CAST(a.id AS TEXT)
  LEFT JOIN successful_keys by_no ON by_no.article_key=CAST(a.no AS TEXT)
  WHERE a.status='게시' AND a.deleted_at IS NULL
)
SELECT COUNT(*) AS publishedArticles,
  COALESCE(SUM(covered),0) AS successfulLogs,
  COALESCE(SUM(1-covered),0) AS candidates,
  (SELECT COUNT(*) FROM site_settings WHERE key='cp-distribute-logs'
    AND CASE WHEN json_valid(value_json) THEN json_type(value_json) NOT IN ('array','null') ELSE 1 END) AS invalidLegacy
FROM coverage`;

export const INDEXNOW_FAILURES_SQL = `
SELECT COUNT(*) AS failed,
  COALESCE(SUM(CASE WHEN message LIKE '%401%' OR message LIKE '%403%'
    OR message LIKE '%auth_failed%' THEN 1 ELSE 0 END),0) AS authFailed
FROM distribute_logs WHERE portal LIKE '%IndexNow%' AND status='failed' AND timestamp>=?`;

export async function collectIndexNowStatus(query, { now = new Date() } = {}) {
  const [coverage] = await query(INDEXNOW_STATUS_SQL);
  const since = new Date(now.getTime() - 24 * 3_600_000).toISOString();
  const [failures] = await query(INDEXNOW_FAILURES_SQL, [since]);
  const count = (value) => {
    if (!Number.isSafeInteger(value) || value < 0) throw new Error("Invalid IndexNow aggregate count");
    return value;
  };
  const publishedArticles = count(coverage?.publishedArticles);
  const successfulLogs = count(coverage?.successfulLogs);
  const candidates = count(coverage?.candidates);
  const invalidLegacy = count(coverage?.invalidLegacy);
  const failed = count(failures?.failed);
  const authFailed = count(failures?.authFailed);
  if (successfulLogs + candidates !== publishedArticles || authFailed > failed) throw new Error("Inconsistent IndexNow aggregate counts");
  return {
    ok: invalidLegacy === 0 && failed === 0,
    generatedAt: now.toISOString(),
    mode: "read-only-status",
    source: "d1",
    scope: "published-coverage-and-last-24h-log-failures",
    publishedArticles, successfulLogs, candidates, authFailed,
    failedLast24h: failed,
    unclassifiedFailuresLast24h: failed - authFailed,
    invalidLegacy,
    submittedUrls: 0,
    note: "Visible submission logs are not proof of search-engine indexing. Two read queries are not an atomic database snapshot.",
  };
}
