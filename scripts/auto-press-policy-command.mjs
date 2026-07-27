import fs from "node:fs";
import path from "node:path";
import process from "node:process";

function clean(value) { return String(value || "").trim().replace(/^["']|["']$/g, ""); }
function loadEnv() {
  const env = { ...process.env };
  for (const name of [".env.local", ".env.vercel.local", ".env"]) {
    const file = path.join(process.cwd(), name);
    if (!fs.existsSync(file)) continue;
    for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
      const match = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
      if (match && !env[match[1]]) env[match[1]] = clean(match[2]);
    }
  }
  return env;
}
function arg(name, fallback = "") {
  const direct = process.argv.find((item) => item.startsWith(`--${name}=`));
  if (direct) return direct.slice(name.length + 3);
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : fallback;
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
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(stableJson(value)));
  return Array.from(new Uint8Array(digest)).map((item) => item.toString(16).padStart(2, "0")).join("");
}

async function readD1Version(env, version) {
  const account = clean(env.CLOUDFLARE_ACCOUNT_ID);
  const database = clean(env.CLOUDFLARE_D1_DATABASE_ID || env.D1_DATABASE_ID);
  const apiToken = clean(env.CLOUDFLARE_API_TOKEN);
  if (!account || !database || !apiToken) throw new Error("D1 dry-run credentials are missing.");
  const response = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(account)}/d1/database/${encodeURIComponent(database)}/query`,
    {
      method: "POST",
      headers: { authorization: `Bearer ${apiToken}`, "content-type": "application/json" },
      body: JSON.stringify({
        sql: `SELECT v.version, v.state, v.base_version, v.generation, v.snapshot_json, v.checksum,
                     v.subject_count, v.rule_count, s.published_version, s.generation AS state_generation
                FROM auto_press_policy_versions v
                LEFT JOIN auto_press_policy_state s ON s.id='blocked-subjects'
               WHERE v.version=? LIMIT 1`,
        params: [version],
      }),
      signal: AbortSignal.timeout(15_000),
    },
  );
  const json = await response.json().catch(() => ({}));
  const row = json.result?.[0]?.results?.[0];
  if (!response.ok || !row) throw new Error(`D1 policy version ${version} could not be read.`);
  const snapshot = row.snapshot_json ? JSON.parse(row.snapshot_json) : null;
  const checksumValid = Boolean(snapshot?.checksum && snapshot.checksum === row.checksum && await sha256(snapshot) === row.checksum);
  return {
    version: Number(row.version),
    state: row.state,
    baseVersion: row.base_version == null ? null : Number(row.base_version),
    generation: Number(row.generation),
    checksum: row.checksum,
    checksumValid,
    subjectCount: Number(row.subject_count),
    ruleCount: Number(row.rule_count),
    publishedVersion: row.published_version == null ? null : Number(row.published_version),
    stateGeneration: Number(row.state_generation || 0),
  };
}

async function main() {
  const env = loadEnv();
  const action = arg("action", "validate");
  const apply = process.argv.includes("--apply");
  const base = clean(arg("base", env.NEXT_PUBLIC_SITE_URL || "https://culturepeople.co.kr")).replace(/\/+$/, "");
  const version = Number(arg("version", "0"));
  if (!Number.isInteger(version) || version <= 0) throw new Error("--version <positive integer> is required.");
  const token = clean(env.CP_ADMIN_AUTH_TOKEN || env.SMOKE_ADMIN_AUTH_TOKEN);
  if (!apply) {
    const target = await readD1Version(env, version);
    console.log(JSON.stringify({ mode: "dry-run", action, target }, null, 2));
    if (!target.checksumValid) throw new Error("Dry-run blocked: snapshot checksum is missing or invalid.");
    console.log("- D1 snapshot verified; no mutation performed");
    return;
  }

  const headers = token ? { cookie: `cp-admin-auth=${token}`, accept: "application/json" } : { accept: "application/json" };
  const currentResponse = await fetch(`${base}/api/auto-press/blocked-subjects?version=${version}`, {
    headers,
    signal: AbortSignal.timeout(15_000),
  });
  const current = await currentResponse.json().catch(() => ({}));
  if (!currentResponse.ok) throw new Error(`Policy read failed: HTTP ${currentResponse.status} ${current.error || ""}`.trim());
  console.log(JSON.stringify({
    mode: apply ? "apply" : "dry-run",
    action,
    targetVersion: version,
    currentState: current.state,
    target: current.bundle?.version,
  }, null, 2));
  if (!token) throw new Error("Apply blocked: CP_ADMIN_AUTH_TOKEN or SMOKE_ADMIN_AUTH_TOKEN is missing.");

  let endpoint;
  let body;
  if (action === "validate") {
    endpoint = "/api/auto-press/blocked-subjects/validate";
    body = { version };
  } else if (action === "publish") {
    const baseVersion = Number(arg("base-version", current.bundle?.version?.baseVersion || 0));
    const generation = Number(arg("generation", current.state?.generation ?? -1));
    const summary = clean(arg("summary"));
    if (!baseVersion || generation < 0 || summary.length < 5) {
      throw new Error("Publish requires --base-version, --generation, and --summary (5+ chars).");
    }
    endpoint = "/api/auto-press/blocked-subjects/publish";
    body = { version, baseVersion, generation, summary };
  } else {
    throw new Error(`Unsupported --action ${action}.`);
  }
  const response = await fetch(`${base}${endpoint}`, {
    method: "POST",
    headers: {
      ...headers,
      origin: new URL(base).origin,
      "content-type": "application/json",
      "idempotency-key": `policy-cli:${crypto.randomUUID()}`,
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(20_000),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok || result.success === false) throw new Error(`Policy ${action} failed: HTTP ${response.status} ${result.error || ""}`.trim());
  console.log(JSON.stringify(result, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
