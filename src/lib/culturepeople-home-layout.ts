import type { Article } from "@/types/article";

export interface HomeCategory {
  name: string;
  order: number;
  visible: boolean;
  parentId?: string | null;
}

export function selectCulturePeopleHome(articles: Article[], categories: HomeCategory[]) {
  const seen = new Set<string>();
  const published = articles.filter((article) => {
    if (article.status !== "게시" || article.deletedAt || seen.has(article.id)) return false;
    seen.add(article.id);
    return true;
  }).sort((a, b) => (Date.parse(b.date) || 0) - (Date.parse(a.date) || 0));
  const configured = categories.length > 0;
  const names = configured
    ? [...categories].filter((c) => c.visible !== false && !c.parentId)
      .sort((a, b) => a.order - b.order).map((c) => c.name)
    : [...new Set(published.map((a) => a.category).filter(Boolean))];
  const lead = published[0];
  const latest = published.slice(1, 4);
  const featured = new Set([lead, ...latest].filter(Boolean).map((a) => a!.id));
  const sections = [...new Set(names)].map((name) => ({
    name,
    articles: published.filter((a) => a.category === name && !featured.has(a.id)).slice(0, 4),
  })).filter((s) => s.articles.length > 0);
  // Rank the original home sample, independent of editorial placement.
  const popular = [...published].sort((a, b) => (b.views || 0) - (a.views || 0)).slice(0, 5);
  return { lead, latest, sections, popular, names };
}
