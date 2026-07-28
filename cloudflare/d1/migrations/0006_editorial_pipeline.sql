-- CulturePeople evidence-based editorial pipeline (shadow / draft-only)
-- Additive migration. It does not modify articles or auto-press tables.

PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS editorial_runtime_state (
  singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
  generation INTEGER NOT NULL DEFAULT 0,
  feature_enabled INTEGER NOT NULL DEFAULT 0,
  shadow_enabled INTEGER NOT NULL DEFAULT 0,
  draft_enabled INTEGER NOT NULL DEFAULT 0,
  auto_publish_enabled INTEGER NOT NULL DEFAULT 0 CHECK (auto_publish_enabled = 0),
  kill_switch_verified_at TEXT,
  updated_by TEXT,
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

INSERT OR IGNORE INTO editorial_runtime_state
  (singleton, generation, feature_enabled, shadow_enabled, draft_enabled, auto_publish_enabled)
VALUES (1, 0, 0, 0, 0, 0);

CREATE TABLE IF NOT EXISTS editorial_sources (
  id TEXT PRIMARY KEY,
  source_type TEXT NOT NULL,
  source_name TEXT NOT NULL DEFAULT '',
  source_url TEXT,
  canonical_url TEXT,
  title TEXT NOT NULL DEFAULT '',
  published_at TEXT,
  collected_at TEXT,
  content_hash TEXT,
  fixture INTEGER NOT NULL DEFAULT 0,
  usage_basis TEXT NOT NULL DEFAULT 'unconfirmed',
  rights_grade TEXT NOT NULL DEFAULT 'D',
  allowed_uses_json TEXT NOT NULL DEFAULT '[]',
  evidence_eligible INTEGER NOT NULL DEFAULT 0,
  training_eligible INTEGER NOT NULL DEFAULT 0,
  pii_status TEXT NOT NULL DEFAULT 'not_scanned',
  retention_class TEXT NOT NULL DEFAULT 'metadata_only',
  block_reason TEXT,
  provenance_json TEXT NOT NULL DEFAULT '{}',
  generation INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  CHECK (fixture = 0 OR (evidence_eligible = 0 AND training_eligible = 0))
);

CREATE INDEX IF NOT EXISTS idx_editorial_sources_type_updated
  ON editorial_sources(source_type, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_editorial_sources_eligibility
  ON editorial_sources(evidence_eligible, fixture, updated_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_editorial_sources_canonical_url
  ON editorial_sources(canonical_url) WHERE canonical_url IS NOT NULL AND canonical_url <> '';

CREATE TABLE IF NOT EXISTS editorial_source_snapshots (
  id TEXT PRIMARY KEY,
  source_id TEXT NOT NULL REFERENCES editorial_sources(id) ON DELETE CASCADE,
  snapshot_hash TEXT NOT NULL,
  storage_provider TEXT NOT NULL DEFAULT 'metadata_only',
  storage_key TEXT,
  excerpt_only INTEGER NOT NULL DEFAULT 1,
  rights_basis TEXT NOT NULL DEFAULT 'unconfirmed',
  captured_at TEXT NOT NULL,
  expires_at TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  UNIQUE(source_id, snapshot_hash)
);

CREATE TABLE IF NOT EXISTS editorial_candidates (
  id TEXT PRIMARY KEY,
  parent_auto_press_item_id TEXT,
  parent_article_id TEXT,
  parent_article_no INTEGER,
  state TEXT NOT NULL DEFAULT 'collected',
  article_type TEXT NOT NULL DEFAULT 'CP-0',
  title TEXT NOT NULL DEFAULT '',
  assigned_to TEXT,
  high_risk_json TEXT NOT NULL DEFAULT '[]',
  gate_errors_json TEXT NOT NULL DEFAULT '[]',
  evidence_coverage REAL NOT NULL DEFAULT 0,
  human_review_required INTEGER NOT NULL DEFAULT 1,
  auto_publish_allowed INTEGER NOT NULL DEFAULT 0 CHECK (auto_publish_allowed = 0),
  current_version INTEGER NOT NULL DEFAULT 1,
  generation INTEGER NOT NULL DEFAULT 0,
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_editorial_candidates_state_updated
  ON editorial_candidates(state, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_editorial_candidates_assignee
  ON editorial_candidates(assigned_to, state, updated_at DESC);

CREATE TABLE IF NOT EXISTS editorial_candidate_versions (
  candidate_id TEXT NOT NULL REFERENCES editorial_candidates(id) ON DELETE CASCADE,
  version INTEGER NOT NULL,
  title TEXT NOT NULL DEFAULT '',
  outline_json TEXT NOT NULL DEFAULT '[]',
  draft_text TEXT NOT NULL DEFAULT '',
  draft_hash TEXT,
  editor_text TEXT NOT NULL DEFAULT '',
  editor_hash TEXT,
  evidence_package_hash TEXT,
  change_summary TEXT NOT NULL DEFAULT '',
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  PRIMARY KEY (candidate_id, version)
);

CREATE TABLE IF NOT EXISTS editorial_claims (
  id TEXT PRIMARY KEY,
  candidate_id TEXT NOT NULL REFERENCES editorial_candidates(id) ON DELETE CASCADE,
  candidate_version INTEGER NOT NULL,
  claim_kind TEXT NOT NULL DEFAULT 'unknown',
  importance TEXT NOT NULL DEFAULT 'supporting',
  claim_text TEXT NOT NULL,
  claim_hash TEXT NOT NULL,
  review_status TEXT NOT NULL DEFAULT 'unresolved',
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  FOREIGN KEY (candidate_id, candidate_version)
    REFERENCES editorial_candidate_versions(candidate_id, version) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_editorial_claims_candidate
  ON editorial_claims(candidate_id, candidate_version, importance);

CREATE TABLE IF NOT EXISTS editorial_evidence_links (
  id TEXT PRIMARY KEY,
  claim_id TEXT NOT NULL REFERENCES editorial_claims(id) ON DELETE CASCADE,
  source_id TEXT NOT NULL REFERENCES editorial_sources(id) ON DELETE RESTRICT,
  snapshot_id TEXT REFERENCES editorial_source_snapshots(id) ON DELETE SET NULL,
  relation TEXT NOT NULL DEFAULT 'unresolved',
  excerpt TEXT NOT NULL DEFAULT '',
  excerpt_hash TEXT NOT NULL,
  evidence_eligible INTEGER NOT NULL DEFAULT 0,
  fixture INTEGER NOT NULL DEFAULT 0,
  reviewer_status TEXT NOT NULL DEFAULT 'unreviewed',
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  CHECK (fixture = 0 OR evidence_eligible = 0),
  UNIQUE(claim_id, source_id, excerpt_hash)
);

CREATE INDEX IF NOT EXISTS idx_editorial_evidence_claim
  ON editorial_evidence_links(claim_id, relation);

CREATE TABLE IF NOT EXISTS editorial_origin_clusters (
  id TEXT PRIMARY KEY,
  candidate_id TEXT NOT NULL REFERENCES editorial_candidates(id) ON DELETE CASCADE,
  fingerprint TEXT NOT NULL,
  independent_origin_count INTEGER NOT NULL DEFAULT 1,
  fixture INTEGER NOT NULL DEFAULT 0,
  method_version TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE IF NOT EXISTS editorial_origin_cluster_members (
  cluster_id TEXT NOT NULL REFERENCES editorial_origin_clusters(id) ON DELETE CASCADE,
  source_id TEXT NOT NULL REFERENCES editorial_sources(id) ON DELETE CASCADE,
  similarity REAL NOT NULL DEFAULT 0,
  PRIMARY KEY (cluster_id, source_id)
);

CREATE TABLE IF NOT EXISTS editorial_reviews (
  id TEXT PRIMARY KEY,
  candidate_id TEXT NOT NULL REFERENCES editorial_candidates(id) ON DELETE CASCADE,
  candidate_version INTEGER NOT NULL,
  review_type TEXT NOT NULL,
  decision TEXT NOT NULL,
  reviewer_name TEXT NOT NULL,
  reviewer_role TEXT NOT NULL,
  is_fixture INTEGER NOT NULL DEFAULT 0,
  memo TEXT NOT NULL DEFAULT '',
  labels_json TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  FOREIGN KEY (candidate_id, candidate_version)
    REFERENCES editorial_candidate_versions(candidate_id, version) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_editorial_reviews_candidate
  ON editorial_reviews(candidate_id, candidate_version, created_at DESC);

CREATE TABLE IF NOT EXISTS editorial_ai_runs (
  id TEXT PRIMARY KEY,
  candidate_id TEXT NOT NULL REFERENCES editorial_candidates(id) ON DELETE CASCADE,
  candidate_version INTEGER NOT NULL,
  provider TEXT NOT NULL,
  model TEXT NOT NULL,
  prompt_version TEXT NOT NULL,
  evidence_ids_json TEXT NOT NULL DEFAULT '[]',
  input_hash TEXT NOT NULL,
  output_hash TEXT,
  validation_json TEXT NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'planned',
  error_code TEXT,
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  FOREIGN KEY (candidate_id, candidate_version)
    REFERENCES editorial_candidate_versions(candidate_id, version) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS editorial_audit_logs (
  id TEXT PRIMARY KEY,
  candidate_id TEXT REFERENCES editorial_candidates(id) ON DELETE SET NULL,
  event TEXT NOT NULL,
  actor_name TEXT NOT NULL,
  actor_role TEXT NOT NULL,
  request_id TEXT,
  idempotency_key TEXT,
  before_hash TEXT,
  after_hash TEXT,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_editorial_audit_idempotency
  ON editorial_audit_logs(idempotency_key)
  WHERE idempotency_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_editorial_audit_candidate_created
  ON editorial_audit_logs(candidate_id, created_at DESC);

CREATE TABLE IF NOT EXISTS editorial_corrections (
  id TEXT PRIMARY KEY,
  candidate_id TEXT NOT NULL REFERENCES editorial_candidates(id) ON DELETE CASCADE,
  article_id TEXT,
  article_no INTEGER,
  correction_type TEXT NOT NULL,
  public_summary TEXT NOT NULL,
  before_hash TEXT NOT NULL,
  after_hash TEXT,
  status TEXT NOT NULL DEFAULT 'draft',
  approved_by TEXT,
  approved_at TEXT,
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_editorial_corrections_article
  ON editorial_corrections(article_no, created_at DESC);
