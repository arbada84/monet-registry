import fs from "node:fs";
import path from "node:path";
import {
  assertSafeRelativeArtifact,
  bigramSimilarity,
  clusterRecords,
  detectHighRisk,
  normalizeText,
  sha256,
} from "./editorial-common.mjs";

export function readAdapterManifestFile(filePath) {
  const resolved = path.resolve(filePath);
  const raw = fs.readFileSync(resolved, "utf8").replace(/^\uFEFF/, "");
  try {
    return validateAdapterManifest(JSON.parse(raw));
  } catch (jsonError) {
    if (!resolved.toLowerCase().endsWith(".jsonl")) throw jsonError;
    const records = raw.split(/\r?\n/).filter((line) => line.trim()).map((line, index) => {
      if (Buffer.byteLength(line, "utf8") > 1_000_000) throw new Error(`JSONL line ${index + 1} exceeds 1 MB`);
      try {
        const parsed = JSON.parse(line);
        if (!parsed || Array.isArray(parsed) || typeof parsed !== "object") throw new Error("record must be an object");
        return parsed;
      } catch (error) {
        throw new Error(`malformed JSONL at line ${index + 1}: ${error instanceof Error ? error.message : String(error)}`);
      }
    });
    if (records.length > 10_000) throw new Error("JSONL record limit exceeded");
    return validateAdapterManifest({ schemaVersion: 1, records });
  }
}

export function validateAdapterManifest(input) {
  if (!input || input.schemaVersion !== 1 || !Array.isArray(input.records)) {
    throw new Error("manifest schemaVersion=1 and records[] are required");
  }
  const ids = new Set();
  const records = input.records.map((record, index) => {
    const id = String(record?.id || "").trim();
    if (!id || id.length > 160) throw new Error(`record ${index}: invalid id`);
    if (ids.has(id)) throw new Error(`duplicate record id: ${id}`);
    ids.add(id);
    if (record.artifactPath) assertSafeRelativeArtifact(record.artifactPath);
    const body = String(record.body || record.text || "");
    const computedHash = sha256(body);
    if (record.contentHash && record.contentHash !== computedHash) {
      throw new Error(`content hash mismatch: ${id}`);
    }
    const fixture = Boolean(record.fixture)
      || /harness|fixture|example\.com/i.test(`${record.sourceName || ""} ${record.sourceUrl || ""} ${record.reviewer || ""}`);
    const evidenceEligible = Boolean(record.evidenceEligible) && !fixture && record.usageBasis !== "unconfirmed";
    const trainingEligible = Boolean(record.trainingEligible) && !fixture && record.usageBasis !== "unconfirmed";
    if (fixture && (record.evidenceEligible || record.trainingEligible)) {
      throw new Error(`fixture eligibility rejected: ${id}`);
    }
    return {
      id,
      sourceType: String(record.sourceType || "unknown").slice(0, 80),
      sourceName: String(record.sourceName || "").slice(0, 200),
      sourceUrl: String(record.sourceUrl || "").slice(0, 2048),
      title: String(record.title || "").slice(0, 500),
      body,
      publishedAt: record.publishedAt ? String(record.publishedAt).slice(0, 80) : null,
      fixture,
      usageBasis: String(record.usageBasis || "unconfirmed").slice(0, 120),
      evidenceEligible,
      trainingEligible,
      contentHash: computedHash,
      highRisk: detectHighRisk(`${record.title || ""} ${body}`),
    };
  });
  return { schemaVersion: 1, kind: "editorial-adapter-manifest", records };
}

function splitSentences(value) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .split(/(?<=[.!?。]|다\.)\s+/)
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence.length >= 12);
}

function claimKind(sentence) {
  if (/전망|예상|계획|목표/.test(sentence)) return "forecast";
  if (/밝혔다|전했다|설명했다|주장했다/.test(sentence)) return "source_claim";
  if (/분석|해석|의미/.test(sentence)) return "analysis";
  return "fact";
}

function numericTokens(value) {
  return [...new Set(String(value).match(/\d+(?:[.,]\d+)*(?:%|원|명|건|개|년|월|일|억|만)?/g) || [])];
}

function claimSkeleton(value) {
  return normalizeText(value).replace(/\d+(?:[.,]\d+)*/g, "#");
}

