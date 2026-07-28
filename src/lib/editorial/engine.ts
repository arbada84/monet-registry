import {
  editorialPackageSchema,
  type EditorialPackage,
  type EditorialSource,
} from "@/lib/editorial/schema";

function normalizeText(value: string): string {
  return value
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function bigrams(value: string): string[] {
  const compact = normalizeText(value).replace(/\s/g, "");
  return Array.from({ length: Math.max(0, compact.length - 1) }, (_, index) => compact.slice(index, index + 2));
}

export function editorialTextSimilarity(left: string, right: string): number {
  const a = bigrams(left);
  const b = bigrams(right);
  if (!a.length || !b.length) return 0;
  if (normalizeText(left) === normalizeText(right)) return 1;
  const counts = new Map<string, number>();
  for (const gram of b) counts.set(gram, (counts.get(gram) || 0) + 1);
  let overlap = 0;
  for (const gram of a) {
    const count = counts.get(gram) || 0;
    if (count > 0) {
      overlap += 1;
      counts.set(gram, count - 1);
    }
  }
  return (2 * overlap) / (a.length + b.length);
}

function canonicalUrl(value?: string): string {
  if (!value) return "";
  try {
    const url = new URL(value);
    url.hash = "";
    url.hostname = url.hostname.toLowerCase().replace(/^www\./, "");
    for (const key of [...url.searchParams.keys()]) {
      if (/^utm_/i.test(key) || ["fbclid", "gclid", "source", "ref"].includes(key.toLowerCase())) {
        url.searchParams.delete(key);
      }
    }
    return url.toString().replace(/\/$/, "");
  } catch {
    return value.trim();
  }
}

export interface EditorialOriginCluster {
  id: string;
  sourceIds: string[];
  independentOriginCount: number;
  fixture: boolean;
}

export function clusterEditorialSources(sources: EditorialSource[]): EditorialOriginCluster[] {
  const clusters: Array<{ sources: EditorialSource[]; urls: Set<string> }> = [];
  for (const source of sources) {
    const url = canonicalUrl(source.sourceUrl);
    let cluster = clusters.find((candidate) => (
      (url && candidate.urls.has(url))
      || candidate.sources.some((existing) => editorialTextSimilarity(
        `${existing.title} ${existing.body}`,
        `${source.title} ${source.body}`,
      ) >= 0.9)
    ));
    if (!cluster) {
      cluster = { sources: [], urls: new Set() };
      clusters.push(cluster);
    }
    cluster.sources.push(source);
    if (url) cluster.urls.add(url);
  }
  return clusters.map((cluster, index) => ({
    id: `origin-${index + 1}`,
    sourceIds: cluster.sources.map((source) => source.id),
    independentOriginCount: 1,
    fixture: cluster.sources.every((source) => source.fixture),
  }));
}

const HIGH_RISK_GROUPS: Record<string, string[]> = {
  allegation: ["혐의", "고소", "기소", "수사", "유죄", "사기", "횡령"],
  privacy: ["주민등록번호", "미성년자", "피해자 신원", "사생활"],
  medical: ["치료", "진단", "효능", "의약품", "백신"],
  finance: ["투자 권유", "원금 보장", "목표주가", "매수"],
  politics: ["선거", "후보자", "여론조사"],
  religion: ["이단", "사이비", "종교 단체"],
};

export function detectEditorialHighRisk(value: string): string[] {
  const normalized = normalizeText(value);
  return Object.entries(HIGH_RISK_GROUPS)
    .filter(([, terms]) => terms.some((term) => normalized.includes(normalizeText(term))))
    .map(([group]) => group);
}

export interface EditorialGateResult {
  ok: boolean;
  nextState: "review_required" | "sensitive_review" | "needs_evidence" | "needs_counterview" | "blocked_rights";
  errors: string[];
  warnings: string[];
  highRisk: string[];
  evidenceCoverage: number;
}

export function evaluateEditorialPackage(input: unknown): EditorialGateResult {
  const parsed: EditorialPackage = editorialPackageSchema.parse(input);
  const evidenceById = new Map(parsed.evidence.map((item) => [item.id, item]));
  const coreClaims = parsed.claims.filter((claim) => claim.importance === "core");
  const supportedCore = coreClaims.filter((claim) => claim.evidenceIds.some((id) => {
    const evidence = evidenceById.get(id);
    return evidence?.relation === "supporting" && evidence.evidenceEligible && !evidence.fixture;
  }));
  const contradictingCore = coreClaims.filter((claim) => claim.evidenceIds.some((id) => {
    const evidence = evidenceById.get(id);
    return evidence?.relation === "contradicting" && evidence.evidenceEligible && !evidence.fixture;
  }));
  const evidenceCoverage = coreClaims.length ? supportedCore.length / coreClaims.length : 0;
  const errors: string[] = [];
  const warnings: string[] = [];
  const rightsBlocked = parsed.sources.some((source) => (
    source.fixture || !source.evidenceEligible || source.usageBasis === "unconfirmed"
  ));
  if (rightsBlocked) errors.push("권리 미확정 또는 fixture source가 포함되어 있습니다.");
  if (evidenceCoverage < 1) errors.push("모든 핵심 claim에 사용 가능한 supporting evidence가 필요합니다.");
  if (contradictingCore.length) errors.push("상충하는 핵심 근거는 편집자가 해소해야 합니다.");
  if (parsed.autoPublishAllowed) errors.push("자체 기사 자동 발행은 허용되지 않습니다.");

  const clusters = clusterEditorialSources(parsed.sources.filter((source) => source.evidenceEligible && !source.fixture));
  if (parsed.articleType !== "CP-0" && clusters.length < 2) {
    errors.push("CP-1 이상은 독립 origin 2개 이상이 필요합니다.");
  }
  const highRisk = detectEditorialHighRisk([
    parsed.title,
    ...parsed.claims.map((claim) => claim.text),
  ].join(" "));
  if (highRisk.length) warnings.push("민감 분야는 별도 편집자 검토가 필요합니다.");

  const nextState = rightsBlocked
    ? "blocked_rights"
    : evidenceCoverage < 1
      ? "needs_evidence"
      : contradictingCore.length
        ? "needs_counterview"
        : highRisk.length
          ? "sensitive_review"
          : "review_required";
  return { ok: errors.length === 0, nextState, errors, warnings, highRisk, evidenceCoverage };
}

export function validateEvidenceLockedDraft(input: {
  draft: string;
  evidenceExcerpts: string[];
  knownEntities?: string[];
}): { ok: boolean; errors: string[]; unsupportedTokens: string[] } {
  const draft = normalizeText(input.draft);
  const evidence = normalizeText(input.evidenceExcerpts.join(" "));
  const protectedTokens = [
    ...(input.draft.match(/\d+(?:[.,]\d+)*(?:%|원|명|건|개|년|월|일)?/g) || []),
    ...(input.draft.match(/[A-Z][A-Za-z0-9.-]{2,}/g) || []),
    ...(input.knownEntities || []),
  ].map(normalizeText).filter(Boolean);
  const unsupportedTokens = [...new Set(protectedTokens.filter((token) => !evidence.includes(token)))];
  const errors = unsupportedTokens.map((token) => `근거에 없는 보호 토큰: ${token}`);
  if (!draft) errors.push("초안이 비어 있습니다.");
  return { ok: errors.length === 0, errors, unsupportedTokens };
}
