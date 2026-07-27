-- Auto-press blocked-subject policy management.
-- Additive only: existing auto-press tables and static policy remain untouched.

CREATE TABLE IF NOT EXISTS auto_press_policy_state (
  id TEXT PRIMARY KEY,
  published_version INTEGER,
  previous_version INTEGER,
  generation INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL,
  updated_by TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS auto_press_policy_versions (
  version INTEGER PRIMARY KEY,
  state TEXT NOT NULL CHECK (state IN ('draft', 'validated', 'published', 'rolled_back', 'superseded')),
  base_version INTEGER,
  generation INTEGER NOT NULL DEFAULT 0,
  snapshot_json TEXT,
  checksum TEXT,
  subject_count INTEGER NOT NULL DEFAULT 0,
  rule_count INTEGER NOT NULL DEFAULT 0,
  validation_json TEXT,
  change_summary TEXT,
  created_by TEXT NOT NULL,
  validated_by TEXT,
  published_by TEXT,
  created_at TEXT NOT NULL,
  validated_at TEXT,
  published_at TEXT
);

CREATE TABLE IF NOT EXISTS auto_press_blocked_subjects (
  version INTEGER NOT NULL,
  subject_id TEXT NOT NULL,
  label TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  reason TEXT,
  notes TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_by TEXT NOT NULL,
  updated_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (version, subject_id)
);

CREATE TABLE IF NOT EXISTS auto_press_blocked_subject_rules (
  id TEXT PRIMARY KEY,
  version INTEGER NOT NULL,
  subject_id TEXT NOT NULL,
  rule_type TEXT NOT NULL CHECK (rule_type IN ('term', 'domain', 'term_group')),
  value_json TEXT NOT NULL,
  normalized_value TEXT NOT NULL,
  risk_level TEXT NOT NULL DEFAULT 'normal' CHECK (risk_level IN ('normal', 'warning', 'blocked')),
  enabled INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0, 1)),
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (version, subject_id, rule_type, normalized_value)
);

CREATE TABLE IF NOT EXISTS auto_press_policy_audit_logs (
  id TEXT PRIMARY KEY,
  event TEXT NOT NULL,
  policy_version INTEGER,
  subject_id TEXT,
  actor_name TEXT NOT NULL,
  actor_role TEXT NOT NULL,
  request_id TEXT,
  idempotency_key TEXT,
  before_checksum TEXT,
  after_checksum TEXT,
  summary_json TEXT,
  ip_hash TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS auto_press_policy_runtime_observations (
  consumer TEXT PRIMARY KEY,
  policy_version INTEGER NOT NULL,
  checksum TEXT NOT NULL,
  source TEXT NOT NULL CHECK (source IN ('d1', 'last-known-good', 'static-fallback')),
  invocation_id TEXT,
  applied_at TEXT NOT NULL,
  observed_at TEXT NOT NULL,
  error_code TEXT
);

CREATE TABLE IF NOT EXISTS auto_press_policy_reports (
  id TEXT PRIMARY KEY,
  policy_version INTEGER NOT NULL,
  checksum TEXT NOT NULL,
  state TEXT NOT NULL CHECK (state IN ('running', 'complete', 'failed', 'expired')),
  scope_json TEXT NOT NULL,
  summary_json TEXT,
  result_count INTEGER NOT NULL DEFAULT 0,
  artifact_key TEXT,
  artifact_checksum TEXT,
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  completed_at TEXT
);

CREATE TABLE IF NOT EXISTS auto_press_policy_report_results (
  report_id TEXT NOT NULL,
  ordinal INTEGER NOT NULL,
  store TEXT NOT NULL,
  record_id TEXT NOT NULL,
  article_no INTEGER,
  title TEXT,
  classification TEXT NOT NULL,
  subject_id TEXT,
  match_type TEXT,
  matched_field TEXT,
  snippet TEXT,
  created_at TEXT NOT NULL,
  PRIMARY KEY (report_id, ordinal)
);

CREATE INDEX IF NOT EXISTS idx_auto_press_policy_versions_state_created
  ON auto_press_policy_versions(state, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_auto_press_policy_subjects_version_order
  ON auto_press_blocked_subjects(version, sort_order, subject_id);
CREATE INDEX IF NOT EXISTS idx_auto_press_policy_rules_version_subject
  ON auto_press_blocked_subject_rules(version, subject_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_auto_press_policy_audit_created
  ON auto_press_policy_audit_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_auto_press_policy_audit_version
  ON auto_press_policy_audit_logs(policy_version, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_auto_press_policy_audit_idempotency
  ON auto_press_policy_audit_logs(idempotency_key)
  WHERE idempotency_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_auto_press_policy_reports_created
  ON auto_press_policy_reports(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_auto_press_policy_report_results_classification
  ON auto_press_policy_report_results(report_id, classification, ordinal);
