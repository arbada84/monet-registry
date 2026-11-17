import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { parseArgs } from "./lib/culturepeople-ops-utils.mjs";
import { classifyApplicationChanges, assertUnchangedBuildHooks, verifyCandidate, hasSuccessfulSourceCi, legalStatusMarkers } from "./lib/application-release-policy.mjs";

const { flags, values } = parseArgs(process.argv.slice(2));
const projectId = "prj_fN7aCu9wkSUs6FsxLbrFIiEpCawY";
const teamId = "team_r6EedfOTYhrZjdhxlDEFeSBF";
const base = "https://culturepeople.co.kr";
const baseline = values.baseline;
const candidateId = values.candidate;
const steps = ["clean fixed source and change classification", "unchanged build hooks", "unit tests, typecheck, lint and fonts", "same-SHA GitHub CI", "production candidate artifact", "D1/R2 health and public surfaces", "baseline legal comparison", "promotion and postflight with guarded rollback"];
if (flags.has("dry-run") || (!flags.has("check") && !flags.has("apply"))) {
  console.log(JSON.stringify({ profile: "application", mode: "dry-run", steps, dataChanges: "Use the existing full release gate", databaseWrites: false, supabaseRecoveryRequired: false, workerDeployment: false }, null, 2));
  process.exit(0);
}
if (flags.has("promote") && !flags.has("apply")) throw new Error("Promotion requires --promote --apply");
assert.match(baseline || "", /^[a-f0-9]{40}$/);
assert.match(candidateId || "", /^dpl_[A-Za-z0-9]+$/);
const git = (...args) => execFileSync("git", args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
const sha = git("rev-parse", "HEAD");
const reportFile = path.resolve(values.report || path.join(os.homedir(), ".local/state/culturepeople", `application-release-${sha}.json`));
fs.mkdirSync(path.dirname(reportFile), { recursive: true });
const report = { profile: "application", sourceSha: sha, baseline, candidateId, startedAt: new Date().toISOString(), checks: [], warnings: [], ok: false };
let token = "";
let cliEnv;
let previousId;
let promotionAttempted = false;
let failingStep = "source";
function record(name, result) { report.checks.push({ name, ...result }); }
function command(name, executable, args, env = process.env) {
  failingStep = name;
  const windowsBatch = process.platform === "win32" && /^(?:pnpm(?:\.cmd)?|npx)$/.test(executable);
  const result = spawnSync(windowsBatch && !executable.endsWith(".cmd") ? `${executable}.cmd` : executable, args, { env, encoding: "utf8", timeout: 600000, maxBuffer: 16 * 1024 * 1024, shell: windowsBatch });
  record(name, { ok: result.status === 0, exit: result.status });
  if (result.status !== 0) throw new Error(`${name} failed; exit ${result.status}`);
  return result.stdout;
}
async function api(route) {
  const response = await fetch(`https://api.vercel.com${route}`, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(30000) });
  assert.ok(response.ok, `Vercel metadata HTTP ${response.status}`);
  return response.json();
}
async function aliasId() {
  const alias = await api(`/v4/aliases/culturepeople.co.kr?teamId=${teamId}`);
  return alias.deploymentId || alias.deployment?.id;
}
function candidateGet(route, deployment) {
  const out = command(`candidate ${route}`, "npx", ["--yes", "vercel@65.17.0", "curl", route, "--deployment", deployment.url, "--", "--silent", "--show-error", "--max-time", "30", "--write-out", "\n%{http_code}"], cliEnv);
  const index = out.lastIndexOf("\n");
  return { status: Number(out.slice(index + 1).trim()), body: out.slice(0, index) };
}
async function productionGet(route) {
  const response = await fetch(`${base}${route}`, { signal: AbortSignal.timeout(30000), cache: "no-store" });
  return { status: response.status, body: await response.text(), noindex: /noindex/i.test(response.headers.get("x-robots-tag") || "") };
}
function health(response) {
  assert.equal(response.status, 200);
  const value = JSON.parse(response.body);
  assert.equal(value.database.ok, true);
  assert.equal(value.databaseProvider.provider, "d1");
  assert.equal(value.databaseProvider.runtimeReady, true);
  assert.equal(value.mediaStorage.provider, "r2");
  assert.equal(value.mediaStorage.configured, true);
  const inspect = object => { for (const [key, flag] of Object.entries(object)) { if (/dual.?write/i.test(key)) assert.equal(flag, false); else if (flag && typeof flag === "object") inspect(flag); } };
  inspect(value.databaseProvider);
}

