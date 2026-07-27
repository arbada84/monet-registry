import "server-only";

import { d1HttpFirst, d1HttpQuery } from "@/lib/d1-http-client";
import {
  POLICY_STATE_ID,
  STATIC_POLICY_VERSION,
  buildPolicySnapshot,
  normalizePolicyValue,
  validatePolicySubjects,
  verifyPolicySnapshot,
  type AutoPressPolicySnapshot,
  type AutoPressPolicySubject,
  type AutoPressPolicyValidation,
} from "@/lib/auto-press-policy-schema";
import type { PolicyActor } from "@/lib/auto-press-policy-auth";

interface PolicyStateRow {
  id: string;
  published_version: number | null;
  previous_version: number | null;
  generation: number;
  updated_at: string;
  updated_by: string;
}

interface PolicyVersionRow {
  version: number;
  state: "draft" | "validated" | "published" | "rolled_back" | "superseded";
  base_version: number | null;
  generation: number;
  snapshot_json: string | null;
  checksum: string | null;
  subject_count: number;
  rule_count: number;
  validation_json: string | null;
  change_summary: string | null;
  created_by: string;
  validated_by: string | null;
  published_by: string | null;
  created_at: string;
  validated_at: string | null;
  published_at: string | null;
}

interface SubjectRow {
  version: number;
  subject_id: string;
  label: string;
  status: "active" | "inactive";
  reason: string | null;
  notes: string | null;
  sort_order: number;
}

interface RuleRow {
  id: string;
  version: number;
  subject_id: string;
  rule_type: "term" | "domain" | "term_group";
  value_json: string;
  enabled: number;
  sort_order: number;
}

export interface PolicyVersionSummary {
  version: number;
  state: PolicyVersionRow["state"];
  baseVersion: number | null;
  generation: number;
  checksum: string | null;
  subjectCount: number;
  ruleCount: number;
  changeSummary: string | null;
  createdBy: string;
  createdAt: string;
  validatedAt: string | null;
  publishedAt: string | null;
}

export interface PolicyBundle {
  version: PolicyVersionSummary;
  subjects: AutoPressPolicySubject[];
  validation: AutoPressPolicyValidation | null;
}

export interface RuntimeObservation {
  consumer: string;
  policyVersion: number;
  checksum: string;
  source: "d1" | "last-known-good" | "static-fallback";
  invocationId: string | null;
  appliedAt: string;
  observedAt: string;
  errorCode: string | null;
}

function nowIso(): string {
  return new Date().toISOString();
}

function randomId(prefix: string): string {
  return `${prefix}-${crypto.randomUUID()}`;
}

