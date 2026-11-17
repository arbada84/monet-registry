import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';

// This read-only profile verifies the fixed application artifact, not data recovery.
const root = '/home/arbada/projects/culturepeople/releases/two-home-final-20261117';
const sha = '907e47529ee1447529141b8396b607d147ac62c7';
const baseline = '75c74f093efe48c05bc40e5277a4a903af4d334e';
const candidate = 'dpl_9UescKCZswG7J4gbD5JtgH2euWNk';
const rollback = 'dpl_HyWykUJPnBq2dSryQaVgJi4Uzirs';
const team = 'team_r6EedfOTYhrZjdhxlDEFeSBF';
const project = 'prj_fN7aCu9wkSUs6FsxLbrFIiEpCawY';
const tokenFile = path.join(process.env.HOME, '.config/culturepeople/vercel.env');
assert.equal(fs.statSync(tokenFile).mode & 0o077, 0, 'Credential permissions');
const line = fs.readFileSync(tokenFile, 'utf8').split(/\r?\n/).find(v => v.startsWith('CULTUREPEOPLE_VERCEL_TOKEN='));
const token = line?.slice(line.indexOf('=') + 1).trim().replace(/^(['"])(.*)\1$/, '$2');
assert.ok(token, 'Missing credential');
const env = { ...process.env, VERCEL_TOKEN: token, VERCEL_ORG_ID: team, VERCEL_PROJECT_ID: project };
const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
const report = { profile: 'application-update', sha, baseline, candidate, rollback, checkedAt: new Date().toISOString(), checks: {}, warnings: [
  'GitHub CI font download build failed; actual Vercel candidate build must be READY. CI unit tests and lint are separately verified.',
  'Legacy Supabase recovery, backup freshness and existing legal omissions remain unresolved; no database or settings mutation is included.',
  'Do not select a GPT-6 model globally until the separate deployed Worker supports it.'
] };
assert.equal(git('rev-parse', 'HEAD'), sha);
assert.equal(git('status', '--porcelain'), '');
const allowed = new Set([
  '.github/workflows/ci.yml', 'docs/two-home-modes-rollout-2026-11-17.md',
  'docs/two-home-security-ai-release-remediation-2026-11-17.md', 'package.json', 'pnpm-lock.yaml',
  'scripts/browser-smoke.mjs', 'src/app/page.tsx', 'src/lib/ai-model-options.ts',
  'src/lib/culturepeople-home-layout.ts', 'src/lib/insightkorea-home-layout.ts',
  ...['CulturePeopleHome.module.css', 'CulturePeopleHome.tsx', 'index.ts'].map(v => `src/components/themes/culturepeople/${v}`),
  ...['InsightKoreaFooter.tsx', 'InsightKoreaNewsHome.module.css', 'InsightKoreaNewsHome.tsx', 'index.ts'].map(v => `src/components/themes/insightkorea/${v}`),
  ...['ai-model-options', 'culturepeople-home-layout', 'home-seo-language-heading', 'insightkorea-home-layout', 'openai-current-model-selection', 'two-home-modes-render'].map(v => `tests/unit/${v}.test.ts`)
]);
const changed = git('diff', '--name-only', baseline, sha).split('\n');
assert.ok(changed.every(v => allowed.has(v)), 'Changes outside approved application scope');
const oldPackage = JSON.parse(git('show', `${baseline}:package.json`));
const newPackage = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
assert.deepEqual(newPackage.scripts, oldPackage.scripts, 'Package command mutation');
const packageMetadata = value => Object.fromEntries(Object.entries(value).filter(([key]) => !['dependencies', 'devDependencies', 'optionalDependencies', 'pnpm'].includes(key)));
assert.deepEqual(packageMetadata(newPackage), packageMetadata(oldPackage), 'Package metadata mutation');
assert.deepEqual(Object.fromEntries(Object.entries(newPackage.pnpm ?? {}).filter(([key]) => key !== 'overrides')), Object.fromEntries(Object.entries(oldPackage.pnpm ?? {}).filter(([key]) => key !== 'overrides')));
report.checks.source = { clean: true, files: changed };
report.tree = git('rev-parse', 'HEAD^{tree}');
report.verifierSha256 = createHash('sha256').update(fs.readFileSync(new URL(import.meta.url))).digest('hex');
report.ci = { runId: 44101293032, latestJobId: 134113465931, conclusion: 'failure', fullCiPassed: false, unitTests: 600, unitFiles: 120, lint: 'passed', failedStage: 'next/font Google font download URL parsing during build', buildEvidence: candidate };
async function api(route) {
  const r = await fetch(`https://api.vercel.com${route}`, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(30000) });
  assert.ok(r.ok, `Vercel metadata HTTP ${r.status}`);
  return r.json();
}
const deployment = await api(`/v13/deployments/${candidate}?teamId=${team}`);
assert.equal(deployment.readyState, 'READY');
assert.equal(deployment.target, 'production', 'Candidate must already use production build environment');
assert.equal(deployment.projectId, project);
assert.equal(deployment.meta.gitCommitSha ?? deployment.meta.githubCommitSha, sha);
const alias = await api(`/v4/aliases/culturepeople.co.kr?teamId=${team}`);
assert.ok([rollback, candidate].includes(alias.deploymentId ?? alias.deployment?.id), 'Unexpected production deployment');
report.checks.artifact = { ready: true, url: deployment.url, productionBefore: alias.deploymentId ?? alias.deployment?.id };
function candidateGet(route) {
  const out = execFileSync('npx', ['--yes', 'vercel@65.17.0', 'curl', route, '--deployment', deployment.url, '--', '--silent', '--show-error', '--max-time', '45', '--write-out', '\n%{http_code}'], { cwd: root, env, encoding: 'utf8', timeout: 90000, maxBuffer: 8 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] });
  const i = out.lastIndexOf('\n');
  return { status: Number(out.slice(i + 1).trim()), body: out.slice(0, i) };
}
async function productionGet(route) {
  const r = await fetch(`https://culturepeople.co.kr${route}`, { signal: AbortSignal.timeout(45000) });
  return { status: r.status, body: await r.text() };
}
function health(r) {
  assert.equal(r.status, 200);
  const h = JSON.parse(r.body);
  assert.equal(h.databaseProvider.provider, 'd1');
  assert.equal(h.databaseProvider.runtimeReady, true);
  assert.equal(h.databaseProvider.d1.readAdapterReady, true);
  assert.equal(h.database.ok, true);
  assert.equal(h.mediaStorage.provider, 'r2');
  assert.equal(h.mediaStorage.configured, true);
  const check = object => { for (const [key, value] of Object.entries(object)) { if (/dual.?write/i.test(key)) assert.equal(value, false); else if (value && typeof value === 'object') check(value); } };
  check(h.databaseProvider);
  return { database: 'd1', runtimeReady: true, databaseOk: true, media: 'r2', mediaConfigured: true, dualWrite: false };
}
report.checks.health = { production: health(await productionGet('/api/health')), candidate: health(candidateGet('/api/health')) };
const home = candidateGet('/');
assert.equal(home.status, 200);
assert.equal((home.body.match(/<h1(?:\s|>)/g) ?? []).length, 1);
assert.ok(/\/article\/\d+/.test(home.body));
assert.ok(/InsightKoreaNewsHome/.test(home.body), 'New active home missing');
report.checks.home = { status: home.status, h1: 1, articleLinks: true, newHome: true };
for (const route of ['/terms', '/privacy', '/youth-policy', '/about', '/contact']) {
  const before = await productionGet(route);
  const after = candidateGet(route);
  assert.equal(after.status, before.status, route);
  const markers = body => [...body.matchAll(/data-[\w-]*legal[\w-]*="[^"]*"/g)].map(v => v[0]).sort();
  assert.deepEqual(markers(after.body), markers(before.body), `${route} legal regression`);
  report.checks[route] = { status: after.status, legalMarkers: markers(after.body), baselineUnchanged: true };
}
for (const route of ['/ads.txt', '/rss.xml', '/sitemap.xml', '/news-sitemap.xml', '/robots.txt']) {
  const r = candidateGet(route);
  assert.equal(r.status, 200, route);
  assert.ok(r.body.length > 20, route);
  report.checks[route] = { status: r.status, bytes: r.body.length };
  if (route === '/robots.txt') assert.equal(r.body, (await productionGet(route)).body, 'robots policy changed');
}
const articlePath = home.body.match(/\/article\/\d+/)[0];
const article = candidateGet(articlePath);
assert.equal(article.status, 200);
assert.ok(/NewsArticle/.test(article.body));
assert.ok(!/<meta\b[^>]*name=["'](?:robots|googlebot)["'][^>]*content=["'][^"']*noindex/i.test(article.body));
assert.ok(article.body.includes(`href="https://culturepeople.co.kr${articlePath}"`), 'Article production canonical');
report.checks.article = { path: articlePath, status: 200, newsArticle: true, noindex: false, canonical: true };
const output = path.join(process.env.HOME, '.local/state/culturepeople/application-release-20261117.json');
fs.mkdirSync(path.dirname(output), { recursive: true });
fs.writeFileSync(output, JSON.stringify({ ...report, ok: true }, null, 2), { mode: 0o600 });
console.log(JSON.stringify({ ok: true, report: output, candidate, sha, warnings: report.warnings }, null, 2));