try {
  assert.equal(git("status", "--porcelain"), "", "Worktree must be clean");
  git("merge-base", "--is-ancestor", baseline, sha);
  const scope = classifyApplicationChanges(git("diff", "--name-only", baseline, sha).split("\n").filter(Boolean), { allowCiWorkflow: flags.has("review-ci-workflow") });
  assert.ok(scope.ok, "Data migrations or private artifacts require a different release profile");
  assertUnchangedBuildHooks(JSON.parse(git("show", `${baseline}:package.json`)), JSON.parse(fs.readFileSync("package.json", "utf8")));
  record("source", { ok: true, tree: git("rev-parse", "HEAD^{tree}"), scope });
  if (scope.workerSourceOnly.length) report.warnings.push("Worker source is preserved but this command deploys Vercel only; verify the Worker release separately.");
  const tokenFile = values["token-file"] || path.join(os.homedir(), ".config/culturepeople/vercel.env");
  const stat = fs.lstatSync(tokenFile);
  assert.ok(stat.isFile() && !stat.isSymbolicLink() && (stat.mode & 0o077) === 0, "Credential file must be owner-only");
  const line = fs.readFileSync(tokenFile, "utf8").split(/\r?\n/).find(line => line.startsWith("CULTUREPEOPLE_VERCEL_TOKEN="));
  token = line?.slice(line.indexOf("=") + 1).trim().replace(/^(['"])(.*)\1$/, "$2");
  assert.ok(token, "Vercel token missing");
  cliEnv = { ...process.env, VERCEL_TOKEN: token, VERCEL_ORG_ID: teamId, VERCEL_PROJECT_ID: projectId };
  for (const script of ["test:unit", "ci:typecheck", "ci:lint", "check:fonts"]) command(script, process.platform === "win32" ? "pnpm.cmd" : "pnpm", [script]);
  failingStep = "same-source CI";
  const ciResponse = await fetch(`https://api.github.com/repos/arbada84/monet-registry/actions/runs?head_sha=${sha}&per_page=30`, { headers: { "User-Agent": "CulturePeopleReleaseCheck" }, signal: AbortSignal.timeout(30000) });
  assert.ok(ciResponse.ok, "GitHub CI lookup failed");
  const ci = await ciResponse.json();
  assert.ok(hasSuccessfulSourceCi(ci.workflow_runs || [], sha), "Same-SHA CI is not successful yet");
  record("same-source CI", { ok: true, sha });
  const deployment = await api(`/v13/deployments/${candidateId}?teamId=${teamId}`);
  assert.ok(verifyCandidate(deployment, { sha, projectId }), "Candidate target/source/project/readiness mismatch");
  previousId = await aliasId();
  const previous = await api(`/v13/deployments/${previousId}?teamId=${teamId}`);
  assert.equal(previous.meta?.gitCommitSha || previous.meta?.githubCommitSha, baseline, "Production changed since the baseline was chosen");
  report.rollbackDeployment = previousId;
  health(candidateGet("/api/health", deployment));
  const home = candidateGet("/", deployment);
  assert.equal(home.status, 200);
  assert.equal((home.body.match(/<h1(?:\s|>)/g) || []).length, 1);
  const articlePath = home.body.match(/\/article\/\d+/)?.[0];
  assert.ok(articlePath, "No published article found");
  const article = candidateGet(articlePath, deployment);
  assert.equal(article.status, 200);
  assert.ok(article.body.includes("NewsArticle"));
  assert.ok(!/<meta\b[^>]*name=["'](?:robots|googlebot)["'][^>]*content=["'][^"']*noindex/i.test(article.body));
  assert.ok(article.body.includes(`href="${base}${articlePath}"`));
  for (const route of ["/rss.xml", "/sitemap.xml", "/news-sitemap.xml", "/robots.txt"]) assert.equal(candidateGet(route, deployment).status, 200, route);
  const legalBaseline = {};
  for (const route of ["/terms", "/privacy", "/youth-policy", "/about", "/contact"]) {
    const before = await productionGet(route);
    const after = candidateGet(route, deployment);
    assert.equal(after.status, before.status);
    legalBaseline[route] = legalStatusMarkers(before.body);
    assert.deepEqual(legalStatusMarkers(after.body), legalBaseline[route], `Legal state regressed: ${route}`);
  }
  report.legalBaseline = legalBaseline;
  if (Object.values(legalBaseline).flat().some(value => value.includes("missing"))) report.warnings.push("Existing unapproved legal information remains; no representative approval is implied by this application gate.");
  assert.equal(await aliasId(), previousId, "Production alias changed during validation");
  if (flags.has("promote")) {
    promotionAttempted = true;
    command("promote", "npx", ["--yes", "vercel@65.17.0", "promote", candidateId, "--yes", "--timeout", "3m"], cliEnv);
    assert.equal(await aliasId(), candidateId);
    health(await productionGet("/api/health"));
    const liveHome = await productionGet("/");
    assert.equal(liveHome.status, 200);
    assert.equal(liveHome.noindex, false);
    for (const [route, markers] of Object.entries(legalBaseline)) assert.deepEqual(legalStatusMarkers((await productionGet(route)).body), markers);
    command("public portal", process.execPath, ["scripts/verify-portal-surface.mjs", "--base", base, "--json"]);
    command("public browser", process.execPath, ["scripts/browser-smoke.mjs", `--base-url=${base}`, "--public-site-only", "--no-auto-start", "--no-admin-auth", "--json"]);
  }
  report.ok = true;
} catch (error) {
  report.failure = { step: failingStep, message: String(error instanceof Error ? error.message : "release check failed").replaceAll(token || "\0", "[redacted]").slice(0, 1000) };
  if (promotionAttempted && previousId) {
    try {
      const current = await aliasId();
      if (current === candidateId) {
        command("rollback", "npx", ["--yes", "vercel@65.17.0", "promote", previousId, "--yes"], cliEnv);
        report.rolledBack = await aliasId() === previousId;
      } else if (current !== previousId) report.warnings.push("Another operator changed production; no automatic overwrite.");
    } catch { report.rollbackFailed = true; }
  }
  process.exitCode = 1;
} finally {
  if (promotionAttempted) { try { report.productionDeployment = await aliasId(); } catch { report.productionDeployment = null; } }
  report.finishedAt = new Date().toISOString();
  fs.writeFileSync(reportFile, JSON.stringify(report, null, 2), { mode: 0o600 });
  console.log(JSON.stringify({ ok: report.ok, promoted: promotionAttempted ? report.productionDeployment === candidateId : false, sha, report: reportFile, failure: report.failure, warnings: report.warnings }, null, 2));
}
