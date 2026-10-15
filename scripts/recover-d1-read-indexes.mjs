#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { spawnSync } from "node:child_process";

const apply = process.argv.includes("--apply");
const sql = path.resolve("cloudflare/d1/migrations/0008_public_read_indexes.sql");
const expected = process.argv.find((arg) => arg.startsWith("--checksum="))?.slice(11);
const notBefore = process.argv.find((arg) => arg.startsWith("--not-before="))?.slice(13);
const checksum = crypto.createHash("sha256").update(fs.readFileSync(sql)).digest("hex");
const report = { generatedAt: new Date().toISOString(), apply, checksum, stages: [], ok: false };
const args = ["scripts/apply-d1-sql.mjs", "--file", sql, "--database", "culturepeople-prod", "--http-api", "--confirm-production", "--report", ".deploy-logs/d1-index-recovery-apply.json"];

if (expected && expected !== checksum) throw new Error("Index migration checksum changed; scheduled apply stopped.");
if (apply && notBefore && new Date().toISOString() < notBefore) throw new Error("Index migration is scheduled after the UTC quota reset.");
if (apply) args.push("--apply");
const result = spawnSync(process.execPath, args, { stdio: "inherit" });
report.stages.push({ name: "index-migration", exitCode: result.status });
if (result.status === 0 && apply) {
  const verify = spawnSync(process.execPath, ["scripts/verify-portal-surface.mjs", "--base", "https://culturepeople.co.kr"], { stdio: "inherit" });
  report.stages.push({ name: "portal-verification", exitCode: verify.status });
}
report.ok = report.stages.every((stage) => stage.exitCode === 0);
fs.mkdirSync(".deploy-logs", { recursive: true });
fs.writeFileSync(".deploy-logs/d1-index-recovery.json", JSON.stringify(report, null, 2), { mode: 0o600 });
if (!report.ok) process.exitCode = 1;
