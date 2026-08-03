#!/usr/bin/env node

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { spawnSync } from "node:child_process";

const TOKEN_ENV = "CULTUREPEOPLE_VERCEL_TOKEN";
const TOKEN_FILE_ENV = "CULTUREPEOPLE_VERCEL_ENV_FILE";
const LOG_DIR = ".deploy-logs";
const RELEASE_DIR = ".release-manifests";

function parseArgs(argv) {
  const flags = new Set();
  const values = {};

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--") continue;
    if (!arg.startsWith("--")) continue;
    const [key, inlineValue] = arg.slice(2).split("=", 2);
    if (inlineValue !== undefined) {
      values[key] = inlineValue;
      continue;
    }
    const next = argv[i + 1];
    if (next && !next.startsWith("--")) {
      values[key] = next;
      i += 1;
    } else {
      flags.add(key);
    }
  }

  return { flags, values };
}

function readProjectLink() {
  try {
    return JSON.parse(fs.readFileSync(".vercel/project.json", "utf8"));
  } catch {
    return {};
  }
}

function parseEnvFile(file) {
  if (!file || !fs.existsSync(file)) return {};
  const values = {};
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const match = line.trim().match(/^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!match) continue;
    let value = match[2].trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    values[match[1]] = value;
  }
  return values;
}

function defaultTokenFile() {
  if (process.env[TOKEN_FILE_ENV]?.trim()) return path.resolve(process.env[TOKEN_FILE_ENV].trim());
  if (process.platform === "win32") {
    const appData = process.env.APPDATA || path.join(os.homedir(), "AppData", "Roaming");
    return path.join(appData, "CulturePeople", "vercel.env");
  }
  const configHome = process.env.XDG_CONFIG_HOME || path.join(os.homedir(), ".config");
  return path.join(configHome, "culturepeople", "vercel.env");
}

function resolveToken() {
  const environmentToken = String(process.env[TOKEN_ENV] || "").trim();
  if (environmentToken) return { token: environmentToken, source: "process environment", file: "" };

  const file = defaultTokenFile();
  const token = String(parseEnvFile(file)[TOKEN_ENV] || "").trim();
  return token ? { token, source: "project secure env file", file } : { token: "", source: "missing", file };
}

function warnIfTokenFileIsBroadlyReadable(file) {
  if (!file || process.platform === "win32") return;
  const mode = fs.statSync(file).mode & 0o777;
  if ((mode & 0o077) !== 0) {
    console.warn(`[deploy:culturepeople] WARNING: secure env file permissions are ${mode.toString(8)}; use chmod 600.`);
  }
}

function commandName(name) {
  return process.platform === "win32" ? `${name}.cmd` : name;
}

function timestampForFile() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

function sanitizeOutput(value, token) {
  return String(value || "").split(token).join("[redacted]");
}

function appendLog(logFile, text) {
  fs.mkdirSync(path.dirname(logFile), { recursive: true });
  fs.appendFileSync(logFile, text, "utf8");
}

function sha256File(file) {
  return crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
}

function gitOutput(args) {
  const result = spawnSync("git", args, { encoding: "utf8" });
  return result.status === 0 ? String(result.stdout || "").trim() : "";
}

function assertCleanWorktree() {
  const status = gitOutput(["status", "--porcelain=v1", "--untracked-files=all"]);
  if (status) throw new Error(`Release worktree is dirty (${status.split(/\r?\n/).filter(Boolean).length} changed path(s)).`);
  const head = gitOutput(["rev-parse", "HEAD"]);
  if (!head) throw new Error("Could not resolve release HEAD.");
  return head;
}

