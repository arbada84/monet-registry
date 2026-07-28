#!/usr/bin/env node
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

const root = process.cwd();
const cli = path.join(root, "node_modules", "next", "dist", "bin", "next");
const args = process.argv.slice(2);

function newestPnpmPackage(prefix) {
  return fs.readdirSync(path.join(root, "node_modules", ".pnpm"))
    .filter((name) => name.startsWith(prefix))
    .sort((left, right) => right.localeCompare(left, undefined, { numeric: true }))[0];
}

function run(env = process.env) {
  const result = spawnSync(process.execPath, [cli, ...args], {
    cwd: root,
    env,
    stdio: "inherit",
    windowsHide: true,
  });
  if (result.error) console.error(result.error.message);
  return result.status ?? 1;
}

if (process.platform !== "linux") process.exit(run());

const nextRuntime = newestPnpmPackage("next@");
const swcNative = newestPnpmPackage("@next+swc-linux-x64-gnu@");
if (!nextRuntime || !swcNative) process.exit(run());

const cacheRoot = path.join(os.tmpdir(), "culturepeople-native-tools", `${process.getuid?.() ?? "user"}`);
const lockPath = path.join(cacheRoot, "next.lock");
fs.mkdirSync(cacheRoot, { recursive: true, mode: 0o700 });

let lock;
try {
  lock = fs.openSync(lockPath, "wx", 0o600);
  fs.writeFileSync(lock, String(process.pid));
} catch (error) {
  if (error?.code === "EEXIST") {
    try {
      const owner = Number(fs.readFileSync(lockPath, "utf8"));
      process.kill(owner, 0);
    } catch {
      fs.unlinkSync(lockPath);
      lock = fs.openSync(lockPath, "wx", 0o600);
      fs.writeFileSync(lock, String(process.pid));
    }
  }
  if (lock === undefined) {
    console.error("Portable Next runner is already active.");
    process.exit(1);
  }
}

const replacements = [];
let cleaned = false;

function prepareNativePackage(linkPath, packagePath, targetPath) {
  const source = fs.realpathSync(packagePath);
  if (!fs.existsSync(targetPath)) fs.cpSync(source, targetPath, { recursive: true });
  const currentTarget = fs.readlinkSync(linkPath);
  const fallbackTarget = path.relative(path.dirname(linkPath), packagePath);
  const originalTarget = currentTarget.startsWith(cacheRoot) ? fallbackTarget : currentTarget;
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
      // The descriptor can already be closed during process shutdown.
    }
    try {
      fs.unlinkSync(lockPath);
    } catch {
      // A stale-lock recovery may already have removed it.
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
  const nextPackageRoot = path.join(root, "node_modules", ".pnpm", nextRuntime, "node_modules");
  const swcPath = path.join(root, "node_modules", ".pnpm", swcNative, "node_modules", "@next", "swc-linux-x64-gnu");
  prepareNativePackage(
    path.join(nextPackageRoot, "@next", "swc-linux-x64-gnu"),
    swcPath,
    path.join(cacheRoot, swcNative),
  );

  const lightningRuntime = newestPnpmPackage("lightningcss@");
  const lightningNative = newestPnpmPackage("lightningcss-linux-x64-gnu@");
  if (lightningRuntime && lightningNative) {
    const lightningNativePath = path.join(
      root,
      "node_modules",
      ".pnpm",
      lightningNative,
      "node_modules",
      "lightningcss-linux-x64-gnu",
    );
    prepareNativePackage(
      path.join(root, "node_modules", ".pnpm", lightningRuntime, "node_modules", "lightningcss-linux-x64-gnu"),
      lightningNativePath,
      path.join(cacheRoot, lightningNative),
    );
  }

  const oxideRuntime = newestPnpmPackage("@tailwindcss+oxide@");
  const oxideNative = newestPnpmPackage("@tailwindcss+oxide-linux-x64-gnu@");
  if (oxideRuntime && oxideNative) {
    const oxideNativePath = path.join(
      root,
      "node_modules",
      ".pnpm",
      oxideNative,
      "node_modules",
      "@tailwindcss",
      "oxide-linux-x64-gnu",
    );
    prepareNativePackage(
      path.join(root, "node_modules", ".pnpm", oxideRuntime, "node_modules", "@tailwindcss", "oxide-linux-x64-gnu"),
      oxideNativePath,
      path.join(cacheRoot, oxideNative),
    );
  }

  let sharpLibvipsLibrary = "";
  const sharpRuntime = newestPnpmPackage("sharp@");
  const sharpNative = newestPnpmPackage("@img+sharp-linux-x64@");
  const sharpLibvips = newestPnpmPackage("@img+sharp-libvips-linux-x64@");
  if (sharpRuntime && sharpNative && sharpLibvips) {
    const sharpImageRoot = path.join(root, "node_modules", ".pnpm", sharpRuntime, "node_modules", "@img");
    const sharpNativePath = path.join(root, "node_modules", ".pnpm", sharpNative, "node_modules", "@img", "sharp-linux-x64");
    const sharpLibvipsPath = path.join(root, "node_modules", ".pnpm", sharpLibvips, "node_modules", "@img", "sharp-libvips-linux-x64");
    prepareNativePackage(path.join(sharpImageRoot, "sharp-linux-x64"), sharpNativePath, path.join(cacheRoot, sharpNative));
    prepareNativePackage(path.join(sharpImageRoot, "sharp-libvips-linux-x64"), sharpLibvipsPath, path.join(cacheRoot, sharpLibvips));
    sharpLibvipsLibrary = path.join(cacheRoot, sharpLibvips, "lib");
  }

  process.exitCode = run({
    ...process.env,
    LD_LIBRARY_PATH: [sharpLibvipsLibrary, process.env.LD_LIBRARY_PATH].filter(Boolean).join(path.delimiter),
  });
} finally {
  cleanup();
}
