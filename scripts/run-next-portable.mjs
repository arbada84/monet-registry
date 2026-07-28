#!/usr/bin/env node
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

const root = process.cwd();
const cli = path.join(root, "node_modules", "next", "dist", "bin", "next");
const args = process.argv.slice(2);

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

const nextRoot = directPackageRoot("next");
const nextNodeModules = nextRoot ? path.dirname(nextRoot) : "";
const swcLink = nextNodeModules ? path.join(nextNodeModules, "@next", "swc-linux-x64-gnu") : "";
if (!nextRoot || !swcLink || !fs.existsSync(swcLink)) process.exit(run());

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
  const swcPath = fs.realpathSync(swcLink);
  const swcTag = packageTag(swcPath, "next-swc-linux-x64-gnu");
  prepareNativePackage(
    swcLink,
    swcPath,
    path.join(cacheRoot, swcTag),
  );

  const tailwindPostcssRoot = directPackageRoot("@tailwindcss/postcss");
  const tailwindPostcssNodeModules = tailwindPostcssRoot
    ? path.dirname(path.dirname(tailwindPostcssRoot))
    : "";
  const tailwindNodeLink = tailwindPostcssNodeModules
    ? path.join(tailwindPostcssNodeModules, "@tailwindcss", "node")
    : "";
  const tailwindNodeRoot = tailwindNodeLink && fs.existsSync(tailwindNodeLink)
    ? fs.realpathSync(tailwindNodeLink)
    : "";
  const tailwindNodeModules = tailwindNodeRoot
    ? path.dirname(path.dirname(tailwindNodeRoot))
    : "";
  const lightningRootLink = tailwindNodeModules
    ? path.join(tailwindNodeModules, "lightningcss")
    : "";
  const lightningRoot = lightningRootLink && fs.existsSync(lightningRootLink)
    ? fs.realpathSync(lightningRootLink)
    : "";
  const lightningLink = lightningRoot
    ? path.join(path.dirname(lightningRoot), "lightningcss-linux-x64-gnu")
    : "";
  if (lightningLink && fs.existsSync(lightningLink)) {
    const lightningNativePath = fs.realpathSync(lightningLink);
    prepareNativePackage(
      lightningLink,
      lightningNativePath,
      path.join(cacheRoot, packageTag(lightningNativePath, "lightningcss-linux-x64-gnu")),
    );
  }

  const oxideRootLink = tailwindPostcssNodeModules
    ? path.join(tailwindPostcssNodeModules, "@tailwindcss", "oxide")
    : "";
  const oxideRoot = oxideRootLink && fs.existsSync(oxideRootLink)
    ? fs.realpathSync(oxideRootLink)
    : "";
  const oxideNodeModules = oxideRoot
    ? path.dirname(path.dirname(oxideRoot))
    : "";
  const oxideLink = oxideNodeModules
    ? path.join(oxideNodeModules, "@tailwindcss", "oxide-linux-x64-gnu")
    : "";
  if (oxideLink && fs.existsSync(oxideLink)) {
    const oxideNativePath = fs.realpathSync(oxideLink);
    prepareNativePackage(
      oxideLink,
      oxideNativePath,
      path.join(cacheRoot, packageTag(oxideNativePath, "tailwind-oxide-linux-x64-gnu")),
    );
  }

  let sharpLibvipsLibrary = "";
  const sharpRoot = directPackageRoot("sharp");
  const sharpImageRoot = sharpRoot ? path.join(path.dirname(sharpRoot), "@img") : "";
  const sharpNativeLink = sharpImageRoot ? path.join(sharpImageRoot, "sharp-linux-x64") : "";
  const sharpLibvipsLink = sharpImageRoot ? path.join(sharpImageRoot, "sharp-libvips-linux-x64") : "";
  if (sharpNativeLink && sharpLibvipsLink && fs.existsSync(sharpNativeLink) && fs.existsSync(sharpLibvipsLink)) {
    const sharpNativePath = fs.realpathSync(sharpNativeLink);
    const sharpLibvipsPath = fs.realpathSync(sharpLibvipsLink);
    const sharpNativeTag = packageTag(sharpNativePath, "sharp-linux-x64");
    const sharpLibvipsTag = packageTag(sharpLibvipsPath, "sharp-libvips-linux-x64");
    prepareNativePackage(sharpNativeLink, sharpNativePath, path.join(cacheRoot, sharpNativeTag));
    prepareNativePackage(sharpLibvipsLink, sharpLibvipsPath, path.join(cacheRoot, sharpLibvipsTag));
    sharpLibvipsLibrary = path.join(cacheRoot, sharpLibvipsTag, "lib");
  }

  process.exitCode = run({
    ...process.env,
    LD_LIBRARY_PATH: [sharpLibvipsLibrary, process.env.LD_LIBRARY_PATH].filter(Boolean).join(path.delimiter),
  });
} finally {
  cleanup();
}
