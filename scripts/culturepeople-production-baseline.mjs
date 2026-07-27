#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import { DEFAULT_BACKUP_ROOT, readConfiguredBackupSecondCopyRoot } from "./lib/backup-root.mjs";
import { expandHomePath, latestBackupDir, parseArgs, readJson, timestampForFile, writeJsonAtomic } from "./lib/culturepeople-ops-utils.mjs";
import { buildGithubActionsHealth } from "./github-actions-health.mjs";
import { buildStaleRecoveryReport } from "./auto-press-stale-recovery.mjs";
import { buildR2MediaReadinessReport } from "./r2-media-readiness-report.mjs";

const DISK_UUID = "96B82074B8205551";

function findMountByUuid(uuid) {
  const devices = spawnSync("lsblk", ["-J", "-p", "-o", "NAME,UUID,MOUNTPOINTS"], { encoding: "utf8" });
  if (devices.status !== 0) return { ok: false, device: null, mountRoot: null, error: "lsblk UUID lookup failed" };
  let parsed;
  try { parsed = JSON.parse(String(devices.stdout || "{}")); }
  catch { return { ok: false, device: null, mountRoot: null, error: "lsblk output was not valid JSON" }; }
  const stack = [...(parsed.blockdevices || [])];
  while (stack.length) {
    const row = stack.shift();
    if (row?.children) stack.push(...row.children);
    if (String(row?.uuid || "") !== uuid) continue;
    const directMount = (Array.isArray(row.mountpoints) ? row.mountpoints : []).find(Boolean) || null;
    if (directMount) return { ok: true, device: row.name || null, mountRoot: directMount, error: null };
    const mounted = row.name ? spawnSync("findmnt", ["-rn", "-S", row.name, "-o", "TARGET"], { encoding: "utf8" }) : null;
    const mountRoot = mounted?.status === 0 ? String(mounted.stdout || "").trim().split(/\r?\n/)[0] : "";
    return { ok: Boolean(mountRoot), device: row.name || null, mountRoot: mountRoot || null, error: mountRoot ? null : "UUID device is not mounted" };
  }
  return { ok: false, device: null, mountRoot: null, error: "UUID device was not found" };
}

function command(commandName, args = [], { json = false } = {}) {
  const startedAt = new Date();
  const result = spawnSync(commandName, args, { encoding: "utf8", maxBuffer: 128 * 1024 * 1024 });
  let data = null;
  if (json) {
    try { data = JSON.parse(String(result.stdout || "{}")); } catch { /* Preserve a parse failure without raw output. */ }
  }
  return {
    ok: result.status === 0,
    status: result.status,
    startedAt: startedAt.toISOString(),
    completedAt: new Date().toISOString(),
    data,
    error: result.status === 0 ? null : String(result.stderr || result.error?.message || "command failed").trim().slice(0, 500),
  };
}

function git(args) {
  const result = command("git", args);
  if (!result.ok) return "";
  const direct = spawnSync("git", args, { encoding: "utf8" });
  return direct.status === 0 ? String(direct.stdout || "").trim() : "";
}

function repositorySlug() {
  const remote = git(["remote", "get-url", "origin"]);
  const match = remote.match(/github\.com[/:]([^/]+)\/([^/.]+)(?:\.git)?$/i);
  return match ? `${match[1]}/${match[2]}` : "";
}

function tableRows(root, table) {
  const backupDir = latestBackupDir(root);
  return { backupDir, rows: backupDir ? readJson(path.join(backupDir, "raw", "d1", "tables", `${table}.json`), []) || [] : [] };
}

async function probeAlias(baseUrl) {
  try {
    const response = await fetch(baseUrl, { method: "HEAD", redirect: "follow", signal: AbortSignal.timeout(10_000), headers: { "user-agent": "CulturePeopleBaseline/1.0" } });
    return { ok: response.ok, status: response.status, finalUrl: response.url, vercelIdPresent: Boolean(response.headers.get("x-vercel-id")) };
  } catch (error) {
    return { ok: false, status: 0, error: error instanceof Error ? error.message : String(error) };
  }
}

