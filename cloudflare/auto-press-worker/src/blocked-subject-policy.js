import blockedSubjectsConfig from "../../../config/auto-press-blocked-subjects.json" with { type: "json" };

const STATIC_GENERATED_AT = "2026-07-27T00:00:00.000Z";
const QUEUE_CACHE_TTL_MS = 60_000;
let staticSnapshotPromise;
let lastKnownGood;
let queueCache;

function envFlag(env, name, fallback = false) {
  const raw = String(env?.[name] || "").trim().toLowerCase();
  if (!raw) return fallback;
  if (["1", "true", "yes", "on", "enabled"].includes(raw)) return true;
  if (["0", "false", "no", "off", "disabled"].includes(raw)) return false;
  return fallback;
}

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value).filter(([key]) => key !== "checksum").sort(([a], [b]) => a.localeCompare(b))
      .map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

async function sha256(value) {
  const bytes = new TextEncoder().encode(stableJson(value));
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(hash)).map((item) => item.toString(16).padStart(2, "0")).join("");
}

async function staticSnapshot() {
  if (!staticSnapshotPromise) {
    staticSnapshotPromise = (async () => {
      const snapshot = {
        version: Number(blockedSubjectsConfig.version || 2),
        policy: "CulturePeople editorial non-publication policy for promotional press releases",
        generatedAt: STATIC_GENERATED_AT,
        checksum: "",
        subjects: blockedSubjectsConfig.subjects.map((subject) => ({ ...subject, status: "active" })),
      };
      snapshot.checksum = await sha256(snapshot);
      return snapshot;
    })();
  }
  return staticSnapshotPromise;
}

function errorCode(error) {
  const text = error instanceof Error ? error.message : String(error);
  if (/checksum/i.test(text)) return "CHECKSUM_MISMATCH";
  if (/empty|subjects/i.test(text)) return "EMPTY_POLICY";
  return "D1_READ_FAILED";
}

async function readPublished(env) {
  const row = await env.DB.prepare(
    `SELECT v.snapshot_json
       FROM auto_press_policy_state s
       JOIN auto_press_policy_versions v ON v.version=s.published_version
      WHERE s.id='blocked-subjects'
      LIMIT 1`,
  ).first();
  if (!row?.snapshot_json) throw new Error("Published policy is empty.");
  const snapshot = JSON.parse(row.snapshot_json);
  if (!Array.isArray(snapshot.subjects) || snapshot.subjects.length === 0) throw new Error("Published policy has no subjects.");
  if (await sha256(snapshot) !== snapshot.checksum) throw new Error("Published policy checksum mismatch.");
  return snapshot;
}

async function observe(env, consumer, loaded, invocationId) {
  const now = new Date().toISOString();
  await env.DB.prepare(
    `INSERT INTO auto_press_policy_runtime_observations
      (consumer, policy_version, checksum, source, invocation_id, applied_at, observed_at, error_code)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(consumer) DO UPDATE SET
       policy_version=excluded.policy_version, checksum=excluded.checksum, source=excluded.source,
       invocation_id=excluded.invocation_id, applied_at=excluded.applied_at,
       observed_at=excluded.observed_at, error_code=excluded.error_code`,
  ).bind(
    consumer,
    loaded.snapshot.version,
    loaded.snapshot.checksum,
    loaded.source,
    invocationId || null,
    now,
    now,
    loaded.errorCode || null,
  ).run();
}

export async function loadWorkerBlockedSubjectPolicy(env, options = {}) {
  const consumer = options.consumer || "worker-scheduled";
  const useQueueCache = Boolean(options.useQueueCache);
  const now = Date.now();
  let loaded;

  if (useQueueCache && queueCache && now - queueCache.loadedAt < QUEUE_CACHE_TTL_MS) {
    loaded = queueCache.loaded;
  } else if (!envFlag(env, "AUTO_PRESS_DYNAMIC_POLICY_ENABLED", false)) {
    loaded = { snapshot: await staticSnapshot(), source: "static-fallback", errorCode: "FEATURE_DISABLED" };
  } else {
    try {
      const snapshot = await readPublished(env);
      lastKnownGood = snapshot;
      loaded = { snapshot, source: "d1", errorCode: null };
    } catch (error) {
      loaded = lastKnownGood
        ? { snapshot: lastKnownGood, source: "last-known-good", errorCode: errorCode(error) }
        : { snapshot: await staticSnapshot(), source: "static-fallback", errorCode: errorCode(error) };
    }
  }
  if (useQueueCache) queueCache = { loadedAt: now, loaded };
  await observe(env, consumer, loaded, options.invocationId).catch(() => undefined);
  return loaded;
}

export async function readWorkerPolicyPublishedState(env) {
  try {
    const row = await env.DB.prepare(
      `SELECT s.published_version, s.generation, s.updated_at, v.checksum
         FROM auto_press_policy_state s
         JOIN auto_press_policy_versions v ON v.version=s.published_version
        WHERE s.id='blocked-subjects' LIMIT 1`,
    ).first();
    return row ? {
      configured: true,
      publishedVersion: Number(row.published_version),
      generation: Number(row.generation),
      checksum: row.checksum,
      updatedAt: row.updated_at,
      dynamicEnabled: envFlag(env, "AUTO_PRESS_DYNAMIC_POLICY_ENABLED", false),
    } : { configured: false, dynamicEnabled: envFlag(env, "AUTO_PRESS_DYNAMIC_POLICY_ENABLED", false) };
  } catch {
    return { configured: false, dynamicEnabled: envFlag(env, "AUTO_PRESS_DYNAMIC_POLICY_ENABLED", false) };
  }
}

function compact(value) {
  return String(value || "").normalize("NFKC").toLowerCase().replace(/<[^>]+>/g, " ").replace(/[\s\u00a0._\-–—/]+/g, "");
}

export function matchWorkerBlockedSubject(input = {}, snapshot) {
  const fields = {
    title: compact(input.title),
    summary: compact(input.summary),
    bodyText: compact(input.bodyText),
    bodyHtml: compact(input.bodyHtml),
    tags: compact(input.tags),
    sourceName: compact(input.sourceName),
    keywords: compact(Array.isArray(input.keywords) ? input.keywords.join(" ") : ""),
  };
  const text = Object.values(fields).join("");
  let hostname = "";
  try { hostname = new URL(String(input.sourceUrl || "")).hostname.toLowerCase().replace(/\.$/, ""); } catch {}
  for (const subject of snapshot?.subjects || []) {
    const domain = (subject.domains || []).find((rule) => hostname === rule || hostname.endsWith(`.${rule}`));
    if (domain) return { blocked: true, ...subject, matchType: "domain", rule: domain, matchedField: "sourceUrl" };
    const term = (subject.terms || []).find((rule) => text.includes(compact(rule)));
    if (term) {
      const normalized = compact(term);
      const matchedField = Object.entries(fields).find(([, value]) => value.includes(normalized))?.[0] || "title";
      return { blocked: true, ...subject, matchType: "term", rule: term, matchedField };
    }
    const termGroup = (subject.termGroups || []).find((group) => group.every((rule) => text.includes(compact(rule))));
    if (termGroup) return { blocked: true, ...subject, matchType: "term-group", rule: termGroup.join(" + "), matchedField: "multiple" };
  }
  return { blocked: false };
}

