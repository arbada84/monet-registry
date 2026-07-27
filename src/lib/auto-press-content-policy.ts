import blockedSubjectsConfig from "../../config/auto-press-blocked-subjects.json";
export interface AutoPressMatcherPolicy {
  subjects: Array<{
    id: string;
    label: string;
    terms: string[];
    termGroups?: string[][];
    domains: string[];
  }>;
}

export interface AutoPressContentPolicyInput {
  title?: unknown;
  summary?: unknown;
  bodyText?: unknown;
  bodyHtml?: unknown;
  tags?: unknown;
  sourceUrl?: unknown;
  sourceName?: unknown;
  keywords?: unknown[];
}

export interface AutoPressBlockedSubjectMatch {
  blocked: boolean;
  subjectId?: string;
  subjectLabel?: string;
  matchType?: "term" | "term-group" | "domain";
  rule?: string;
  matchedField?: "title" | "summary" | "bodyText" | "bodyHtml" | "tags" | "sourceName" | "keywords" | "sourceUrl";
}

function compactPolicyText(value: unknown): string {
  return String(value || "")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/<[^>]+>/g, " ")
    .replace(/[\s\u00a0._\-–—/]+/g, "");
}

function sourceHostname(value: unknown): string {
  try {
    return new URL(String(value || "")).hostname.toLowerCase().replace(/\.$/, "");
  } catch {
    return "";
  }
}

export function getAutoPressBlockedSubjectMatch(
  input: AutoPressContentPolicyInput,
  policy: AutoPressMatcherPolicy = blockedSubjectsConfig,
): AutoPressBlockedSubjectMatch {
  const fields = {
    title: compactPolicyText(input.title),
    summary: compactPolicyText(input.summary),
    bodyText: compactPolicyText(input.bodyText),
    bodyHtml: compactPolicyText(input.bodyHtml),
    tags: compactPolicyText(input.tags),
    sourceName: compactPolicyText(input.sourceName),
    keywords: compactPolicyText(Array.isArray(input.keywords) ? input.keywords.join(" ") : ""),
  };
  const text = Object.values(fields).join("");
  const hostname = sourceHostname(input.sourceUrl);

  for (const subject of policy.subjects) {
    for (const domain of subject.domains) {
      const normalizedDomain = String(domain).toLowerCase();
      if (hostname === normalizedDomain || hostname.endsWith(`.${normalizedDomain}`)) {
        return {
          blocked: true,
          subjectId: subject.id,
          subjectLabel: subject.label,
          matchType: "domain",
          rule: normalizedDomain,
          matchedField: "sourceUrl",
        };
      }
    }
    for (const term of subject.terms) {
      const normalizedTerm = compactPolicyText(term);
      if (text.includes(normalizedTerm)) {
        const matchedField = (Object.entries(fields).find(([, value]) => value.includes(normalizedTerm))?.[0]
          || "title") as AutoPressBlockedSubjectMatch["matchedField"];
        return {
          blocked: true,
          subjectId: subject.id,
          subjectLabel: subject.label,
          matchType: "term",
          rule: term,
          matchedField,
        };
      }
    }
    for (const termGroup of subject.termGroups || []) {
      const normalizedTerms = termGroup.map(compactPolicyText);
      if (normalizedTerms.every((term) => text.includes(term))) {
        const matchedField = (Object.entries(fields).find(([, value]) => normalizedTerms.every((term) => value.includes(term)))?.[0]
          || Object.entries(fields).find(([, value]) => normalizedTerms.some((term) => value.includes(term)))?.[0]
          || "title") as AutoPressBlockedSubjectMatch["matchedField"];
        return {
          blocked: true,
          subjectId: subject.id,
          subjectLabel: subject.label,
          matchType: "term-group",
          rule: termGroup.join(" + "),
          matchedField,
        };
      }
    }
  }

  return { blocked: false };
}

export function blockedAutoPressSubjectMessage(
  match: AutoPressBlockedSubjectMatch,
): string {
  return match.blocked
    ? `차단 주제(${match.subjectLabel || match.subjectId || "운영 정책"}) 관련 보도자료라 등록하지 않았습니다.`
    : "";
}