export function buildEvidencePackage(manifest, candidateId = "shadow-candidate") {
  const sources = manifest.records.map((record) => ({
    id: record.id,
    sourceType: record.sourceType,
    sourceName: record.sourceName,
    sourceUrl: record.sourceUrl || undefined,
    title: record.title,
    body: record.body,
    publishedAt: record.publishedAt || undefined,
    fixture: record.fixture,
    usageBasis: record.usageBasis,
    allowedUses: [],
    rightsGrade: record.fixture ? "X" : record.evidenceEligible ? "B" : "D",
    evidenceEligible: record.evidenceEligible,
    trainingEligible: record.trainingEligible,
    contentHash: record.contentHash,
  }));
  const claims = [];
  const evidence = [];
  const sentenceEntries = [];
  for (const source of sources) {
    const sentences = splitSentences(source.body).slice(0, 40);
    for (let index = 0; index < sentences.length; index += 1) {
      const sentence = sentences[index];
      const evidenceId = `ev-${source.id}-${index + 1}`;
      const claimId = `claim-${source.id}-${index + 1}`;
      evidence.push({
        id: evidenceId,
        sourceId: source.id,
        relation: source.evidenceEligible && !source.fixture ? "supporting" : "unresolved",
        excerpt: sentence.slice(0, 4000),
        excerptHash: sha256(sentence),
        fixture: source.fixture,
        evidenceEligible: source.evidenceEligible,
      });
      claims.push({
        id: claimId,
        text: sentence.slice(0, 4000),
        kind: claimKind(sentence),
        importance: index === 0 ? "core" : "supporting",
        evidenceIds: [evidenceId],
      });
      sentenceEntries.push({ source, sentence, index, claimId, evidenceId });
    }
  }
  for (const target of sentenceEntries) {
    const claim = claims.find((item) => item.id === target.claimId);
    if (!claim) continue;
    for (const candidate of sentenceEntries) {
      if (candidate.source.id === target.source.id) continue;
      const contextSimilarity = bigramSimilarity(claimSkeleton(target.sentence), claimSkeleton(candidate.sentence));
      if (contextSimilarity < 0.72) continue;
      const targetNumbers = numericTokens(target.sentence);
      const candidateNumbers = numericTokens(candidate.sentence);
      const numbersConflict = targetNumbers.length > 0
        && candidateNumbers.length > 0
        && targetNumbers.join("|") !== candidateNumbers.join("|");
      const crossEvidenceId = `ev-${target.claimId}-${candidate.source.id}-${candidate.index + 1}`;
      if (evidence.some((item) => item.id === crossEvidenceId)) continue;
      evidence.push({
        id: crossEvidenceId,
        sourceId: candidate.source.id,
        relation: numbersConflict ? "contradicting" : "supporting",
        excerpt: candidate.sentence.slice(0, 4000),
        excerptHash: sha256(candidate.sentence),
        fixture: candidate.source.fixture,
        evidenceEligible: candidate.source.evidenceEligible,
      });
      claim.evidenceIds.push(crossEvidenceId);
    }
  }
  return {
    schemaVersion: 1,
    candidateId,
    title: sources[0]?.title || "",
    state: "collected",
    articleType: "CP-0",
    sources,
    claims,
    evidence,
    humanReviewRequired: true,
    autoPublishAllowed: false,
  };
}

export function auditEvidencePackage(pkg) {
  const evidenceById = new Map((pkg.evidence || []).map((item) => [item.id, item]));
  const core = (pkg.claims || []).filter((claim) => claim.importance === "core");
  const supported = core.filter((claim) => (claim.evidenceIds || []).some((id) => {
    const item = evidenceById.get(id);
    return item?.relation === "supporting" && item.evidenceEligible && !item.fixture;
  }));
  const fixtureSources = (pkg.sources || []).filter((source) => source.fixture);
  const rightsBlocked = (pkg.sources || []).filter((source) => !source.evidenceEligible || source.usageBasis === "unconfirmed");
  const highRisk = detectHighRisk(`${pkg.title || ""} ${(pkg.claims || []).map((claim) => claim.text).join(" ")}`);
  const contradictingCore = core.filter((claim) => (claim.evidenceIds || []).some((id) => {
    const item = evidenceById.get(id);
    return item?.relation === "contradicting" && item.evidenceEligible && !item.fixture;
  }));
  const independentOrigins = clusterRecords((pkg.sources || []).filter((source) => source.evidenceEligible && !source.fixture)).length;
  const errors = [];
  if (fixtureSources.length) errors.push("fixture_source_present");
  if (rightsBlocked.length) errors.push("rights_blocked_source_present");
  if (!core.length || supported.length !== core.length) errors.push("unsupported_core_claim");
  if (contradictingCore.length) errors.push("contradicting_core_evidence");
  if (pkg.articleType !== "CP-0" && independentOrigins < 2) errors.push("independent_origins_below_2");
  if (pkg.autoPublishAllowed !== false) errors.push("auto_publish_must_remain_disabled");
  return {
    ok: errors.length === 0,
    state: rightsBlocked.length
      ? "blocked_rights"
      : supported.length !== core.length
        ? "needs_evidence"
        : contradictingCore.length
          ? "needs_counterview"
          : highRisk.length
            ? "sensitive_review"
            : "review_required",
    evidenceCoverage: core.length ? supported.length / core.length : 0,
    independentOrigins,
    contradictingCoreClaims: contradictingCore.map((claim) => claim.id),
    errors,
    highRisk,
  };
}

export function validateLockedDraft(draft, evidenceExcerpts) {
  const normalizedEvidence = normalizeText(evidenceExcerpts.join(" "));
  const protectedTokens = [
    ...(String(draft).match(/\d+(?:[.,]\d+)*(?:%|원|명|건|개|년|월|일)?/g) || []),
    ...(String(draft).match(/[A-Z][A-Za-z0-9.-]{2,}/g) || []),
  ];
  const unsupported = [...new Set(protectedTokens.filter((token) => !normalizedEvidence.includes(normalizeText(token))))];
  return {
    ok: Boolean(normalizeText(draft)) && unsupported.length === 0,
    unsupportedTokens: unsupported,
    errors: [
      ...(!normalizeText(draft) ? ["empty_draft"] : []),
      ...unsupported.map((token) => `unsupported:${token}`),
    ],
  };
}
