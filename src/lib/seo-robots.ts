export const SITE_BASE_URL = "https://culturepeople.co.kr";

export const LEGACY_DEFAULT_ROBOTS_TX = [
  "User-agent: *",
  "Allow: /",
  "Disallow: /cam/",
  "Disallow: /api/",
  "",
  "User-agent: Googlebot",
  "Allow: /",
  "",
  "User-agent: Yeti",
  "Allow: /",
  "",
  "User-agent: Bingbot",
  "Allow: /",
  "",
  "Sitemap: https://culturepeople.co.kr/sitemap.xml",
].join("\n");

export interface RobotsSettings {
  robotsNoIndex?: boolean;
  robotsTxt?: string | null;
}

export function normalizeRobotsTxt(value: string): string {
  return value.replace(/\r\n/g, "\n").replace(/\r/g, "\n").trim();
}

export function isLegacyDefaultRobotsTxt(value: string | null | undefined): boolean {
  if (!value) return false;
  return normalizeRobotsTxt(value) === normalizeRobotsTxt(LEGACY_DEFAULT_ROBOTS_TX);
}

export function buildDefaultRobotsTxt(baseUrl = SITE_BASE_URL): string {
  const cleanBaseUrl = baseUrl.replace(/\/$/, "");

  return [
    "User-agent: Mediapartners-Google",
    "Allow: /",
    "Disallow: /cam/",
    "",
    "User-agent: AdsBot-Google",
    "Allow: /",
    "Disallow: /cam/",
    "",
    "User-agent: AdsBot-Google-Mobile",
    "Allow: /",
    "Disallow: /cam/",
    "",
    "User-agent: Googlebot",
    "Allow: /",
    "Disallow: /cam/",
    "Disallow: /api/",
    "",
    "User-agent: Yeti",
    "Allow: /",
    "Disallow: /cam/",
    "Disallow: /api/",
    "",
    "User-agent: Bingbot",
    "Allow: /",
    "Disallow: /cam/",
    "Disallow: /api/",
    "",
    "User-agent: Daumoa",
    "Allow: /",
    "Disallow: /cam/",
    "Disallow: /api/",
    "",
    "User-agent: ChatGPT-User",
    "Allow: /",
    "Disallow: /cam/",
    "Disallow: /api/",
    "",
    "User-agent: PerplexityBot",
    "Allow: /",
    "Disallow: /cam/",
    "Disallow: /api/",
    "",
    "User-agent: GPTBot",
    "Disallow: /",
    "",
    "User-agent: Google-Extended",
    "Disallow: /",
    "",
    "User-agent: CCBot",
    "Disallow: /",
    "",
    "User-agent: anthropic-ai",
    "Disallow: /",
    "",
    "User-agent: ClaudeBot",
    "Disallow: /",
    "",
    "User-agent: Claude-Web",
    "Disallow: /",
    "",
    "User-agent: cohere-ai",
    "Disallow: /",
    "",
    "User-agent: Bytespider",
    "Disallow: /",
    "",
    "User-agent: FacebookBot",
    "Disallow: /",
    "",
    "User-agent: Applebot-Extended",
    "Disallow: /",
    "",
    "User-agent: Meta-ExternalAgent",
    "Disallow: /",
    "",
    "User-agent: SemrushBot",
    "Disallow: /",
    "",
    "User-agent: AhrefsBot",
    "Disallow: /",
    "",
    "User-agent: MJ12bot",
    "Disallow: /",
    "",
    "User-agent: DotBot",
    "Disallow: /",
    "",
    "User-agent: PetalBot",
    "Disallow: /",
    "",
    "User-agent: DataForSeoBot",
    "Disallow: /",
    "",
    "User-agent: *",
    "Allow: /",
    "Disallow: /cam/",
    "Disallow: /api/",
    "Crawl-delay: 10",
    "",
    `Sitemap: ${cleanBaseUrl}/sitemap.xml`,
    "",
  ].join("\n");
}

export function resolveRobotsTxt(settings: RobotsSettings | null | undefined, baseUrl = SITE_BASE_URL): string {
  if (settings?.robotsNoIndex) {
    return "User-agent: *\nDisallow: /\n";
  }

  const saved = normalizeRobotsTxt(settings?.robotsTxt ?? "");
  if (saved && !isLegacyDefaultRobotsTxt(saved)) {
    return `${saved}\n`;
  }

  return buildDefaultRobotsTxt(baseUrl);
}
