#!/usr/bin/env node
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

const root = process.cwd();
const cli = path.join(root, "node_modules", "tsx", "dist", "cli.mjs");
const env = { ...process.env };

if (process.platform === "linux") {
  const tsxRoot = fs.realpathSync(path.join(root, "node_modules", "tsx"));
  const esbuildRoot = fs.realpathSync(path.join(path.dirname(tsxRoot), "esbuild"));
  const source = fs.realpathSync(path.join(path.dirname(esbuildRoot), "@esbuild", "linux-x64", "bin", "esbuild"));
  const version = JSON.parse(fs.readFileSync(path.join(esbuildRoot, "package.json"), "utf8")).version;
  const targetDir = path.join(os.tmpdir(), "culturepeople-native-tools", `${process.getuid?.() ?? "user"}`);
  const target = path.join(targetDir, `tsx-esbuild-${version}`);
  fs.mkdirSync(targetDir, { recursive: true, mode: 0o700 });
  if (!fs.existsSync(target)) {
    fs.copyFileSync(source, target);
    fs.chmodSync(target, 0o700);
  }
  env.ESBUILD_BINARY_PATH = target;
}

const result = spawnSync(process.execPath, [cli, ...process.argv.slice(2)], {
  cwd: root,
  env,
  stdio: "inherit",
  windowsHide: true,
});
if (result.error) console.error(result.error.message);
process.exit(result.status ?? 1);
