import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const REPO_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
);

const HOME_BACKUP_ROOT = path.join(os.homedir(), "culturepeople-backups");

export const DEFAULT_BACKUP_ROOT = process.env.CULTUREPEOPLE_BACKUP_ROOT
  ? path.resolve(expandHomePath(process.env.CULTUREPEOPLE_BACKUP_ROOT))
  : fs.existsSync(HOME_BACKUP_ROOT)
    ? HOME_BACKUP_ROOT
    : path.join(REPO_ROOT, "culturepeople-backups");

export function expandHomePath(value) {
  const text = String(value || "");
  if (text === "~") return os.homedir();
  if (text.startsWith("~/")) return path.join(os.homedir(), text.slice(2));
  return text;
}

export function backupSecondCopyConfigFile() {
  return process.env.CULTUREPEOPLE_BACKUP_SECOND_COPY_CONFIG ||
    path.join(os.homedir(), ".config", "culturepeople", "backup-second-copy-path");
}

export function readConfiguredBackupSecondCopyRoot() {
  const envValue = process.env.CULTUREPEOPLE_BACKUP_SECOND_COPY;
  if (envValue) return path.resolve(expandHomePath(envValue));

  try {
    const configured = fs.readFileSync(backupSecondCopyConfigFile(), "utf8").trim();
    return configured ? path.resolve(expandHomePath(configured)) : "";
  } catch {
    return "";
  }
}