function parseJson<T>(value: string | null | undefined, fallback: T): T {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function versionSummary(row: PolicyVersionRow): PolicyVersionSummary {
  return {
    version: Number(row.version),
    state: row.state,
    baseVersion: row.base_version == null ? null : Number(row.base_version),
    generation: Number(row.generation || 0),
    checksum: row.checksum,
    subjectCount: Number(row.subject_count || 0),
    ruleCount: Number(row.rule_count || 0),
    changeSummary: row.change_summary,
    createdBy: row.created_by,
    createdAt: row.created_at,
    validatedAt: row.validated_at,
    publishedAt: row.published_at,
  };
}

export async function getPolicyState() {
  const row = await d1HttpFirst<PolicyStateRow>(
    "SELECT * FROM auto_press_policy_state WHERE id = ? LIMIT 1",
    [POLICY_STATE_ID],
  );
  return row ? {
    publishedVersion: row.published_version == null ? null : Number(row.published_version),
    previousVersion: row.previous_version == null ? null : Number(row.previous_version),
    generation: Number(row.generation || 0),
    updatedAt: row.updated_at,
    updatedBy: row.updated_by,
  } : null;
}

export async function listPolicyVersions(limit = 30): Promise<PolicyVersionSummary[]> {
  const result = await d1HttpQuery<PolicyVersionRow>(
    `SELECT * FROM auto_press_policy_versions
      ORDER BY version DESC LIMIT ?`,
    [Math.min(Math.max(limit, 1), 100)],
  );
  return result.rows.map(versionSummary);
}

export async function getPolicyVersion(version: number): Promise<PolicyVersionSummary | null> {
  const row = await d1HttpFirst<PolicyVersionRow>(
    "SELECT * FROM auto_press_policy_versions WHERE version = ? LIMIT 1",
    [version],
  );
  return row ? versionSummary(row) : null;
}

export async function loadPolicySubjects(version: number): Promise<AutoPressPolicySubject[]> {
  const [subjectsResult, rulesResult] = await Promise.all([
    d1HttpQuery<SubjectRow>(
      `SELECT * FROM auto_press_blocked_subjects
        WHERE version = ? ORDER BY sort_order ASC, subject_id ASC`,
      [version],
    ),
    d1HttpQuery<RuleRow>(
      `SELECT * FROM auto_press_blocked_subject_rules
        WHERE version = ? AND enabled = 1 ORDER BY subject_id ASC, sort_order ASC, id ASC`,
      [version],
    ),
  ]);
  const bySubject = new Map<string, { terms: string[]; termGroups: string[][]; domains: string[] }>();
  for (const rule of rulesResult.rows) {
    const target = bySubject.get(rule.subject_id) || { terms: [], termGroups: [], domains: [] };
    const value = parseJson<unknown>(rule.value_json, "");
    if (rule.rule_type === "term" && typeof value === "string") target.terms.push(value);
    if (rule.rule_type === "domain" && typeof value === "string") target.domains.push(value);
    if (rule.rule_type === "term_group" && Array.isArray(value)) target.termGroups.push(value.map(String));
    bySubject.set(rule.subject_id, target);
  }
  return subjectsResult.rows.map((row) => {
    const rules = bySubject.get(row.subject_id) || { terms: [], termGroups: [], domains: [] };
    return {
      id: row.subject_id,
      label: row.label,
      status: row.status,
      reason: row.reason || "",
      notes: row.notes || "",
      ...rules,
    };
  });
}

export async function getPolicyBundle(version?: number): Promise<PolicyBundle | null> {
  const state = await getPolicyState();
  const selected = version || state?.publishedVersion || undefined;
  if (!selected) return null;
  const row = await d1HttpFirst<PolicyVersionRow>(
    "SELECT * FROM auto_press_policy_versions WHERE version = ? LIMIT 1",
    [selected],
  );
  if (!row) return null;
  return {
    version: versionSummary(row),
    subjects: await loadPolicySubjects(selected),
    validation: parseJson<AutoPressPolicyValidation | null>(row.validation_json, null),
  };
}

export async function getPublishedPolicySnapshot(): Promise<AutoPressPolicySnapshot | null> {
  const row = await d1HttpFirst<{ snapshot_json: string | null }>(
    `SELECT v.snapshot_json
       FROM auto_press_policy_state s
       JOIN auto_press_policy_versions v ON v.version = s.published_version
      WHERE s.id = ?
      LIMIT 1`,
    [POLICY_STATE_ID],
  );
  if (!row?.snapshot_json) return null;
  return verifyPolicySnapshot(JSON.parse(row.snapshot_json));
}

export async function createPolicyDraft(actor: PolicyActor, baseVersion?: number, idempotencyKey?: string): Promise<PolicyBundle> {
  if (idempotencyKey) {
    const replay = await findAuditByIdempotency(idempotencyKey);
    if (replay?.policy_version) {
      const existing = await getPolicyBundle(Number(replay.policy_version));
      if (existing) return existing;
    }
  }
  const state = await getPolicyState();
  const sourceVersion = baseVersion || state?.publishedVersion || STATIC_POLICY_VERSION;
  const sourceSubjects = await loadPolicySubjects(sourceVersion);
  if (!sourceSubjects.length) throw new Error(`Base policy version ${sourceVersion} has no subjects.`);
  const max = await d1HttpFirst<{ max_version: number | null }>(
    "SELECT MAX(version) AS max_version FROM auto_press_policy_versions",
  );
  const version = Math.max(Number(max?.max_version || 0) + 1, STATIC_POLICY_VERSION + 1);
  const now = nowIso();
  await d1HttpQuery(
    `INSERT INTO auto_press_policy_versions
      (version, state, base_version, generation, subject_count, rule_count, created_by, created_at)
     VALUES (?, 'draft', ?, 0, 0, 0, ?, ?)`,
    [version, sourceVersion, actor.name, now],
  );
  await d1HttpQuery(
    `INSERT INTO auto_press_blocked_subjects
      (version, subject_id, label, status, reason, notes, sort_order, created_by, updated_by, created_at, updated_at)
     SELECT ?, subject_id, label, status, reason, notes, sort_order, ?, ?, ?, ?
       FROM auto_press_blocked_subjects
      WHERE version = ?`,
    [version, actor.name, actor.name, now, now, sourceVersion],
  );
  await d1HttpQuery(
    `INSERT INTO auto_press_blocked_subject_rules
      (id, version, subject_id, rule_type, value_json, normalized_value, risk_level, enabled, sort_order, created_at, updated_at)
     SELECT lower(hex(randomblob(16))), ?, subject_id, rule_type, value_json, normalized_value,
            risk_level, enabled, sort_order, ?, ?
       FROM auto_press_blocked_subject_rules
      WHERE version = ?`,
    [version, now, now, sourceVersion],
  );
  await updateDraftCounts(version);
  await writePolicyAudit({
    event: "draft_create",
    version,
    actor,
    idempotencyKey,
    summary: { baseVersion: sourceVersion, subjectCount: sourceSubjects.length },
  });
  const bundle = await getPolicyBundle(version);
  if (!bundle) throw new Error("Created draft could not be loaded.");
  return bundle;
}

async function replaceSubjectRules(version: number, subject: AutoPressPolicySubject, now: string) {
  await d1HttpQuery(
    "DELETE FROM auto_press_blocked_subject_rules WHERE version = ? AND subject_id = ?",
    [version, subject.id],
  );
  let order = 0;
  const rules: Array<{ type: "term" | "domain" | "term_group"; value: string | string[] }> = [
    ...subject.terms.map((value) => ({ type: "term" as const, value })),
    ...subject.termGroups.map((value) => ({ type: "term_group" as const, value })),
    ...subject.domains.map((value) => ({ type: "domain" as const, value })),
  ];
  for (const rule of rules) {
    const normalized = Array.isArray(rule.value)
      ? rule.value.map(normalizePolicyValue).sort().join("+")
      : normalizePolicyValue(rule.value);
    await d1HttpQuery(
      `INSERT INTO auto_press_blocked_subject_rules
        (id, version, subject_id, rule_type, value_json, normalized_value, risk_level, enabled, sort_order, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, 'normal', 1, ?, ?, ?)`,
      [randomId("rule"), version, subject.id, rule.type, JSON.stringify(rule.value), normalized, order++, now, now],
    );
  }
}

async function replaceDraftSubject(
  version: number,
  subject: AutoPressPolicySubject,
  actor: PolicyActor,
  now: string,
) {
  const current = await d1HttpFirst<{ sort_order: number }>(
    "SELECT sort_order FROM auto_press_blocked_subjects WHERE version=? AND subject_id=? LIMIT 1",
    [version, subject.id],
  );
  const nextOrder = current?.sort_order ?? Number((await d1HttpFirst<{ next_order: number }>(
    "SELECT COALESCE(MAX(sort_order), -1) + 1 AS next_order FROM auto_press_blocked_subjects WHERE version=?",
    [version],
  ))?.next_order || 0);
  await d1HttpQuery(
    `INSERT INTO auto_press_blocked_subjects
      (version, subject_id, label, status, reason, notes, sort_order, created_by, updated_by, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(version, subject_id) DO UPDATE SET
       label=excluded.label, status=excluded.status, reason=excluded.reason, notes=excluded.notes,
       updated_by=excluded.updated_by, updated_at=excluded.updated_at`,
    [
      version, subject.id, subject.label, subject.status, subject.reason, subject.notes,
      nextOrder, actor.name, actor.name, now, now,
    ],
  );
  await replaceSubjectRules(version, subject, now);
}

async function advanceDraftGeneration(version: number, expectedGeneration: number): Promise<void> {
  await d1HttpQuery(
    `UPDATE auto_press_policy_versions
        SET generation = generation + 1, state = 'draft', validation_json = NULL,
            snapshot_json = NULL, checksum = NULL, validated_at = NULL, validated_by = NULL
      WHERE version = ? AND generation = ? AND state IN ('draft', 'validated')`,
    [version, expectedGeneration],
  );
  const updated = await getPolicyVersion(version);
  if (!updated || updated.generation !== expectedGeneration + 1) {
    throw Object.assign(new Error("Policy draft generation conflict."), {
      status: 409,
      currentGeneration: updated?.generation,
    });
  }
}

async function updateDraftCounts(version: number) {
  await d1HttpQuery(
    `UPDATE auto_press_policy_versions
        SET subject_count = (SELECT COUNT(*) FROM auto_press_blocked_subjects WHERE version = ?),
            rule_count = (SELECT COUNT(*) FROM auto_press_blocked_subject_rules WHERE version = ? AND enabled = 1)
      WHERE version = ?`,
    [version, version, version],
  );
}

async function assertDraftGeneration(version: number, expectedGeneration: number): Promise<PolicyVersionRow> {
  const row = await d1HttpFirst<PolicyVersionRow>(
    "SELECT * FROM auto_press_policy_versions WHERE version = ? LIMIT 1",
    [version],
  );
  if (!row) throw Object.assign(new Error("Policy version not found."), { status: 404 });
  if (!["draft", "validated"].includes(row.state)) throw Object.assign(new Error("Published policy versions are immutable."), { status: 409 });
  if (Number(row.generation) !== expectedGeneration) {
    throw Object.assign(new Error("Policy draft generation conflict."), {
      status: 409,
      currentGeneration: Number(row.generation),
    });
  }
  return row;
}

export async function replaceDraftSubjects(
  version: number,
  input: unknown,
  actor: PolicyActor,
  expectedGeneration: number,
  incrementGeneration = true,
): Promise<PolicyBundle> {
  await assertDraftGeneration(version, expectedGeneration);
  const { subjects, validation } = validatePolicySubjects(input);
  if (!subjects.length && !validation.valid) throw Object.assign(new Error(validation.errors.join(" ")), { status: 422 });
  const now = nowIso();
  if (incrementGeneration) {
    await advanceDraftGeneration(version, expectedGeneration);
  }
  await d1HttpQuery("DELETE FROM auto_press_blocked_subject_rules WHERE version = ?", [version]);
  await d1HttpQuery("DELETE FROM auto_press_blocked_subjects WHERE version = ?", [version]);
  let order = 0;
  for (const subject of subjects) {
    await d1HttpQuery(
      `INSERT INTO auto_press_blocked_subjects
        (version, subject_id, label, status, reason, notes, sort_order, created_by, updated_by, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [version, subject.id, subject.label, subject.status, subject.reason, subject.notes, order++, actor.name, actor.name, now, now],
    );
    await replaceSubjectRules(version, subject, now);
  }
  await updateDraftCounts(version);
  const bundle = await getPolicyBundle(version);
  if (!bundle) throw new Error("Updated policy draft could not be loaded.");
  return bundle;
}

export async function upsertDraftSubject(
  version: number,
  subjectInput: unknown,
  actor: PolicyActor,
  expectedGeneration: number,
  idempotencyKey?: string,
): Promise<PolicyBundle> {
  if (idempotencyKey) {
    const replay = await findAuditByIdempotency(idempotencyKey);
    if (replay?.policy_version) {
      const existing = await getPolicyBundle(Number(replay.policy_version));
      if (existing) return existing;
    }
  }
  await assertDraftGeneration(version, expectedGeneration);
  const bundle = await getPolicyBundle(version);
  if (!bundle) throw Object.assign(new Error("Policy version not found."), { status: 404 });
  const parsed = validatePolicySubjects([
    ...bundle.subjects.filter((subject) => subject.id !== (subjectInput as { id?: string })?.id),
    subjectInput,
  ]);
  if (!parsed.validation.valid) throw Object.assign(new Error(parsed.validation.errors.join(" ")), { status: 422, validation: parsed.validation });
  const subject = parsed.subjects.find((item) => item.id === (subjectInput as { id?: string })?.id);
  if (!subject) throw Object.assign(new Error("Policy subject is invalid."), { status: 422 });
  await advanceDraftGeneration(version, expectedGeneration);
  await replaceDraftSubject(version, subject, actor, nowIso());
  await updateDraftCounts(version);
  const updated = await getPolicyBundle(version);
  if (!updated) throw new Error("Updated policy draft could not be loaded.");
  await writePolicyAudit({
    event: "subject_save",
    version,
    subjectId: (subjectInput as { id?: string })?.id,
    actor,
    idempotencyKey,
    summary: { generation: updated.version.generation },
  });
  return updated;
}

export async function deleteDraftSubject(
  version: number,
  subjectId: string,
  actor: PolicyActor,
  expectedGeneration: number,
  idempotencyKey?: string,
): Promise<PolicyBundle> {
  if (idempotencyKey) {
    const replay = await findAuditByIdempotency(idempotencyKey);
    if (replay?.policy_version) {
      const existing = await getPolicyBundle(Number(replay.policy_version));
      if (existing) return existing;
    }
  }
  const bundle = await getPolicyBundle(version);
  if (!bundle) throw Object.assign(new Error("Policy version not found."), { status: 404 });
  const next = bundle.subjects.filter((subject) => subject.id !== subjectId);
  if (next.length === bundle.subjects.length) throw Object.assign(new Error("Policy subject not found."), { status: 404 });
  const parsed = validatePolicySubjects(next);
  if (!parsed.validation.valid) throw Object.assign(new Error(parsed.validation.errors.join(" ")), { status: 422, validation: parsed.validation });
  await assertDraftGeneration(version, expectedGeneration);
  await advanceDraftGeneration(version, expectedGeneration);
  await d1HttpQuery("DELETE FROM auto_press_blocked_subject_rules WHERE version=? AND subject_id=?", [version, subjectId]);
  await d1HttpQuery("DELETE FROM auto_press_blocked_subjects WHERE version=? AND subject_id=?", [version, subjectId]);
  await updateDraftCounts(version);
  const updated = await getPolicyBundle(version);
  if (!updated) throw new Error("Updated policy draft could not be loaded.");
  await writePolicyAudit({
    event: "subject_delete",
    version,
    subjectId,
    actor,
    idempotencyKey,
    summary: { generation: updated.version.generation },
  });
  return updated;
}

export async function validatePolicyDraft(version: number, actor: PolicyActor, idempotencyKey?: string) {
  if (idempotencyKey) {
    const replay = await findAuditByIdempotency(idempotencyKey);
    if (replay?.policy_version === version) {
      const row = await d1HttpFirst<PolicyVersionRow>("SELECT * FROM auto_press_policy_versions WHERE version=? LIMIT 1", [version]);
      if (row) {
        return {
          validation: parseJson<AutoPressPolicyValidation>(row.validation_json, { valid: false, errors: [], warnings: [], subjectCount: 0, ruleCount: 0 }),
          snapshot: row.snapshot_json ? await verifyPolicySnapshot(JSON.parse(row.snapshot_json)) : null,
          replayed: true,
        };
      }
    }
  }
  const bundle = await getPolicyBundle(version);
  if (!bundle) throw Object.assign(new Error("Policy version not found."), { status: 404 });
  if (!["draft", "validated"].includes(bundle.version.state)) throw Object.assign(new Error("Published policy versions are immutable."), { status: 409 });
  const baseline = bundle.version.baseVersion ? (await getPolicyVersion(bundle.version.baseVersion))?.subjectCount : STATIC_POLICY_VERSION;
  const { subjects, validation } = validatePolicySubjects(bundle.subjects, { baselineSubjectCount: baseline || 34 });
  const snapshot = validation.valid ? await buildPolicySnapshot(version, subjects) : null;
  await d1HttpQuery(
    `UPDATE auto_press_policy_versions
        SET state = ?, snapshot_json = ?, checksum = ?, subject_count = ?, rule_count = ?,
            validation_json = ?, validated_by = ?, validated_at = ?
      WHERE version = ? AND state IN ('draft', 'validated')`,
    [
      validation.valid ? "validated" : "draft",
      snapshot ? JSON.stringify(snapshot) : null,
      snapshot?.checksum || null,
      validation.subjectCount,
      validation.ruleCount,
      JSON.stringify(validation),
      actor.name,
      nowIso(),
      version,
    ],
  );
  await writePolicyAudit({
    event: "validate",
    version,
    actor,
    idempotencyKey,
    afterChecksum: snapshot?.checksum,
    summary: validation,
  });
  return { validation, snapshot };
}

export async function publishPolicyVersion(options: {
  version: number;
  baseVersion: number;
  expectedStateGeneration: number;
  actor: PolicyActor;
  summary: string;
  idempotencyKey: string;
}) {
  const existing = await findAuditByIdempotency(options.idempotencyKey);
  if (existing) return { replayed: true, state: await getPolicyState(), version: await getPolicyVersion(options.version) };
  const state = await getPolicyState();
  if (!state || state.publishedVersion !== options.baseVersion || state.generation !== options.expectedStateGeneration) {
    throw Object.assign(new Error("Published policy generation conflict."), { status: 409, state });
  }
  const validated = await validatePolicyDraft(options.version, options.actor);
  if (!validated.validation.valid || !validated.snapshot) {
    throw Object.assign(new Error("Policy validation failed."), { status: 422, validation: validated.validation });
  }
  const row = await getPolicyVersion(options.version);
  if (!row || row.baseVersion !== options.baseVersion || row.state !== "validated") {
    throw Object.assign(new Error("Policy version is not publishable."), { status: 409 });
  }
  const now = nowIso();
  await d1HttpQuery(
    `UPDATE auto_press_policy_state
        SET previous_version = published_version, published_version = ?, generation = generation + 1,
            updated_at = ?, updated_by = ?
      WHERE id = ? AND published_version = ? AND generation = ?`,
    [options.version, now, options.actor.name, POLICY_STATE_ID, options.baseVersion, options.expectedStateGeneration],
  );
  const updatedState = await getPolicyState();
  if (!updatedState || updatedState.publishedVersion !== options.version || updatedState.generation !== options.expectedStateGeneration + 1) {
    throw Object.assign(new Error("Policy publish pointer update failed."), { status: 409, state: updatedState });
  }
  await d1HttpQuery(
    `UPDATE auto_press_policy_versions
        SET state = 'published', published_by = ?, published_at = ?, change_summary = ?
      WHERE version = ? AND state = 'validated'`,
    [options.actor.name, now, options.summary, options.version],
  );
  await writePolicyAudit({
    event: "publish",
    version: options.version,
    actor: options.actor,
    idempotencyKey: options.idempotencyKey,
    afterChecksum: validated.snapshot.checksum,
    summary: { baseVersion: options.baseVersion, changeSummary: options.summary },
  });
  return { replayed: false, state: updatedState, version: await getPolicyVersion(options.version) };
}

export async function rollbackPolicyVersion(options: {
  targetVersion: number;
  expectedStateGeneration: number;
  actor: PolicyActor;
  reason: string;
  idempotencyKey: string;
}) {
  const existing = await findAuditByIdempotency(options.idempotencyKey);
  if (existing) return { replayed: true, state: await getPolicyState() };
  const state = await getPolicyState();
  if (!state || state.generation !== options.expectedStateGeneration) {
    throw Object.assign(new Error("Published policy generation conflict."), { status: 409, state });
  }
  const target = await d1HttpFirst<PolicyVersionRow>(
    "SELECT * FROM auto_press_policy_versions WHERE version = ? AND snapshot_json IS NOT NULL LIMIT 1",
    [options.targetVersion],
  );
  if (!target?.snapshot_json) throw Object.assign(new Error("Rollback target is not a validated snapshot."), { status: 422 });
  await verifyPolicySnapshot(JSON.parse(target.snapshot_json));
  const now = nowIso();
  await d1HttpQuery(
    `UPDATE auto_press_policy_state
        SET previous_version = published_version, published_version = ?, generation = generation + 1,
            updated_at = ?, updated_by = ?
      WHERE id = ? AND generation = ?`,
    [options.targetVersion, now, options.actor.name, POLICY_STATE_ID, options.expectedStateGeneration],
  );
  const updatedState = await getPolicyState();
  if (!updatedState || updatedState.publishedVersion !== options.targetVersion) {
    throw Object.assign(new Error("Policy rollback pointer update failed."), { status: 409, state: updatedState });
  }
  await writePolicyAudit({
    event: "rollback",
    version: options.targetVersion,
    actor: options.actor,
    idempotencyKey: options.idempotencyKey,
    afterChecksum: target.checksum || undefined,
    summary: { fromVersion: state.publishedVersion, reason: options.reason },
  });
  return { replayed: false, state: updatedState };
}

export async function writeRuntimeObservation(observation: RuntimeObservation) {
  await d1HttpQuery(
    `INSERT INTO auto_press_policy_runtime_observations
      (consumer, policy_version, checksum, source, invocation_id, applied_at, observed_at, error_code)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(consumer) DO UPDATE SET
       policy_version=excluded.policy_version, checksum=excluded.checksum, source=excluded.source,
       invocation_id=excluded.invocation_id, applied_at=excluded.applied_at,
       observed_at=excluded.observed_at, error_code=excluded.error_code`,
    [
      observation.consumer,
      observation.policyVersion,
      observation.checksum,
      observation.source,
      observation.invocationId,
      observation.appliedAt,
      observation.observedAt,
      observation.errorCode,
    ],
  );
}

export async function listRuntimeObservations(): Promise<RuntimeObservation[]> {
  const result = await d1HttpQuery<{
    consumer: string; policy_version: number; checksum: string; source: RuntimeObservation["source"];
    invocation_id: string | null; applied_at: string; observed_at: string; error_code: string | null;
  }>("SELECT * FROM auto_press_policy_runtime_observations ORDER BY consumer ASC");
  return result.rows.map((row) => ({
    consumer: row.consumer,
    policyVersion: Number(row.policy_version),
    checksum: row.checksum,
    source: row.source,
    invocationId: row.invocation_id,
    appliedAt: row.applied_at,
    observedAt: row.observed_at,
    errorCode: row.error_code,
  }));
}

export async function findAuditByIdempotency(idempotencyKey: string) {
  return d1HttpFirst<{ id: string; event: string; policy_version: number | null; summary_json: string | null }>(
    "SELECT id, event, policy_version, summary_json FROM auto_press_policy_audit_logs WHERE idempotency_key = ? LIMIT 1",
    [idempotencyKey],
  );
}

export async function writePolicyAudit(options: {
  event: string;
  version?: number;
  subjectId?: string;
  actor: PolicyActor;
  requestId?: string;
  idempotencyKey?: string;
  beforeChecksum?: string;
  afterChecksum?: string;
  summary?: unknown;
}) {
  await d1HttpQuery(
    `INSERT INTO auto_press_policy_audit_logs
      (id, event, policy_version, subject_id, actor_name, actor_role, request_id, idempotency_key,
       before_checksum, after_checksum, summary_json, ip_hash, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?)`,
    [
      randomId("audit"),
      options.event,
      options.version || null,
      options.subjectId || null,
      options.actor.name,
      options.actor.role,
      options.requestId || null,
      options.idempotencyKey || null,
      options.beforeChecksum || null,
      options.afterChecksum || null,
      JSON.stringify(options.summary || {}),
      nowIso(),
    ],
  );
}

export async function listPolicyAuditLogs(limit = 100) {
  const result = await d1HttpQuery<{
    id: string; event: string; policy_version: number | null; subject_id: string | null;
    actor_name: string; actor_role: string; before_checksum: string | null; after_checksum: string | null;
    summary_json: string | null; created_at: string;
  }>(
    `SELECT id, event, policy_version, subject_id, actor_name, actor_role,
            before_checksum, after_checksum, summary_json, created_at
       FROM auto_press_policy_audit_logs
      ORDER BY created_at DESC LIMIT ?`,
    [Math.min(Math.max(limit, 1), 200)],
  );
  return result.rows.map((row) => ({
    id: row.id,
    event: row.event,
    policyVersion: row.policy_version,
    subjectId: row.subject_id,
    actorName: row.actor_name,
    actorRole: row.actor_role,
    beforeChecksum: row.before_checksum,
    afterChecksum: row.after_checksum,
    summary: parseJson(row.summary_json, {}),
    createdAt: row.created_at,
  }));
}
