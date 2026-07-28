#!/usr/bin/env node
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

const root = process.cwd();
const vitest = path.join(root, "node_modules", "vitest", "vitest.mjs");
const args = process.argv.slice(2).filter((arg) => arg !== "--");

function newestPnpmPackage(prefix) {
  const store = path.join(root, "node_modules", ".pnpm");
  return fs.readdirSync(store)
    .filter((name) => name.startsWith(prefix))
    .sort((left, right) => right.localeCompare(left, undefined, { numeric: true }))[0];
}

function run(env = process.env) {
  const result = spawnSync(process.execPath, [vitest, ...args], {
    cwd: root,
    env,
    stdio: "inherit",
    windowsHide: true,
  });
  if (result.error) {
    console.error(result.error.message);
    return 1;
  }
  return result.status ?? 1;
}

if (process.platform !== "linux") process.exit(run());

const rollupPackage = newestPnpmPackage("@rollup+rollup-linux-x64-gnu@");
const rollupRuntime = newestPnpmPackage("rollup@");
const esbuildPackage = newestPnpmPackage("@esbuild+linux-x64@");
if (!rollupPackage || !rollupRuntime || !esbuildPackage) process.exit(run());

const rollupLink = path.join(root, "node_modules", ".pnpm", rollupRuntime, "node_modules", "@rollup", "rollup-linux-x64-gnu");
const rollupSource = fs.realpathSync(path.join(root, "node_modules", ".pnpm", rollupPackage, "node_modules", "@rollup", "rollup-linux-x64-gnu"));
const esbuildSource = path.join(root, "node_modules", ".pnpm", esbuildPackage, "node_modules", "@esbuild", "linux-x64", "bin", "esbuild");
const cacheRoot = path.join(os.tmpdir(), "culturepeople-native-tools", `${process.getuid?.() ?? "user"}`);
const rollupTarget = path.join(cacheRoot, rollupPackage);
const esbuildTarget = path.join(cacheRoot, `${esbuildPackage}-esbuild`);
const lockPath = path.join(cacheRoot, "vitest.lock");
fs.mkdirSync(cacheRoot, { recursive: true, mode: 0o700 });

let lock;
for (let attempt = 0; attempt < 100; attempt += 1) {
  try {
    lock = fs.openSync(lockPath, "wx", 0o600);
    fs.writeFileSync(lock, String(process.pid));
    break;
  } catch (error) {
    if (error?.code !== "EEXIST") throw error;
    try {
      const owner = Number(fs.readFileSync(lockPath, "utf8"));
      process.kill(owner, 0);
    } catch {
      fs.unlinkSync(lockPath);
      continue;
    }
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 100);
  }
}
if (lock === undefined) {
  console.error("Portable Vitest runner lock is busy.");
  process.exit(1);
}

const replacements = [];
let cleaned = false;

function prepareNativePackage(linkPath, packagePath, targetPath) {
  const sourcePath = fs.realpathSync(packagePath);
  if (!fs.existsSync(targetPath)) fs.cpSync(sourcePath, targetPath, { recursive: true });
  const packageRelativeTarget = path.relative(path.dirname(linkPath), packagePath);
  const currentTarget = fs.readlinkSync(linkPath);
  const originalTarget = currentTarget.startsWith(cacheRoot) ? packageRelativeTarget : currentTarget;
  fs.unlinkSync(linkPath);
  fs.symlinkSync(targetPath, linkPath, "dir");
  replacements.push({ linkPath, originalTarget });
}

function cleanup() {
  if (cleaned) return;
  cleaned = true;
  try {
    for (const replacement of replacements.reverse()) {
      if (!fs.existsSync(replacement.linkPath)) continue;
      fs.unlinkSync(replacement.linkPath);
      fs.symlinkSync(replacement.originalTarget, replacement.linkPath, "dir");
    }
  } finally {
    try {
      if (lock !== undefined) fs.closeSync(lock);
    } catch {
      // The descriptor may already be closed during process shutdown.
    }
    try {
      fs.unlinkSync(lockPath);
    } catch {
      // Another stale-lock recovery may already have removed it.
    }
  }
}

process.once("exit", cleanup);
for (const signal of ["SIGINT", "SIGTERM"]) {
  process.once(signal, () => {
    cleanup();
    process.exitCode = signal === "SIGINT" ? 130 : 143;
  });
}

try {
  let sharpLibvipsLibrary = "";
  if (!fs.existsSync(esbuildTarget)) {
    fs.copyFileSync(esbuildSource, esbuildTarget);
    fs.chmodSync(esbuildTarget, 0o700);
  }
  prepareNativePackage(rollupLink, rollupSource, rollupTarget);

  const sharpRuntime = newestPnpmPackage("sharp@");
  const sharpNative = newestPnpmPackage("@img+sharp-linux-x64@");
  const sharpLibvips = newestPnpmPackage("@img+sharp-libvips-linux-x64@");
  if (sharpRuntime && sharpNative && sharpLibvips) {
    const sharpImageRoot = path.join(root, "node_modules", ".pnpm", sharpRuntime, "node_modules", "@img");
    const sharpNativePath = path.join(root, "node_modules", ".pnpm", sharpNative, "node_modules", "@img", "sharp-linux-x64");
    const sharpLibvipsPath = path.join(root, "node_modules", ".pnpm", sharpLibvips, "node_modules", "@img", "sharp-libvips-linux-x64");
    prepareNativePackage(
      path.join(sharpImageRoot, "sharp-linux-x64"),
      sharpNativePath,
      path.join(cacheRoot, sharpNative),
    );
    prepareNativePackage(
      path.join(sharpImageRoot, "sharp-libvips-linux-x64"),
      sharpLibvipsPath,
      path.join(cacheRoot, sharpLibvips),
    );
    sharpLibvipsLibrary = path.join(cacheRoot, sharpLibvips, "lib");
  }
  process.exitCode = run({
    ...process.env,
    ESBUILD_BINARY_PATH: esbuildTarget,
    LD_LIBRARY_PATH: [sharpLibvipsLibrary, process.env.LD_LIBRARY_PATH].filter(Boolean).join(path.delimiter),
  });
} finally {
  cleanup();
}
