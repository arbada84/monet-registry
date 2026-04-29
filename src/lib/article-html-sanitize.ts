import { sanitizeIframeHtml, type IframeSafetyOptions } from "@/lib/html-embed-safety";

const BLOCKED_ELEMENTS = "script|style|object|embed|base|meta|link|svg|math|form|input|button|textarea|select|option";
const BLOCKED_ELEMENT_WITH_BODY_RE = new RegExp(`<\\s*(${BLOCKED_ELEMENTS})\\b[\\s\\S]*?<\\/\\s*\\1\\s*>`, "gi");
const BLOCKED_ELEMENT_RE = new RegExp(`<\\/?\\s*(${BLOCKED_ELEMENTS})\\b[^>]*>`, "gi");
const EVENT_ATTR_RE = /\s+on[a-z]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi;
const STYLE_ATTR_RE = /\s+style\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi;
const URL_ATTR_RE = /\s+(href|src|xlink:href|formaction|poster)\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi;
const SRCSET_ATTR_RE = /\s+srcset\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi;

export function sanitizeArticleHtml(html: string, options: IframeSafetyOptions = {}): string {
  const withoutDangerousMarkup = html
    .replace(BLOCKED_ELEMENT_WITH_BODY_RE, "")
    .replace(BLOCKED_ELEMENT_RE, "")
    .replace(EVENT_ATTR_RE, "")
    .replace(STYLE_ATTR_RE, "")
    .replace(URL_ATTR_RE, (match, _attr: string, rawValue: string) => {
      return isDangerousUrlAttributeValue(rawValue) ? "" : match;
    })
    .replace(SRCSET_ATTR_RE, (match, rawValue: string) => {
      return isDangerousUrlAttributeValue(rawValue) ? "" : match;
    });

  return sanitizeIframeHtml(withoutDangerousMarkup, options);
}

function isDangerousUrlAttributeValue(rawValue: string): boolean {
  const value = unwrapAttributeValue(rawValue);
  const normalized = decodeHtmlEntities(value)
    .replace(/[\u0000-\u001f\u007f\s]+/g, "")
    .toLowerCase();
  return normalized.startsWith("javascript:") || normalized.startsWith("vbscript:") || normalized.startsWith("data:");
}

function unwrapAttributeValue(rawValue: string): string {
  const trimmed = rawValue.trim();
  const first = trimmed[0];
  if ((first === '"' || first === "'") && trimmed.endsWith(first)) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&#x([0-9a-f]+);?/gi, (match, hex: string) => decodeCodePoint(match, Number.parseInt(hex, 16)))
    .replace(/&#([0-9]+);?/g, (match, decimal: string) => decodeCodePoint(match, Number.parseInt(decimal, 10)))
    .replace(/&colon;?/gi, ":")
    .replace(/&tab;?/gi, "\t")
    .replace(/&newline;?/gi, "\n")
    .replace(/&amp;?/gi, "&");
}

function decodeCodePoint(fallback: string, codePoint: number): string {
  if (!Number.isFinite(codePoint) || codePoint < 0 || codePoint > 0x10ffff) return fallback;
  return String.fromCodePoint(codePoint);
}
