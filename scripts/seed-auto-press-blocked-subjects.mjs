import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const root = process.cwd();
const config = JSON.parse(fs.readFileSync(path.join(root, "config", "auto-press-blocked-subjects.json"), "utf8"));

function clean(value) {
  return String(value || "").trim().replace(/^["']|["']$/g, "");
}

function loadEnv() {
  const env = { ...process.env };
  for (const name of [".env.local", ".env.vercel.local", ".env"]) {
    const file = path.join(root, name);
    if (!fs.existsSync(file)) continue;
    for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
      const match = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
      if (!match || env[match[1]]) continue;
      env[match[1]] = clean(match[2]);
    }
  }
  return env;
}

function args(argv) {
  const flags = new Set(argv.filter((item) => item.startsWith("--")));
  return { apply: flags.has("--apply"), dryRun: !flags.has("--apply") };
}

function chunks(items, size = 8) {
  const output = [];
  for (let index = 0; index < items.length; index += size) output.push(items.slice(index, index + size));
  return output;
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

function snapshotSubjects() {
  return config.subjects.map((subject) => ({
    id: subject.id,
    label: subject.label,
    status: "active",
    terms: subject.terms || [],
    termGroups: subject.termGroups || [],
    domains: subject.domains || [],
  }));
}

async function buildSnapshot() {
  const snapshot = {
    version: Number(config.version),
    policy: "CulturePeople editorial non-publication policy for promotional press releases",
    generatedAt: "2026-07-27T00:00:00.000Z",
    checksum: "",
    subjects: snapshotSubjects(),
  };
  snapshot.checksum = await sha256(snapshot);
  return snapshot;
}

function d1Client(env) {
  const account = clean(env.CLOUDFLARE_ACCOUNT_ID);
  const database = clean(env.CLOUDFLARE_D1_DATABASE_ID || env.D1_DATABASE_ID);
  const token = clean(env.CLOUDFLARE_API_TOKEN);
  if (!account || !database || !token) {
    throw new Error("Missing CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_D1_DATABASE_ID/D1_DATABASE_ID, or CLOUDFLARE_API_TOKEN.");
  }
  const endpoint = `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(account)}/d1/database/${encodeURIComponent(database)}/query`;
  return async (sql, params = []) => {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify({ sql, params }),
      signal: AbortSignal.timeout(15_000),
    });
    const json = await response.json().catch(() => ({}));
    if (!response.ok || json.success === false || json.result?.[0]?.success === false) {
      const detail = json.errors?.map((item) => item.message).filter(Boolean).join("; ")
        || json.result?.[0]?.error || `HTTP ${response.status}`;
      throw new Error(`D1 query failed: ${detail}`);
    }
    const result = Array.isArray(json.result) ? json.result[0] : json.result;
    return result?.results || [];
  };
}