function readReleaseManifest(file, head) {
  if (!file) throw new Error("--release-manifest <file> is required for production deployment.");
  const resolved = path.resolve(file);
  let manifest;
  try { manifest = JSON.parse(fs.readFileSync(resolved, "utf8")); }
  catch { throw new Error(`Release manifest is missing or invalid: ${resolved}`); }
  if (manifest.ok !== true || manifest.gate?.ok !== true || manifest.gate?.releaseCandidate !== true) {
    throw new Error("Release manifest does not contain a passed release gate.");
  }
  if (manifest.release?.dirty !== false || manifest.release?.headSha !== head || manifest.gate?.headSha !== head) {
    throw new Error("Release manifest SHA/clean state does not match the current worktree.");
  }
  const previewBase = String(manifest.gate?.base || "");
  if (!/^https:\/\/[^/]+\.vercel\.app\/?$/i.test(previewBase) || /culturepeople\.co\.kr/i.test(previewBase)) {
    throw new Error("Release gate must have passed against an immutable *.vercel.app preview URL.");
  }
  return { manifest, resolved, sha256: sha256File(resolved) };
}

function writeReceipt(data) {
  fs.mkdirSync(RELEASE_DIR, { recursive: true });
  const file = path.join(RELEASE_DIR, `deployment-receipt-${timestampForFile()}.json`);
  fs.writeFileSync(file, `${JSON.stringify({ ...data, secretValuesIncluded: false }, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
  return file;
}

function run(label, command, args, env, logFile, token) {
  console.log(`\n[deploy:culturepeople] ${label}`);
  appendLog(logFile, `\n\n[${new Date().toISOString()}] ${label}\n`);
  const result = spawnSync(command, args, {
    stdio: ["ignore", "pipe", "pipe"],
    env,
    encoding: "utf8",
    maxBuffer: 1024 * 1024 * 50,
  });
  const stdout = sanitizeOutput(result.stdout, token);
  const stderr = sanitizeOutput(result.stderr, token);
  if (stdout) process.stdout.write(stdout);
  if (stderr) process.stderr.write(stderr);
  appendLog(logFile, stdout);
  appendLog(logFile, stderr);
  if (result.error) {
    console.error(`[deploy:culturepeople] ${label} failed: ${result.error.message}`);
    console.error(`[deploy:culturepeople] log: ${logFile}`);
    process.exit(1);
  }
  if (result.status !== 0) {
    console.error(`[deploy:culturepeople] ${label} exited with code ${result.status}.`);
    console.error(`[deploy:culturepeople] log: ${logFile}`);
    process.exit(result.status || 1);
  }
  return `${stdout}\n${stderr}`;
}

function main() {
  const { flags, values } = parseArgs(process.argv.slice(2));
  const tokenResult = resolveToken();
  const token = tokenResult.token;
  if (!token) {
    console.error(`[deploy:culturepeople] Missing ${TOKEN_ENV}.`);
    console.error(`[deploy:culturepeople] Checked process environment and: ${tokenResult.file}`);
    process.exit(1);
  }
  if (tokenResult.file) warnIfTokenFileIsBroadlyReadable(tokenResult.file);
  console.log(`[deploy:culturepeople] Token source: ${tokenResult.source}`);
  if (flags.has("check-token")) {
    console.log(`[deploy:culturepeople] Token state: set`);
    return;
  }

  let head;
  try { head = assertCleanWorktree(); }
  catch (error) {
    console.error(`[deploy:culturepeople] BLOCKED: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }

  const previewMode = flags.has("preview");
  const remoteBuild = flags.has("remote-build");
  let release = null;
  if (!previewMode) {
    try { release = readReleaseManifest(values["release-manifest"], head); }
    catch (error) {
      console.error(`[deploy:culturepeople] BLOCKED: ${error instanceof Error ? error.message : String(error)}`);
      process.exit(1);
    }
  }

  const project = readProjectLink();
  const logFile = path.join(LOG_DIR, `culturepeople-vercel-${timestampForFile()}.log`);
  const env = {
    ...process.env,
    VERCEL_TOKEN: token,
    VERCEL_ORG_ID: process.env.VERCEL_ORG_ID || project.orgId || "team_r6EedfOTYhrZjdhxlDEFeSBF",
    VERCEL_PROJECT_ID: process.env.VERCEL_PROJECT_ID || project.projectId || "prj_fN7aCu9wkSUs6FsxLbrFIiEpCawY",
  };
  const npx = commandName("npx");
  console.log(`[deploy:culturepeople] Project: ${project.projectName || "monet-registry-main"}`);
  console.log(`[deploy:culturepeople] Log file: ${logFile}`);
  appendLog(logFile, `[${new Date().toISOString()}] CulturePeople ${previewMode ? "preview" : "production"} deploy started.\n`);

  if (!flags.has("no-pull")) {
    run(`Pull ${previewMode ? "preview" : "production"} environment`, npx, ["--yes", "vercel@latest", "pull", "--yes", `--environment=${previewMode ? "preview" : "production"}`], env, logFile, token);
  }
  if (!flags.has("no-build") && !remoteBuild) {
    run(`Build ${previewMode ? "preview" : "production"} bundle`, npx, ["--yes", "vercel@latest", "build", ...(previewMode ? [] : ["--prod"])], env, logFile, token);
  }
  const deployOutput = run(
    `Deploy ${remoteBuild ? "source with remote build" : "prebuilt bundle"} to ${previewMode ? "immutable preview" : "production"}`,
    npx,
    ["--yes", "vercel@latest", "deploy", ...(remoteBuild ? [] : ["--prebuilt"]), ...(previewMode ? [] : ["--prod"])],
    env,
    logFile,
    token,
  );
  const deploymentUrls = [...deployOutput.matchAll(/https:\/\/[^\s"'<>]+\.vercel\.app\/?/gi)].map((match) => match[0].replace(/[),.;]+$/, ""));
  const deploymentUrl = deploymentUrls.at(-1) || "";

  if (flags.has("verify") || previewMode) {
    const baseUrl = values.base || (previewMode ? deploymentUrl : "https://culturepeople.co.kr");
    if (!baseUrl) {
      console.error("[deploy:culturepeople] Deployment URL could not be parsed for verification.");
      process.exit(1);
    }
    run("Verify production portal surface", commandName("pnpm"), ["verify:portal", "--", "--base", baseUrl], env, logFile, token);
    run("Verify Alidot public pages", commandName("pnpm"), ["verify:alidot-pages", "--", "--base", baseUrl, "--site-type", "all"], env, logFile, token);
    run("Verify article NOINDEX policy", commandName("pnpm"), ["seo:audit:noindex", "--", "--base", baseUrl, "--urls-file", "tmp/noindex-urls.txt"], env, logFile, token);
    run("Verify public browser smoke", commandName("pnpm"), ["smoke:browser", "--", `--base-url=${baseUrl}`, "--public-site-only", "--no-auto-start", "--no-admin-auth", "--json"], env, logFile, token);
    console.log(`\n[deploy:culturepeople] DONE: ${previewMode ? "preview" : "production"} deploy completed and verification passed.`);
  } else {
    console.log("\n[deploy:culturepeople] DONE: production deploy command completed.");
    console.log("[deploy:culturepeople] Verification was skipped. Run: pnpm verify:portal -- --base https://culturepeople.co.kr");
  }
  const receipt = writeReceipt({
    generatedAt: new Date().toISOString(),
    mode: previewMode ? "preview" : "production",
    headSha: head,
    deploymentUrl: deploymentUrl || null,
    productionAlias: previewMode ? null : "https://culturepeople.co.kr",
    releaseId: release?.manifest?.releaseId || null,
    releaseManifest: release?.resolved || null,
    releaseManifestSha256: release?.sha256 || null,
    logFile,
  });
  if (deploymentUrl) console.log(`[deploy:culturepeople] Deployment URL: ${deploymentUrl}`);
  console.log(`[deploy:culturepeople] Receipt: ${receipt}`);
  console.log(`[deploy:culturepeople] Log file: ${logFile}`);
  appendLog(logFile, `\n[${new Date().toISOString()}] CulturePeople ${previewMode ? "preview" : "production"} deploy finished.\n`);
}

main();
