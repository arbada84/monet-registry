const LEGACY_ARTICLE_REDIRECTS: Record<string, number> = {
  // Historical Search Console URLs removed during cleanup, with the same Newswire item kept under a newer article no.
  "23": 275,
  "25": 187,
  "27": 229,
  "33": 180,
  "34": 197,
};

export function getLegacyArticleRedirect(id: string): number | null {
  if (!/^\d+$/.test(id)) return null;
  return LEGACY_ARTICLE_REDIRECTS[id] ?? null;
}
