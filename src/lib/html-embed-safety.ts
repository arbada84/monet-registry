export interface IframeSafetyOptions {
  allowMaps?: boolean;
  allowScripts?: boolean;
}

interface IframeSourceRule {
  host: string;
  pathPrefix?: string;
}

const MEDIA_IFRAME_RULES: readonly IframeSourceRule[] = [
  { host: "www.youtube.com" },
  { host: "youtube.com" },
  { host: "www.youtube-nocookie.com" },
  { host: "youtube-nocookie.com" },
  { host: "youtu.be" },
  { host: "player.vimeo.com" },
] as const;

const MAP_IFRAME_RULES: readonly IframeSourceRule[] = [
  { host: "www.google.com", pathPrefix: "/maps/" },
  { host: "maps.google.com", pathPrefix: "/maps/" },
] as const;

export function isAllowedIframeSrc(src: string, options: IframeSafetyOptions = {}): boolean {
  let url: URL;
  try {
    url = new URL(src);
  } catch {
    return false;
  }

  if (url.protocol !== "https:" || url.username || url.password) return false;

  const allowedRules = options.allowMaps
    ? [...MEDIA_IFRAME_RULES, ...MAP_IFRAME_RULES]
    : MEDIA_IFRAME_RULES;

  return allowedRules.some((rule) => {
    if (url.hostname.toLowerCase() !== rule.host) return false;
    return rule.pathPrefix ? url.pathname.startsWith(rule.pathPrefix) : true;
  });
}

export function hardenIframeTag(tag: string, options: IframeSafetyOptions = {}): string {
  const src = getAttributeValue(tag, "src");
  if (!src || !isAllowedIframeSrc(src, options)) return "";

  const sandbox = options.allowScripts
    ? "allow-scripts allow-same-origin allow-popups"
    : "allow-same-origin allow-popups";

  let hardened = tag.replace(/\s+sandbox=(["']).*?\1/i, "");
  hardened = hardened.replace(/\s+srcdoc=(["']).*?\1/i, "");

  return hardened.replace(/>$/, ` sandbox="${sandbox}">`);
}

export function sanitizeIframeHtml(html: string, options: IframeSafetyOptions = {}): string {
  return html
    .replace(/<iframe\b[^>]*>[\s\S]*?<\/iframe>/gi, (match) => {
      const openingTag = getOpeningTag(match);
      if (!openingTag) return "";
      const safeOpeningTag = hardenIframeTag(openingTag, options);
      return safeOpeningTag ? match.replace(openingTag, safeOpeningTag) : "";
    })
    .replace(/<iframe\b(?:[^>"']|"[^"]*"|'[^']*')*\/>/gi, (match) => {
      const safeTag = hardenIframeTag(match.replace(/\/>$/, ">"), options);
      return safeTag ? safeTag.replace(/>$/, " />") : "";
    });
}

function getOpeningTag(html: string): string {
  let quote = "";
  for (let index = 0; index < html.length; index += 1) {
    const char = html[index];
    if (quote) {
      if (char === quote) quote = "";
      continue;
    }
    if (char === '"' || char === "'") {
      quote = char;
      continue;
    }
    if (char === ">") {
      return html.slice(0, index + 1);
    }
  }
  return "";
}

function getAttributeValue(tag: string, attr: string): string {
  const match = tag.match(new RegExp(`\\s${attr}=(["'])(.*?)\\1`, "i"));
  return match?.[2] ?? "";
}
