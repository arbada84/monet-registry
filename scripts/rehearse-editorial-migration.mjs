#!/usr/bin/env node
import path from "node:path";
import { spawnSync } from "node:child_process";
import { parseArgs } from "./lib/editorial-common.mjs";

const { values } = parseArgs();
const migration = path.resolve(values.migration || "cloudflare/d1/migrations/0006_editorial_pipeline.sql");
const helper = path.resolve("scripts/lib/rehearse-editorial-migration.py");
const candidates = process.platform === "win32"
  ? [["py", "-3"], ["python"], ["python3"]]
  : [["python3"], ["python"], ["py", "-3"]];

let lastError = "";
for (const [command, ...prefix] of candidates) {
  const result = spawnSync(command, [...prefix, helper, migration], {
    cwd: process.cwd(),
    encoding: "utf8",
    windowsHide: true,
  });
  if (result.status === 0) {
    process.stdout.write(result.stdout);
    process.exit(0);
  }
  if (result.error?.code === "ENOENT") continue;
  lastError = (result.stderr || result.stdout || result.error?.message || "").trim();
}

console.error(JSON.stringify({
  ok: false,
  error: lastError || "Python 3 runtime not found",
  migration,
}, null, 2));
process.exit(1);
