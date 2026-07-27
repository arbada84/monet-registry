import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

export function parseArgs(argv) {
  const flags = new Set();
  const values = {};
  const positionals = [];
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--") continue;
    if (!arg.startsWith("--")) {
      positionals.push(arg);
      continue;
    }
    const [key, inlineValue] = arg.slice(2).split("=", 2);
    if (inlineValue !== undefined) values[key] = inlineValue;
    else if (argv[index + 1] && !argv[index + 1].startsWith("--")) values[key] = argv[++index];
    else flags.add(key);
  }
  return { flags, values, positionals };
}

export function expandHomePath(value) {
  const text = String(value || "");
  if (text === "~") return os.homedir();
  if (text.startsWith("~/")) return path.join(os.homedir(), text.slice(2));
  return text;
}

export function timestampForFile(date = new Date()) {
  return date.toISOString().replace(/[:.]/g, "-");
}

export function latestBackupDir(root) {
  if (!fs.existsSync(root)) return "";
  return fs.readdirSync(root)
    .filter((name) => /^\d{4}-\d{2}-\d{2}T/.test(name))
    .map((name) => path.join(root, name))
    .filter((dir) => fs.statSync(dir).isDirectory() && fs.existsSync(path.join(dir, "backup-manifest.json")))
    .sort()
    .at(-1) || "";
}

export function readJson(filePath, fallback = null) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8").replace(/^\uFEFF/, ""));
  } catch {
    return fallback;
  }
}

export function writeJsonAtomic(filePath, value, mode = 0o600) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const temporary = `${filePath}.tmp-${process.pid}-${Date.now()}`;
  fs.writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, { encoding: "utf8", mode });
  fs.renameSync(temporary, filePath);
  if (process.platform !== "win32") {
    try { fs.chmodSync(filePath, mode); } catch { /* Filesystem may not implement POSIX modes. */ }
  }
}

export function isInside(parent, child) {
  const relative = path.relative(path.resolve(parent), path.resolve(child));
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

export function walkFiles(root) {
  if (!fs.existsSync(root)) return [];
  const files = [];
  const stack = [path.resolve(root)];
  while (stack.length) {
    const current = stack.pop();
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const filePath = path.join(current, entry.name);
      if (entry.isDirectory()) stack.push(filePath);
      else if (entry.isFile()) files.push(filePath);
    }
  }
  return files;
}

export function directorySize(root) {
  return walkFiles(root).reduce((sum, filePath) => sum + fs.statSync(filePath).size, 0);
}

export function fileMode(filePath) {
  try {
    return (fs.statSync(filePath).mode & 0o777).toString(8).padStart(3, "0");
  } catch {
    return null;
  }
}

export function commandAvailable(command, args = ["--version"]) {
  const result = spawnSync(command, args, { stdio: "ignore" });
  return !result.error && result.status === 0;
}

export function diskStats(targetPath) {
  if (typeof fs.statfsSync !== "function") return { supported: false, path: path.resolve(targetPath) };
  let current = path.resolve(targetPath);
  while (!fs.existsSync(current)) {
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }
  const stats = fs.statfsSync(current);
  const blockSize = Number(stats.bsize || 0);
  const totalBytes = Number(stats.blocks || 0) * blockSize;
  const availableBytes = Number(stats.bavail || 0) * blockSize;
  const freeBytes = Number(stats.bfree || 0) * blockSize;
  const usedBytes = Math.max(0, totalBytes - freeBytes);
  return {
    supported: true,
    path: current,
    totalBytes,
    availableBytes,
    usedBytes,
    usedPercent: totalBytes > 0 ? Math.round((usedBytes / totalBytes) * 1000) / 10 : null,
  };
}

export function formatBytes(value) {
  const bytes = Number(value || 0);
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let size = bytes;
  let unit = 0;
  while (size >= 1024 && unit < units.length - 1) {
    size /= 1024;
    unit += 1;
  }
  return `${size.toFixed(size >= 100 || unit === 0 ? 0 : size >= 10 ? 1 : 2)} ${units[unit]}`;
}

export function sha256Text(value) {
  return crypto.createHash("sha256").update(String(value)).digest("hex");
}

export function sha256File(filePath) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash("sha256");
    const stream = fs.createReadStream(filePath);
    stream.on("error", reject);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("end", () => resolve(hash.digest("hex")));
  });
}

export function inspectSecretFile(filePath) {
  const resolved = path.resolve(expandHomePath(filePath || ""));
  const exists = Boolean(filePath) && fs.existsSync(resolved) && fs.statSync(resolved).isFile();
  const mode = exists ? fileMode(resolved) : null;
  const broad = process.platform !== "win32" && Boolean(mode) && (Number.parseInt(mode, 8) & 0o077) !== 0;
  return {
    configured: Boolean(filePath),
    exists,
    nonEmpty: exists ? fs.statSync(resolved).size > 0 : false,
    mode,
    broadlyReadable: broad,
    resolved,
  };
}

export function safeError(error) {
  return error instanceof Error ? error.message : String(error);
}
