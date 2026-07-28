import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

export function parseArgs(argv = process.argv.slice(2)) {
  const flags = new Set();
  const values = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg.startsWith("--")) continue;
    const separator = arg.indexOf("=");
    if (separator > 2) {
      values[arg.slice(2, separator)] = arg.slice(separator + 1);
      continue;
    }
    const key = arg.slice(2);
    const next = argv[index + 1];
    if (next && !next.startsWith("--")) {
      values[key] = next;
      index += 1;
    } else {
      flags.add(key);
    }
  }
  return { flags, values };
}

export function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

export function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

export function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8").replace(/^\uFEFF/, ""));
}

export function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

export function writeText(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, value.endsWith("\n") ? value : `${value}\n`, "utf8");
}

export function timestampForFile(date = new Date()) {
  return date.toISOString().replace(/[:.]/g, "-");
}

export function resolveExistingRoot(explicit, envName, siblingName) {
  const candidates = [
    explicit,
    process.env[envName],
    path.resolve(process.cwd(), "..", siblingName),
  ].filter(Boolean).map((item) => path.resolve(item));
  const found = candidates.find((item) => fs.existsSync(item));
  if (!found) {
    throw new Error(`${envName} 경로를 찾지 못했습니다. --root 또는 ${envName}을 지정하세요.`);
  }
  return found;
}

export function redactPath(value, roots = []) {
  let result = String(value || "");
  for (const root of roots.filter(Boolean)) {
    result = result.split(path.resolve(root)).join(`<${path.basename(root)}>`);
  }
  result = result.replace(/\/home\/[^/]+/g, "~").replace(/[A-Za-z]:\\Users\\[^\\]+/g, "~");
  return result;
}

export function normalizeUrl(value) {
  try {
    const url = new URL(String(value || ""));
    url.hash = "";
    for (const key of [...url.searchParams.keys()]) {
      if (/^utm_/i.test(key) || ["fbclid", "gclid", "source", "ref"].includes(key.toLowerCase())) {
        url.searchParams.delete(key);
      }
    }
    url.hostname = url.hostname.toLowerCase().replace(/^www\./, "");
    return url.toString().replace(/\/$/, "");
  } catch {
    return String(value || "").trim();
  }
}

export function normalizeText(value) {
  return String(value || "")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .replace(/\s+/g, " ");
}

export function textFingerprint(value) {
  return sha256(normalizeText(value));
}

export function bigramSimilarity(leftValue, rightValue) {
  const left = normalizeText(leftValue).replace(/\s/g, "");
  const right = normalizeText(rightValue).replace(/\s/g, "");
  if (!left || !right) return 0;
  if (left === right) return 1;
  const grams = (value) => Array.from({ length: Math.max(0, value.length - 1) }, (_, index) => value.slice(index, index + 2));
  const leftGrams = grams(left);
  const rightGrams = grams(right);
  const counts = new Map();
  for (const gram of rightGrams) counts.set(gram, (counts.get(gram) || 0) + 1);
  let intersection = 0;
  for (const gram of leftGrams) {
    const count = counts.get(gram) || 0;
    if (count > 0) {
      intersection += 1;
      counts.set(gram, count - 1);
    }
  }
  return (2 * intersection) / Math.max(1, leftGrams.length + rightGrams.length);
}

export function assertSafeRelativeArtifact(value) {
  const text = String(value || "");
  if (!text || path.isAbsolute(text) || text.includes("\0")) throw new Error("artifact path must be a safe relative path");
  const normalized = path.normalize(text);
  if (normalized === ".." || normalized.startsWith(`..${path.sep}`)) throw new Error("artifact path traversal rejected");
  return normalized;
}

export const HIGH_RISK_PATTERNS = {
  allegation: ["혐의", "고소", "기소", "수사", "유죄", "사기", "횡령"],
  privacy: ["주민등록번호", "미성년자", "피해자 신원", "사생활"],
  medical: ["치료", "진단", "효능", "의약품", "백신"],
  finance: ["투자 권유", "원금 보장", "목표주가", "매수"],
  politics: ["선거", "후보자", "여론조사"],
  religion: ["이단", "사이비", "종교 단체"],
};

export function detectHighRisk(value) {
  const text = normalizeText(value);
  return Object.entries(HIGH_RISK_PATTERNS)
    .filter(([, terms]) => terms.some((term) => text.includes(normalizeText(term))))
    .map(([category]) => category);
}

export function clusterRecords(records) {
  const clusters = [];
  for (const record of records) {
    const canonicalUrl = normalizeUrl(record.sourceUrl);
    const fingerprint = textFingerprint(record.body || record.text || record.title);
    let cluster = clusters.find((candidate) => (
      (canonicalUrl && candidate.canonicalUrls.has(canonicalUrl))
      || candidate.fingerprints.has(fingerprint)
      || candidate.records.some((existing) => bigramSimilarity(
        `${existing.title || ""} ${existing.body || existing.text || ""}`,
        `${record.title || ""} ${record.body || record.text || ""}`,
      ) >= 0.9)
    ));
    if (!cluster) {
      cluster = { id: `origin-${clusters.length + 1}`, records: [], canonicalUrls: new Set(), fingerprints: new Set() };
      clusters.push(cluster);
    }
    cluster.records.push(record);
    if (canonicalUrl) cluster.canonicalUrls.add(canonicalUrl);
    cluster.fingerprints.add(fingerprint);
  }
  return clusters.map((cluster) => ({
    id: cluster.id,
    recordIds: cluster.records.map((record) => record.id),
    sourceCount: new Set(cluster.records.map((record) => record.sourceName || record.publisher || "")).size,
    independentOriginCount: 1,
    fixture: cluster.records.every((record) => Boolean(record.fixture)),
  }));
}

export function buildRunPaths(kind, outputDir = ".editorial-audit-runs") {
  const stamp = timestampForFile();
  const base = path.resolve(outputDir);
  return {
    json: path.join(base, `${kind}-${stamp}.json`),
    markdown: path.join(base, `${kind}-${stamp}.md`),
    latestJson: path.join(base, `${kind}-latest.json`),
    latestMarkdown: path.join(base, `${kind}-latest.md`),
  };
}
