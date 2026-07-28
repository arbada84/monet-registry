#!/usr/bin/env node
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

const root = process.cwd();
const vitest = path.join(root, "node_modules", "vitest", "vitest.mjs");
const args = process.argv.slice(2).filter((arg) => arg !== "--");

function directPackageRoot(name) {
  try {
    return fs.realpathSync(path.join(root, "node_modules", ...name.split("/")));
  } catch {
    return "";
  }
}

function packageTag(packageRoot, fallback) {
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(packageRoot, "package.json"), "utf8"));
    return `${fallback}-${pkg.version}`;
  } catch {
    return fallback;
  }
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

const viteRoot = directPackageRoot("vite");
const viteNodeModules = viteRoot ? path.dirname(viteRoot) : "";
const rollupRoot = viteNodeModules && fs.existsSync(path.join(viteNodeModules, "rollup"))
  ? fs.realpathSync(path.join(viteNodeModules, "rollup"))
  : "";
const rollupLink = rollupRoot ? path.join(path.dirname(rollupRoot), "@rollup", "rollup-linux-x64-gnu") : "";
const esbuildRoot = viteNodeModules && fs.existsSync(path.join(viteNodeModules, "esbuild"))
  ? fs.realpathSync(path.join(viteNodeModules, "esbuild"))
  : "";
const esbuildNativeLink = esbuildRoot ? path.join(path.dirname(esbuildRoot), "@esbuild", "linux-x64") : "";
if (!rollupLink || !esbuildNativeLink || !fs.existsSync(rollupLink) || !fs.existsSync(esbuildNativeLink)) process.exit(run());

const rollupSource = fs.realpathSync(rollupLink);
const esbuildNative = fs.realpathSync(esbuildNativeLink);
const esbuildSource = path.join(esbuildNative, "bin", "esbuild");
const cacheRoot = path.join(os.tmpdir(), "culturepeople-native-tools", `${process.getuid?.() ?? "user"}`);
const rollupTarget = path.join(cacheRoot, packageTag(rollupSource, "rollup-linux-x64-gnu"));
const esbuildTarget = path.join(cacheRoot, `${packageTag(esbuildNative, "esbuild-linux-x64")}-bin`);
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

  const sharpRoot = directPackageRoot("sharp");
  const sharpImageRoot = sharpRoot ? path.join(path.dirname(sharpRoot), "@img") : "";
  const sharpNativeLink = sharpImageRoot ? path.join(sharpImageRoot, "sharp-linux-x64") : "";
  const sharpLibvipsLink = sharpImageRoot ? path.join(sharpImageRoot, "sharp-libvips-linux-x64") : "";
  if (sharpNativeLink && sharpLibvipsLink && fs.existsSync(sharpNativeLink) && fs.existsSync(sharpLibvipsLink)) {
    const sharpNativePath = fs.realpathSync(sharpNativeLink);
    const sharpLibvipsPath = fs.realpathSync(sharpLibvipsLink);
    const sharpNativeTag = packageTag(sharpNativePath, "sharp-linux-x64");
    const sharpLibvipsTag = packageTag(sharpLibvipsPath, "sharp-libvips-linux-x64");
    prepareNativePackage(
      sharpNativeLink,
      sharpNativePath,
      path.join(cacheRoot, sharpNativeTag),
    );
    prepareNativePackage(
      sharpLibvipsLink,
      sharpLibvipsPath,
      path.join(cacheRoot, sharpLibvipsTag),
    );
    sharpLibvipsLibrary = path.join(cacheRoot, sharpLibvipsTag, "lib");
  }
  process.exitCode = run({
    ...process.env,
    ESBUILD_BINARY_PATH: esbuildTarget,
    LD_LIBRARY_PATH: [sharpLibvipsLibrary, process.env.LD_LIBRARY_PATH].filter(Boolean).join(path.delimiter),
  });
} finally {
  cleanup();
}
