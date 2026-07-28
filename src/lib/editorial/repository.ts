import "server-only";

import crypto from "node:crypto";
import { d1HttpFirst, d1HttpQuery } from "@/lib/d1-http-client";
import type { EditorialActor } from "@/lib/editorial/auth";
import { clusterEditorialSources } from "@/lib/editorial/engine";
import type { EditorialPackage, EditorialState } from "@/lib/editorial/schema";
import { applyEditorialSourceRightsSnapshot } from "@/lib/editorial/source-rights";

function parseJson<T>(value: unknown, fallback: T): T {
  if (value == null || value === "") return fallback;
  if (typeof value !== "string") return value as T;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function nowIso() {
  return new Date().toISOString();
}

function repositoryError(message: string, status: number, extras: Record<string, unknown> = {}) {
  return Object.assign(new Error(message), { status, ...extras });
}

export interface EditorialRuntimeState {
  generation: number;
  featureEnabled: boolean;
  shadowEnabled: boolean;
  draftEnabled: boolean;
  autoPublishEnabled: false;
  killSwitchVerifiedAt?: string;
  updatedBy?: string;
  updatedAt?: string;
}

export async function getEditorialRuntimeState(): Promise<EditorialRuntimeState> {
  const row = await d1HttpFirst<Record<string, unknown>>(
    `SELECT generation, feature_enabled, shadow_enabled, draft_enabled,
            auto_publish_enabled, kill_switch_verified_at, updated_by, updated_at
     FROM editorial_runtime_state WHERE singleton = 1`,
  );
  if (!row) throw repositoryError("편집실 runtime state가 없습니다.", 503);
  return {
    generation: Number(row.generation || 0),
    featureEnabled: Number(row.feature_enabled || 0) === 1,
    shadowEnabled: Number(row.shadow_enabled || 0) === 1,
    draftEnabled: Number(row.draft_enabled || 0) === 1,
    autoPublishEnabled: false,
    killSwitchVerifiedAt: row.kill_switch_verified_at ? String(row.kill_switch_verified_at) : undefined,
    updatedBy: row.updated_by ? String(row.updated_by) : undefined,
    updatedAt: row.updated_at ? String(row.updated_at) : undefined,
  };
}

export async function updateEditorialRuntimeState(input: {
  generation: number;
  featureEnabled: boolean;
  shadowEnabled: boolean;
  draftEnabled: boolean;
  verifyKillSwitch?: boolean;
  actor: EditorialActor;
  idempotencyKey: string;
}) {
  const current = await getEditorialRuntimeState();
  if (current.generation !== input.generation) {
    throw repositoryError("runtime generation이 변경되었습니다.", 409, { currentGeneration: current.generation });
  }
  const nextGeneration = current.generation + 1;
  const updatedAt = nowIso();
  await d1HttpQuery(
    `UPDATE editorial_runtime_state
     SET generation = ?, feature_enabled = ?, shadow_enabled = ?, draft_enabled = ?,
         auto_publish_enabled = 0,
         kill_switch_verified_at = CASE WHEN ? = 1 THEN ? ELSE kill_switch_verified_at END,
         updated_by = ?, updated_at = ?
     WHERE singleton = 1 AND generation = ?`,
    [
      nextGeneration,
      input.featureEnabled ? 1 : 0,
      input.shadowEnabled ? 1 : 0,
      input.draftEnabled ? 1 : 0,
      input.verifyKillSwitch ? 1 : 0,
      updatedAt,
      input.actor.name,
      updatedAt,
      current.generation,
    ],
  );
  await insertEditorialAudit({
    event: "runtime_updated",
    actor: input.actor,
    idempotencyKey: input.idempotencyKey,
    metadata: {
      featureEnabled: input.featureEnabled,
      shadowEnabled: input.shadowEnabled,
      draftEnabled: input.draftEnabled,
      autoPublishEnabled: false,
    },
  });
  return getEditorialRuntimeState();
}

export interface EditorialCandidateSummary {
  id: string;
  state: EditorialState;
  articleType: string;
  title: string;
  assignedTo?: string;
  highRisk: string[];
  gateErrors: string[];
  evidenceCoverage: number;
  currentVersion: number;
  generation: number;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

function candidateFromRow(row: Record<string, unknown>): EditorialCandidateSummary {
  return {
    id: String(row.id),
    state: String(row.state) as EditorialState,
    articleType: String(row.article_type || "CP-0"),
    title: String(row.title || ""),
    assignedTo: row.assigned_to ? String(row.assigned_to) : undefined,
    highRisk: parseJson<string[]>(row.high_risk_json, []),
    gateErrors: parseJson<string[]>(row.gate_errors_json, []),
    evidenceCoverage: Number(row.evidence_coverage || 0),
    currentVersion: Number(row.current_version || 1),
    generation: Number(row.generation || 0),
    createdBy: String(row.created_by || ""),
    createdAt: String(row.created_at || ""),
    updatedAt: String(row.updated_at || ""),
  };
}

export async function listEditorialCandidates(options: { state?: string; limit?: number } = {}) {
  const limit = Math.max(1, Math.min(Number(options.limit || 100), 200));
  const params: unknown[] = [];
  const where = options.state ? "WHERE state = ?" : "";
  if (options.state) params.push(options.state);
  params.push(limit);
  const rows = await d1HttpQuery<Record<string, unknown>>(
    `SELECT id, state, article_type, title, assigned_to, high_risk_json,
            gate_errors_json, evidence_coverage, current_version, generation,
            created_by, created_at, updated_at
     FROM editorial_candidates ${where}
     ORDER BY updated_at DESC LIMIT ?`,
    params,
  );
  return rows.rows.map(candidateFromRow);
}

export async function getEditorialCandidate(id: string) {
  const row = await d1HttpFirst<Record<string, unknown>>(
    `SELECT id, state, article_type, title, assigned_to, high_risk_json,
            gate_errors_json, evidence_coverage, current_version, generation,
            created_by, created_at, updated_at
     FROM editorial_candidates WHERE id = ?`,
    [id],
  );
  if (!row) throw repositoryError("편집 후보를 찾지 못했습니다.", 404);
  const [versions, claims, evidence, clusters, reviews, aiRuns, corrections, audits] = await Promise.all([
    d1HttpQuery<Record<string, unknown>>(
      `SELECT candidate_id, version, title, outline_json, draft_text, draft_hash,
              editor_text, editor_hash, evidence_package_hash, change_summary,
              created_by, created_at
       FROM editorial_candidate_versions WHERE candidate_id = ? ORDER BY version DESC`,
      [id],
    ),
    d1HttpQuery<Record<string, unknown>>(
      `SELECT id, candidate_id, candidate_version, claim_kind, importance,
              claim_text, claim_hash, review_status, created_at
       FROM editorial_claims WHERE candidate_id = ? ORDER BY created_at ASC`,
      [id],
    ),
    d1HttpQuery<Record<string, unknown>>(
      `SELECT e.id, e.claim_id, e.source_id, e.snapshot_id, e.relation,
              e.excerpt, e.excerpt_hash, e.evidence_eligible, e.fixture,
              e.reviewer_status, e.created_at, s.source_name, s.source_url,
              s.rights_grade, s.usage_basis, s.allowed_uses_json,
              s.block_reason, s.generation AS source_generation
       FROM editorial_evidence_links e
       JOIN editorial_claims c ON c.id = e.claim_id
       JOIN editorial_sources s ON s.id = e.source_id
       WHERE c.candidate_id = ? ORDER BY e.created_at ASC`,
      [id],
    ),
    d1HttpQuery<Record<string, unknown>>(
      `SELECT c.id, c.fingerprint, c.independent_origin_count, c.fixture,
              c.method_version, c.created_at,
              GROUP_CONCAT(m.source_id) AS source_ids,
              MAX(m.similarity) AS max_similarity
       FROM editorial_origin_clusters c
       LEFT JOIN editorial_origin_cluster_members m ON m.cluster_id = c.id
       WHERE c.candidate_id = ?
       GROUP BY c.id
       ORDER BY c.created_at ASC`,
      [id],
    ),
    d1HttpQuery<Record<string, unknown>>(
      `SELECT id, candidate_id, candidate_version, review_type, decision,
              reviewer_name, reviewer_role, is_fixture, memo, labels_json, created_at
       FROM editorial_reviews WHERE candidate_id = ? ORDER BY created_at DESC`,
      [id],
    ),
    d1HttpQuery<Record<string, unknown>>(
      `SELECT id, candidate_id, candidate_version, provider, model, prompt_version,
              evidence_ids_json, input_hash, output_hash, validation_json, status,
              error_code, created_by, created_at
       FROM editorial_ai_runs WHERE candidate_id = ? ORDER BY created_at DESC`,
      [id],
    ),
    d1HttpQuery<Record<string, unknown>>(
      `SELECT id, article_id, article_no, correction_type, public_summary,
              before_hash, after_hash, status, approved_by, approved_at,
              created_by, created_at
       FROM editorial_corrections WHERE candidate_id = ? ORDER BY created_at DESC`,
      [id],
    ),
    d1HttpQuery<Record<string, unknown>>(
      `SELECT id, event, actor_name, actor_role, before_hash, after_hash,
              metadata_json, created_at
       FROM editorial_audit_logs WHERE candidate_id = ? ORDER BY created_at DESC LIMIT 200`,
      [id],
    ),
  ]);
  return {
    candidate: candidateFromRow(row),
    versions: versions.rows.map((item) => ({
      ...item,
      outline: parseJson(item.outline_json, []),
      outline_json: undefined,
    })),
    claims: claims.rows,
    evidence: evidence.rows.map((item): Record<string, unknown> => ({
      ...item,
      allowedUses: parseJson(item.allowed_uses_json, []),
      allowed_uses_json: undefined,
    })),
    clusters: clusters.rows.map((item) => ({
      ...item,
      sourceIds: String(item.source_ids || "").split(",").filter(Boolean),
      source_ids: undefined,
    })),
    reviews: reviews.rows.map((item) => ({ ...item, labels: parseJson(item.labels_json, []), labels_json: undefined })),
    aiRuns: aiRuns.rows.map((item) => ({
      ...item,
      evidenceIds: parseJson(item.evidence_ids_json, []),
      validation: parseJson(item.validation_json, {}),
      evidence_ids_json: undefined,
      validation_json: undefined,
    })),
    corrections: corrections.rows,
    audits: audits.rows.map((item) => ({ ...item, metadata: parseJson(item.metadata_json, {}), metadata_json: undefined })),
  };
}

export async function insertEditorialAudit(input: {
  candidateId?: string;
  event: string;
  actor: EditorialActor;
  idempotencyKey?: string;
  beforeHash?: string;
  afterHash?: string;
  metadata?: Record<string, unknown>;
}) {
  await d1HttpQuery(
    `INSERT INTO editorial_audit_logs
       (id, candidate_id, event, actor_name, actor_role, request_id,
        idempotency_key, before_hash, after_hash, metadata_json)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      crypto.randomUUID(),
      input.candidateId || null,
      input.event,
      input.actor.name,
      input.actor.role,
      crypto.randomUUID(),
      input.idempotencyKey || null,
      input.beforeHash || null,
      input.afterHash || null,
      JSON.stringify(input.metadata || {}),
    ],
  );
}

export async function createEditorialCandidate(input: {
  id?: string;
  title: string;
  articleType: string;
  state: EditorialState;
  highRisk: string[];
  gateErrors: string[];
  evidenceCoverage: number;
  actor: EditorialActor;
  idempotencyKey: string;
}) {
  const runtime = await getEditorialRuntimeState();
  if (!runtime.featureEnabled || !runtime.shadowEnabled) {
    throw repositoryError("편집실 shadow 기능이 비활성화되어 있습니다.", 423);
  }
  const existingAudit = await d1HttpFirst<{ candidate_id?: string }>(
    "SELECT candidate_id FROM editorial_audit_logs WHERE idempotency_key = ?",
    [input.idempotencyKey],
  );
  if (existingAudit?.candidate_id) return getEditorialCandidate(existingAudit.candidate_id);
  const id = input.id || crypto.randomUUID();
  const createdAt = nowIso();
  await d1HttpQuery(
    `INSERT INTO editorial_candidates
       (id, state, article_type, title, high_risk_json, gate_errors_json,
        evidence_coverage, human_review_required, auto_publish_allowed,
        current_version, generation, created_by, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, 1, 0, 1, 0, ?, ?, ?)`,
    [
      id,
      input.state,
      input.articleType,
      input.title,
      JSON.stringify(input.highRisk),
      JSON.stringify(input.gateErrors),
      input.evidenceCoverage,
      input.actor.name,
      createdAt,
      createdAt,
    ],
  );
  await d1HttpQuery(
    `INSERT INTO editorial_candidate_versions
       (candidate_id, version, title, created_by, created_at)
     VALUES (?, 1, ?, ?, ?)`,
    [id, input.title, input.actor.name, createdAt],
  );
  await insertEditorialAudit({
    candidateId: id,
    event: "candidate_created",
    actor: input.actor,
    idempotencyKey: input.idempotencyKey,
    metadata: { state: input.state, articleType: input.articleType, autoPublishAllowed: false },
  });
  return getEditorialCandidate(id);
}

export async function createEditorialCandidateFromPackage(input: {
  package: EditorialPackage;
  gate: {
    nextState: "review_required" | "sensitive_review" | "needs_evidence" | "needs_counterview" | "blocked_rights";
    errors: string[];
    highRisk: string[];
    evidenceCoverage: number;
  };
  actor: EditorialActor;
  idempotencyKey: string;
}) {
  const created = await createEditorialCandidate({
    id: input.package.candidateId,
    title: input.package.title,
    articleType: input.package.articleType,
    state: input.gate.nextState,
    highRisk: input.gate.highRisk,
    gateErrors: input.gate.errors,
    evidenceCoverage: input.gate.evidenceCoverage,
    actor: input.actor,
    idempotencyKey: input.idempotencyKey,
  });
  if (created.claims.length || created.evidence.length) return created;
  for (const source of input.package.sources) {
    await d1HttpQuery(
      `INSERT INTO editorial_sources
         (id, source_type, source_name, source_url, canonical_url, title,
          published_at, content_hash, fixture, usage_basis, rights_grade,
          allowed_uses_json, evidence_eligible, training_eligible, block_reason,
          provenance_json)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         source_name = excluded.source_name,
         source_url = excluded.source_url,
         title = excluded.title,
         published_at = excluded.published_at,
         content_hash = excluded.content_hash,
         updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')`,
      [
        source.id,
        source.sourceType,
        source.sourceName,
        source.sourceUrl || null,
        source.sourceUrl || null,
        source.title,
        source.publishedAt || null,
        source.contentHash || null,
        source.fixture ? 1 : 0,
        source.usageBasis,
        source.rightsGrade,
        JSON.stringify(source.allowedUses),
        source.evidenceEligible ? 1 : 0,
        source.trainingEligible ? 1 : 0,
        source.fixture ? "synthetic_fixture" : source.evidenceEligible ? null : "rights_unconfirmed",
        JSON.stringify({ importedBy: input.actor.name, bodyStored: false }),
      ],
    );
  }
  for (const claim of input.package.claims) {
    const claimHash = crypto.createHash("sha256").update(claim.text).digest("hex");
    await d1HttpQuery(
      `INSERT INTO editorial_claims
         (id, candidate_id, candidate_version, claim_kind, importance,
          claim_text, claim_hash, review_status)
       VALUES (?, ?, 1, ?, ?, ?, ?, ?)`,
      [
        claim.id,
        input.package.candidateId,
        claim.kind,
        claim.importance,
        claim.text,
        claimHash,
        claim.evidenceIds.length ? "linked" : "unresolved",
      ],
    );
  }
  const claimIds = new Set(input.package.claims.map((claim) => claim.id));
  const sourceIds = new Set(input.package.sources.map((source) => source.id));
  for (const evidence of input.package.evidence) {
    const claim = input.package.claims.find((item) => item.evidenceIds.includes(evidence.id));
    if (!claim || !claimIds.has(claim.id) || !sourceIds.has(evidence.sourceId)) continue;
    await d1HttpQuery(
      `INSERT INTO editorial_evidence_links
         (id, claim_id, source_id, relation, excerpt, excerpt_hash,
          evidence_eligible, fixture, reviewer_status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'unreviewed')`,
      [
        evidence.id,
        claim.id,
        evidence.sourceId,
        evidence.relation,
        evidence.excerpt,
        evidence.excerptHash,
        evidence.evidenceEligible ? 1 : 0,
        evidence.fixture ? 1 : 0,
      ],
    );
  }
  const clusters = clusterEditorialSources(input.package.sources);
  for (const cluster of clusters) {
    const clusterId = `${input.package.candidateId}:${cluster.id}`;
    const fingerprint = crypto.createHash("sha256").update(cluster.sourceIds.slice().sort().join("|")).digest("hex");
    await d1HttpQuery(
      `INSERT INTO editorial_origin_clusters
         (id, candidate_id, fingerprint, independent_origin_count, fixture, method_version)
       VALUES (?, ?, ?, ?, ?, 'editorial-bigram-v1')`,
      [
        clusterId,
        input.package.candidateId,
        fingerprint,
        cluster.independentOriginCount,
        cluster.fixture ? 1 : 0,
      ],
    );
    for (const sourceId of cluster.sourceIds) {
      await d1HttpQuery(
        `INSERT INTO editorial_origin_cluster_members (cluster_id, source_id, similarity)
         VALUES (?, ?, ?)`,
        [clusterId, sourceId, cluster.sourceIds.length > 1 ? 0.9 : 1],
      );
    }
  }
  await insertEditorialAudit({
    candidateId: input.package.candidateId,
    event: "evidence_package_imported",
    actor: input.actor,
    metadata: {
      sources: input.package.sources.length,
      claims: input.package.claims.length,
      evidence: input.package.evidence.length,
      autoPublishAllowed: false,
    },
  });
  return getEditorialCandidate(input.package.candidateId);
}

export async function applyTrustedEditorialSourceRights(pkg: EditorialPackage): Promise<EditorialPackage> {
  const trusted = new Map<string, Record<string, unknown>>();
  const ids = [...new Set(pkg.sources.map((source) => source.id))];
  for (let offset = 0; offset < ids.length; offset += 50) {
    const chunk = ids.slice(offset, offset + 50);
    const placeholders = chunk.map(() => "?").join(",");
    const rows = await d1HttpQuery<Record<string, unknown>>(
      `SELECT id, fixture, usage_basis, rights_grade, allowed_uses_json,
              evidence_eligible, training_eligible
       FROM editorial_sources WHERE id IN (${placeholders})`,
      chunk,
    );
    for (const row of rows.rows) trusted.set(String(row.id), row);
  }

  return applyEditorialSourceRightsSnapshot(pkg, trusted);
}

export async function updateEditorialSourceRights(input: {
  sourceId: string;
  generation: number;
  usageBasis: string;
  rightsGrade: "A" | "B" | "C" | "D" | "X";
  allowedUses: string[];
  evidenceEligible: boolean;
  trainingEligible: boolean;
  blockReason?: string;
  actor: EditorialActor;
  idempotencyKey: string;
}) {
  const duplicate = await d1HttpFirst<Record<string, unknown>>(
    "SELECT metadata_json FROM editorial_audit_logs WHERE idempotency_key = ?",
    [input.idempotencyKey],
  );
  if (duplicate) {
    return d1HttpFirst<Record<string, unknown>>(
      `SELECT id, source_name, source_url, fixture, usage_basis, rights_grade,
              allowed_uses_json, evidence_eligible, training_eligible,
              block_reason, generation, updated_at
       FROM editorial_sources WHERE id = ?`,
      [input.sourceId],
    );
  }
  const current = await d1HttpFirst<Record<string, unknown>>(
    `SELECT id, fixture, usage_basis, rights_grade, allowed_uses_json,
            evidence_eligible, training_eligible, block_reason, generation
     FROM editorial_sources WHERE id = ?`,
    [input.sourceId],
  );
  if (!current) throw repositoryError("출처를 찾지 못했습니다.", 404);
  const currentGeneration = Number(current.generation || 0);
  if (currentGeneration !== input.generation) {
    throw repositoryError("출처 권리정보가 변경되었습니다.", 409, { currentGeneration });
  }
  if (Number(current.fixture || 0) === 1 && (input.evidenceEligible || input.trainingEligible)) {
    throw repositoryError("fixture는 근거나 학습에 사용할 수 없습니다.", 422);
  }
  if (input.evidenceEligible && (input.usageBasis === "unconfirmed" || ["D", "X"].includes(input.rightsGrade))) {
    throw repositoryError("권리 근거와 등급이 확인되지 않은 출처는 근거로 승인할 수 없습니다.", 422);
  }
  const nextGeneration = currentGeneration + 1;
  const updatedAt = nowIso();
  const result = await d1HttpQuery(
    `UPDATE editorial_sources
     SET usage_basis = ?, rights_grade = ?, allowed_uses_json = ?,
         evidence_eligible = ?, training_eligible = ?, block_reason = ?,
         generation = ?, updated_at = ?
     WHERE id = ? AND generation = ?`,
    [
      input.usageBasis,
      input.rightsGrade,
      JSON.stringify(input.allowedUses),
      input.evidenceEligible ? 1 : 0,
      input.trainingEligible ? 1 : 0,
      input.blockReason || null,
      nextGeneration,
      updatedAt,
      input.sourceId,
      currentGeneration,
    ],
  );
  if (!result.success) throw repositoryError("출처 권리정보를 갱신하지 못했습니다.", 409);
  await insertEditorialAudit({
    event: "source_rights_updated",
    actor: input.actor,
    idempotencyKey: input.idempotencyKey,
    beforeHash: crypto.createHash("sha256").update(JSON.stringify(current)).digest("hex"),
    afterHash: crypto.createHash("sha256").update(JSON.stringify({
      usageBasis: input.usageBasis,
      rightsGrade: input.rightsGrade,
      allowedUses: input.allowedUses,
      evidenceEligible: input.evidenceEligible,
      trainingEligible: input.trainingEligible,
      blockReason: input.blockReason || null,
      generation: nextGeneration,
    })).digest("hex"),
    metadata: {
      sourceId: input.sourceId,
      rightsGrade: input.rightsGrade,
      evidenceEligible: input.evidenceEligible,
      trainingEligible: input.trainingEligible,
    },
  });
  return d1HttpFirst<Record<string, unknown>>(
    `SELECT id, source_name, source_url, fixture, usage_basis, rights_grade,
            allowed_uses_json, evidence_eligible, training_eligible,
            block_reason, generation, updated_at
     FROM editorial_sources WHERE id = ?`,
    [input.sourceId],
  );
}

export async function updateEditorialCandidate(input: {
  id: string;
  generation: number;
  state: EditorialState;
  title?: string;
  assignedTo?: string;
  actor: EditorialActor;
  idempotencyKey: string;
}) {
  const current = await getEditorialCandidate(input.id);
  if (current.candidate.generation !== input.generation) {
    throw repositoryError("후보 generation이 변경되었습니다.", 409, { currentGeneration: current.candidate.generation });
  }
  if (input.state === "published") throw repositoryError("편집실 API는 기사를 자동 게시할 수 없습니다.", 422);
  const highRisk = current.candidate.highRisk.length > 0;
  if (highRisk && input.state === "approved" && !["sensitive_editor", "admin", "superadmin"].includes(input.actor.role)) {
    throw repositoryError("민감 후보 승인 권한이 없습니다.", 403);
  }
  const nextGeneration = current.candidate.generation + 1;
  await d1HttpQuery(
    `UPDATE editorial_candidates
     SET state = ?, title = COALESCE(?, title), assigned_to = COALESCE(?, assigned_to),
         generation = ?, updated_at = ?
     WHERE id = ? AND generation = ?`,
    [
      input.state,
      input.title || null,
      input.assignedTo || null,
      nextGeneration,
      nowIso(),
      input.id,
      input.generation,
    ],
  );
  await insertEditorialAudit({
    candidateId: input.id,
    event: "candidate_updated",
    actor: input.actor,
    idempotencyKey: input.idempotencyKey,
    metadata: { from: current.candidate.state, to: input.state },
  });
  return getEditorialCandidate(input.id);
}

export async function saveEditorialReview(input: {
  candidateId: string;
  version: number;
  reviewType: string;
  decision: string;
  memo: string;
  labels: string[];
  isFixture: boolean;
  actor: EditorialActor;
  idempotencyKey: string;
}) {
  const candidate = await getEditorialCandidate(input.candidateId);
  if (candidate.candidate.currentVersion !== input.version) {
    throw repositoryError("최신 candidate version만 검토할 수 있습니다.", 409);
  }
  await d1HttpQuery(
    `INSERT INTO editorial_reviews
       (id, candidate_id, candidate_version, review_type, decision,
        reviewer_name, reviewer_role, is_fixture, memo, labels_json)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      crypto.randomUUID(),
      input.candidateId,
      input.version,
      input.reviewType,
      input.decision,
      input.actor.name,
      input.actor.role,
      input.isFixture ? 1 : 0,
      input.memo,
      JSON.stringify(input.labels),
    ],
  );
  await insertEditorialAudit({
    candidateId: input.candidateId,
    event: "review_saved",
    actor: input.actor,
    idempotencyKey: input.idempotencyKey,
    metadata: { reviewType: input.reviewType, decision: input.decision, isFixture: input.isFixture },
  });
  return getEditorialCandidate(input.candidateId);
}

export async function saveEditorialDraftRun(input: {
  candidateId: string;
  version: number;
  provider: string;
  model: string;
  promptVersion: string;
  evidenceIds: string[];
  inputHash: string;
  outputHash?: string;
  validation: Record<string, unknown>;
  status: string;
  draft?: { title: string; outline: string[]; draft: string };
  actor: EditorialActor;
  idempotencyKey: string;
}) {
  const runtime = await getEditorialRuntimeState();
  if (!runtime.featureEnabled || !runtime.draftEnabled) {
    throw repositoryError("AI 초안 기능이 비활성화되어 있습니다.", 423);
  }
  await d1HttpQuery(
    `INSERT INTO editorial_ai_runs
       (id, candidate_id, candidate_version, provider, model, prompt_version,
        evidence_ids_json, input_hash, output_hash, validation_json, status, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      crypto.randomUUID(),
      input.candidateId,
      input.version,
      input.provider,
      input.model,
      input.promptVersion,
      JSON.stringify(input.evidenceIds),
      input.inputHash,
      input.outputHash || null,
      JSON.stringify(input.validation),
      input.status,
      input.actor.name,
    ],
  );
  if (input.draft && input.status === "validated") {
    const draftHash = crypto.createHash("sha256").update(input.draft.draft).digest("hex");
    await d1HttpQuery(
      `UPDATE editorial_candidate_versions
       SET title = ?, outline_json = ?, draft_text = ?, draft_hash = ?,
           change_summary = ?, created_by = ?
       WHERE candidate_id = ? AND version = ?`,
      [
        input.draft.title,
        JSON.stringify(input.draft.outline),
        input.draft.draft,
        draftHash,
        "근거 잠금 AI 초안 생성",
        input.actor.name,
        input.candidateId,
        input.version,
      ],
    );
    await d1HttpQuery(
      `UPDATE editorial_candidates
       SET state = 'review_required', title = ?, generation = generation + 1, updated_at = ?
       WHERE id = ?`,
      [input.draft.title, nowIso(), input.candidateId],
    );
  }
  await insertEditorialAudit({
    candidateId: input.candidateId,
    event: "draft_validation_saved",
    actor: input.actor,
    idempotencyKey: input.idempotencyKey,
    metadata: { status: input.status, model: input.model, autoPublishAllowed: false },
  });
  return getEditorialCandidate(input.candidateId);
}

export async function createEditorialCorrection(input: {
  candidateId: string;
  articleId?: string;
  articleNo?: number;
  correctionType: "correction" | "retraction";
  publicSummary: string;
  beforeHash: string;
  afterHash?: string;
  actor: EditorialActor;
  idempotencyKey: string;
}) {
  const relation = await d1HttpFirst<Record<string, unknown>>(
    `SELECT c.state, c.parent_article_id, c.parent_article_no,
            v.draft_hash, v.editor_hash
     FROM editorial_candidates c
     JOIN editorial_candidate_versions v
       ON v.candidate_id = c.id AND v.version = c.current_version
     WHERE c.id = ?`,
    [input.candidateId],
  );
  if (!relation) throw repositoryError("편집 후보를 찾지 못했습니다.", 404);
  if (!["published", "corrected", "retracted"].includes(String(relation.state))) {
    throw repositoryError("게시 기사와 연결된 후보만 정정 또는 철회할 수 있습니다.", 422);
  }
  const linkedNo = Number(relation.parent_article_no || 0);
  if (!linkedNo || input.articleNo !== linkedNo) {
    throw repositoryError("후보에 연결된 기사 번호가 일치하지 않습니다.", 422);
  }
  if (relation.parent_article_id && input.articleId && String(relation.parent_article_id) !== input.articleId) {
    throw repositoryError("후보에 연결된 기사 ID가 일치하지 않습니다.", 422);
  }
  const currentHash = String(relation.editor_hash || relation.draft_hash || "");
  if (!currentHash || currentHash !== input.beforeHash) {
    throw repositoryError("최신 편집본 hash와 정정 기준 hash가 일치하지 않습니다.", 409);
  }
  const id = crypto.randomUUID();
  await d1HttpQuery(
    `INSERT INTO editorial_corrections
       (id, candidate_id, article_id, article_no, correction_type, public_summary,
        before_hash, after_hash, status, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'draft', ?)`,
    [
      id,
      input.candidateId,
      input.articleId || null,
      input.articleNo || null,
      input.correctionType,
      input.publicSummary,
      input.beforeHash,
      input.afterHash || null,
      input.actor.name,
    ],
  );
  await insertEditorialAudit({
    candidateId: input.candidateId,
    event: "correction_draft_created",
    actor: input.actor,
    idempotencyKey: input.idempotencyKey,
    metadata: { correctionId: id, correctionType: input.correctionType },
  });
  return getEditorialCandidate(input.candidateId);
}

export async function decideEditorialCorrection(input: {
  candidateId: string;
  correctionId: string;
  status: "approved" | "rejected";
  actor: EditorialActor;
  idempotencyKey: string;
}) {
  const duplicate = await d1HttpFirst<{ candidate_id?: string }>(
    "SELECT candidate_id FROM editorial_audit_logs WHERE idempotency_key = ?",
    [input.idempotencyKey],
  );
  if (duplicate?.candidate_id) return getEditorialCandidate(input.candidateId);
  const correction = await d1HttpFirst<Record<string, unknown>>(
    `SELECT id, correction_type, status FROM editorial_corrections
     WHERE id = ? AND candidate_id = ?`,
    [input.correctionId, input.candidateId],
  );
  if (!correction) throw repositoryError("정정 또는 철회 초안을 찾지 못했습니다.", 404);
  if (correction.status !== "draft") throw repositoryError("이미 결정된 정정 또는 철회입니다.", 409);
  const approved = input.status === "approved";
  await d1HttpQuery(
    `UPDATE editorial_corrections
     SET status = ?, approved_by = ?, approved_at = ?
     WHERE id = ? AND candidate_id = ? AND status = 'draft'`,
    [
      input.status,
      approved ? input.actor.name : null,
      approved ? nowIso() : null,
      input.correctionId,
      input.candidateId,
    ],
  );
  if (approved) {
    await d1HttpQuery(
      `UPDATE editorial_candidates
       SET state = ?, generation = generation + 1, updated_at = ?
       WHERE id = ?`,
      [correction.correction_type === "retraction" ? "retracted" : "corrected", nowIso(), input.candidateId],
    );
  }
  await insertEditorialAudit({
    candidateId: input.candidateId,
    event: `correction_${input.status}`,
    actor: input.actor,
    idempotencyKey: input.idempotencyKey,
    metadata: {
      correctionId: input.correctionId,
      correctionType: correction.correction_type,
      articleBodyChanged: false,
      autoPublishAllowed: false,
    },
  });
  return getEditorialCandidate(input.candidateId);
}

export async function getApprovedEditorialNoticesForArticleNos(articleNos: number[]) {
  const unique = [...new Set(articleNos.filter((value) => Number.isInteger(value) && value > 0))].slice(0, 100);
  if (!unique.length) return new Map<number, Array<{
    id: string;
    type: "correction" | "retraction";
    summary: string;
    approvedAt: string;
  }>>();
  const placeholders = unique.map(() => "?").join(",");
  const rows = await d1HttpQuery<Record<string, unknown>>(
    `SELECT id, article_no, correction_type, public_summary, approved_at
     FROM editorial_corrections
     WHERE status = 'approved' AND article_no IN (${placeholders})
     ORDER BY approved_at ASC`,
    unique,
  );
  const result = new Map<number, Array<{
    id: string;
    type: "correction" | "retraction";
    summary: string;
    approvedAt: string;
  }>>();
  for (const row of rows.rows) {
    const articleNo = Number(row.article_no);
    const list = result.get(articleNo) || [];
    list.push({
      id: String(row.id),
      type: row.correction_type === "retraction" ? "retraction" : "correction",
      summary: String(row.public_summary || ""),
      approvedAt: String(row.approved_at || ""),
    });
    result.set(articleNo, list);
  }
  return result;
}

export async function getApprovedEditorialNoticesByArticleNo(articleNo: number) {
  return (await getApprovedEditorialNoticesForArticleNos([articleNo])).get(articleNo) || [];
}

export async function getEditorialAutomationMetrics() {
  const runtime = await getEditorialRuntimeState();
  const [candidateStats, reviewerStats, unsupportedStats, decisionStats] = await Promise.all([
    d1HttpFirst<Record<string, unknown>>(
      `SELECT COUNT(*) AS pilot_count, MIN(created_at) AS first_created_at
       FROM editorial_candidates`,
    ),
    d1HttpFirst<Record<string, unknown>>(
      `SELECT COUNT(DISTINCT reviewer_name) AS reviewer_count
       FROM editorial_reviews WHERE is_fixture = 0`,
    ),
    d1HttpFirst<Record<string, unknown>>(
      `SELECT COUNT(*) AS unsupported_core_claims
       FROM editorial_claims c
       WHERE c.importance = 'core'
         AND NOT EXISTS (
           SELECT 1 FROM editorial_evidence_links e
           WHERE e.claim_id = c.id
             AND e.relation = 'supporting'
             AND e.evidence_eligible = 1
             AND e.fixture = 0
         )`,
    ),
    d1HttpFirst<Record<string, unknown>>(
      `SELECT COUNT(*) AS approved
       FROM editorial_audit_logs
       WHERE event = 'representative_decision_approved'`,
    ),
  ]);
  const firstCreatedAt = candidateStats?.first_created_at ? new Date(String(candidateStats.first_created_at)).getTime() : NaN;
  const shadowDays = Number.isFinite(firstCreatedAt)
    ? Math.max(0, Math.floor((Date.now() - firstCreatedAt) / 86_400_000))
    : 0;
  return {
    shadowDays,
    pilotCount: Number(candidateStats?.pilot_count || 0),
    reviewerCount: Number(reviewerStats?.reviewer_count || 0),
    holdoutEvaluated: false,
    unsupportedCoreClaims: Number(unsupportedStats?.unsupported_core_claims || 0),
    highRiskAutoPublished: 0,
    killSwitchVerified: Boolean(runtime.killSwitchVerifiedAt),
    decisionRecordApproved: Number(decisionStats?.approved || 0) > 0,
  };
}
