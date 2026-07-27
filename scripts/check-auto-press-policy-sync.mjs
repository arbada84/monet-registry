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
function value(name, fallback = "") {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : fallback;
}

async function main() {
  const env = loadEnv();
  const account = clean(env.CLOUDFLARE_ACCOUNT_ID);
  const database = clean(env.CLOUDFLARE_D1_DATABASE_ID || env.D1_DATABASE_ID);
  const token = clean(env.CLOUDFLARE_API_TOKEN);
  if (!account || !database || !token) throw new Error("Cloudflare D1 HTTP credentials are missing.");
  const endpoint = `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(account)}/d1/database/${encodeURIComponent(database)}/query`;
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify({
      sql: `SELECT s.published_version, s.generation, v.checksum, v.subject_count, v.rule_count,
                   (SELECT COUNT(*) FROM auto_press_blocked_subjects b WHERE b.version=s.published_version) actual_subjects
              FROM auto_press_policy_state s
              JOIN auto_press_policy_versions v ON v.version=s.published_version
             WHERE s.id='blocked-subjects'`,
      params: [],
    }),
    signal: AbortSignal.timeout(15_000),
  });
  const json = await response.json().catch(() => ({}));
  const row = json.result?.[0]?.results?.[0];
  if (!response.ok || !row) throw new Error("Published policy state could not be read.");
  const expected = Number(value("expect-subjects", "34"));
  const ok = Number(row.subject_count) === expected && Number(row.actual_subjects) === expected && Boolean(row.checksum);
  console.log(JSON.stringify({
    ok,
    publishedVersion: Number(row.published_version),
    generation: Number(row.generation),
    checksum: row.checksum,
    subjectCount: Number(row.subject_count),
    ruleCount: Number(row.rule_count),
    actualSubjects: Number(row.actual_subjects),
  }, null, 2));
  if (!ok) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});