async function main() {
  const mode = args(process.argv.slice(2));
  const snapshot = await buildSnapshot();
  const ruleCount = snapshot.subjects.reduce((count, subject) => (
    count + subject.terms.length + subject.termGroups.length + subject.domains.length
  ), 0);
  console.log("CulturePeople auto-press policy seed");
  console.log(`- mode: ${mode.dryRun ? "dry-run" : "apply"}`);
  console.log(`- version: ${snapshot.version}`);
  console.log(`- subjects/rules: ${snapshot.subjects.length}/${ruleCount}`);
  console.log(`- checksum: ${snapshot.checksum}`);
  if (snapshot.subjects.length !== 34) throw new Error(`Seed blocked: expected 34 subjects, got ${snapshot.subjects.length}.`);
  if (mode.dryRun) {
    console.log("- no D1 writes performed");
    return;
  }

  const query = d1Client(loadEnv());
  const tables = await query("SELECT name FROM sqlite_master WHERE type='table' AND name='auto_press_policy_versions'");
  if (!tables.length) throw new Error("Seed blocked: migration 0005 has not been applied.");
  const existing = await query(
    `SELECT v.checksum, v.subject_count, v.rule_count,
            (SELECT COUNT(*) FROM auto_press_blocked_subjects s WHERE s.version=v.version) AS actual_subjects,
            (SELECT COUNT(*) FROM auto_press_blocked_subject_rules r WHERE r.version=v.version) AS actual_rules
       FROM auto_press_policy_versions v WHERE v.version = ?`,
    [snapshot.version],
  );
  if (existing.length) {
    const row = existing[0];
    if (
      row.checksum !== snapshot.checksum
      || Number(row.subject_count) !== 34
      || Number(row.rule_count) !== ruleCount
      || Number(row.actual_subjects) !== 34
      || Number(row.actual_rules) !== ruleCount
    ) {
      throw new Error("Seed blocked: existing version 2 does not match the static policy checksum/counts.");
    }
    console.log("- existing seed verified; no writes required");
    return;
  }

  const now = new Date().toISOString();
  const orphan = await query(
    `SELECT
       (SELECT COUNT(*) FROM auto_press_blocked_subjects WHERE version=?) AS subjects,
       (SELECT COUNT(*) FROM auto_press_blocked_subject_rules WHERE version=?) AS rules`,
    [snapshot.version, snapshot.version],
  );
  if (Number(orphan[0]?.subjects || 0) || Number(orphan[0]?.rules || 0)) {
    throw new Error("Seed blocked: orphaned partial seed rows exist for version 2.");
  }

  const subjectRows = snapshot.subjects.map((subject, sortOrder) => [
    snapshot.version, subject.id, subject.label, sortOrder, now, now,
  ]);
  for (const batch of chunks(subjectRows)) {
    await query(
      `INSERT INTO auto_press_blocked_subjects
        (version, subject_id, label, status, reason, notes, sort_order, created_by, updated_by, created_at, updated_at)
       VALUES ${batch.map(() => "(?, ?, ?, 'active', '', '', ?, 'system-seed', 'system-seed', ?, ?)").join(",")}`,
      batch.flat(),
    );
  }

  const ruleRows = [];
  for (const subject of snapshot.subjects) {
    let ruleOrder = 0;
    const rules = [
      ...subject.terms.map((value) => ({ type: "term", value })),
      ...subject.termGroups.map((value) => ({ type: "term_group", value })),
      ...subject.domains.map((value) => ({ type: "domain", value })),
    ];
    for (const rule of rules) {
      const normalized = Array.isArray(rule.value)
        ? rule.value.map((value) => clean(value).normalize("NFKC").toLowerCase()).sort().join("+")
        : clean(rule.value).normalize("NFKC").toLowerCase();
      ruleRows.push([
        crypto.randomUUID(), snapshot.version, subject.id, rule.type,
        JSON.stringify(rule.value), normalized, ruleOrder++, now, now,
      ]);
    }
  }
  for (const batch of chunks(ruleRows)) {
      await query(
        `INSERT INTO auto_press_blocked_subject_rules
          (id, version, subject_id, rule_type, value_json, normalized_value, risk_level, enabled, sort_order, created_at, updated_at)
         VALUES ${batch.map(() => "(?, ?, ?, ?, ?, ?, 'normal', 1, ?, ?, ?)").join(",")}`,
        batch.flat(),
      );
  }

  await query(
    `INSERT INTO auto_press_policy_versions
      (version, state, base_version, generation, snapshot_json, checksum, subject_count, rule_count,
       validation_json, change_summary, created_by, validated_by, published_by, created_at, validated_at, published_at)
     VALUES (?, 'published', NULL, 0, ?, ?, ?, ?, ?, ?, 'system-seed', 'system-seed', 'system-seed', ?, ?, ?)`,
    [
      snapshot.version,
      JSON.stringify(snapshot),
      snapshot.checksum,
      snapshot.subjects.length,
      ruleCount,
      JSON.stringify({ valid: true, errors: [], warnings: [], subjectCount: snapshot.subjects.length, ruleCount }),
      "Static policy v2 seed",
      now,
      now,
      now,
    ],
  );
  await query(
    `INSERT OR IGNORE INTO auto_press_policy_state
      (id, published_version, previous_version, generation, updated_at, updated_by)
     VALUES ('blocked-subjects', ?, NULL, 0, ?, 'system-seed')`,
    [snapshot.version, now],
  );
  const verified = await query(
    `SELECT v.checksum, v.subject_count, v.rule_count,
            (SELECT COUNT(*) FROM auto_press_blocked_subjects s WHERE s.version=v.version) AS actual_subjects,
            (SELECT COUNT(*) FROM auto_press_blocked_subject_rules r WHERE r.version=v.version) AS actual_rules
       FROM auto_press_policy_versions v WHERE v.version=?`,
    [snapshot.version],
  );
  const row = verified[0];
  if (!row || row.checksum !== snapshot.checksum || Number(row.actual_subjects) !== 34 || Number(row.actual_rules) !== ruleCount) {
    throw new Error("Seed verification failed.");
  }
  console.log("- D1 seed applied and verified");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