async function main() {
  const { flags, values } = parseArgs(process.argv.slice(2));
  const root = path.resolve(expandHomePath(values.root || DEFAULT_BACKUP_ROOT));
  const secondCopy = values["second-copy"] ? path.resolve(expandHomePath(values["second-copy"])) : readConfiguredBackupSecondCopyRoot();
  const base = String(values.base || "https://culturepeople.co.kr").replace(/\/+$/, "");
  const generatedAt = new Date().toISOString();
  const mount = findMountByUuid(DISK_UUID);
  const mountRoot = mount.mountRoot || "";
  const status = command(process.execPath, [path.resolve("scripts/local-culturepeople-backup-status.mjs"), "--root", root, ...(secondCopy ? ["--second-copy", secondCopy] : []), "--json"], { json: true });
  const restore = command(process.execPath, [path.resolve("scripts/restore-local-backup-copies.mjs"), "--root", root, ...(secondCopy ? ["--second-copy", secondCopy] : []), "--json"], { json: true });
  const supabase = flags.has("offline") ? null : command(process.execPath, [path.resolve("scripts/supabase-recovery-check.mjs"), "--require-storage"], { json: true });
  const itemTable = tableRows(root, "auto_press_items");
  const articleTable = tableRows(root, "articles");
  const stale = buildStaleRecoveryReport({ items: itemTable.rows, articles: articleTable.rows, backupDir: itemTable.backupDir });
  const reportDir = path.resolve(values["out-dir"] || ".ops-audit-runs");
  const r2Path = path.join(reportDir, `baseline-r2-${timestampForFile()}.json`);
  const r2 = buildR2MediaReadinessReport({ root, reportPath: r2Path });
  const headSha = git(["rev-parse", "HEAD"]);
  const dirtyCount = git(["status", "--porcelain=v1", "--untracked-files=all"]).split(/\r?\n/).filter(Boolean).length;
  const slug = repositorySlug();
  let github = null;
  let githubMainSha = null;
  if (!flags.has("offline") && slug) {
    const runsResult = command("gh", ["run", "list", "--workflow", "ci.yml", "--limit", "40", "--json", "databaseId,headSha,status,conclusion,createdAt,updatedAt,url"], { json: true });
    github = runsResult.data ? buildGithubActionsHealth({ runs: runsResult.data, headSha }) : { ok: false, errors: [runsResult.error || "GitHub run query failed"] };
    const mainResult = spawnSync("gh", ["api", `repos/${slug}/commits/main`, "--jq", ".sha"], { encoding: "utf8" });
    githubMainSha = mainResult.status === 0 ? String(mainResult.stdout || "").trim() : null;
  }
  const report = {
    formatVersion: 1,
    ok: Boolean(mount.ok && status.data?.ok && restore.data?.ok),
    generatedAt,
    sources: {
      mount: { command: `lsblk UUID lookup then findmnt by device`, capturedAt: generatedAt },
      git: { command: "git status/rev-parse", capturedAt: generatedAt },
      backup: { command: "backup:local:status and restore-check-all", capturedAt: status.completedAt },
      supabase: { command: "supabase:recovery-check --require-storage", capturedAt: supabase?.completedAt || null },
      r2: { command: "cloudflare:r2:media-readiness", capturedAt: r2.generatedAt },
      autoPress: { source: itemTable.backupDir, capturedAt: generatedAt },
      github: { command: "gh run list / gh api", capturedAt: generatedAt },
      liveAlias: { method: "single HEAD", capturedAt: generatedAt },
    },
    mount: { uuid: DISK_UUID, device: mount.device, mounted: Boolean(mountRoot), mountRoot: mountRoot || null, repository: process.cwd(), error: mount.error },
    git: { headSha: headSha || null, githubMainSha, dirtyCount, repository: slug || null },
    deployment: { deployId: values["deploy-id"] || null, alias: base, live: flags.has("offline") ? null : await probeAlias(base) },
    backup: status.data,
    restore: restore.data,
    supabase: supabase?.data || null,
    r2,
    autoPressStale: { reportId: stale.reportId, counts: stale.counts, sourceBackup: stale.backupDir },
    github,
    controls: {
      autoNewsMustRemainDisabled: true,
      newsletterMustRemainDisabled: true,
      autoPressOnly: true,
      productionRewriteAllowed: r2.rewrite?.productionRewriteAllowed === true,
    },
    secretValuesIncluded: false,
  };
  const output = path.resolve(values.report || path.join(reportDir, `production-baseline-${timestampForFile()}.json`));
  report.reportPath = output;
  writeJsonAtomic(output, report);
  if (flags.has("json")) console.log(JSON.stringify(report, null, 2));
  else {
    console.log("CulturePeople production baseline");
    console.log(`- mount/repo: ${report.mount.mounted}/${report.mount.repository}`);
    console.log(`- HEAD/dirty: ${report.git.headSha}/${report.git.dirtyCount}`);
    console.log(`- backup/restore: ${Boolean(report.backup?.ok)}/${Boolean(report.restore?.ok)}`);
    console.log(`- disk: ${report.backup?.disk?.usedPercent ?? "unknown"}% (${report.backup?.health?.disk?.status || "unknown"})`);
    console.log(`- Supabase: ${report.supabase?.classification?.phase || "not checked"}`);
    console.log(`- auto-press stale: ${report.autoPressStale.counts.total}`);
    console.log(`- report: ${output}`);
  }
  if (!report.ok) process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(`[ops:production-baseline] ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  });
}
