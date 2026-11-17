import type { Article } from "@/types/article";

export interface InsightCategory { name: string; order: number; visible: boolean; parentId?: string | null }

// Ignore known tracking parameters only; meaningful query values identify different stories.
function sourceKey(source?: string) {
  if (!source) return "";
  try {
    const url = new URL(source);
    for (const key of [...url.searchParams.keys()]) {
      if (/^utm_/i.test(key) || /^(fbclid|gclid)$/i.test(key)) url.searchParams.delete(key);
    }
    url.hash = "";
    url.searchParams.sort();
    return url.toString();
  } catch { return ""; }
}

export function dedupeInsightArticles(articles: Article[]) {
  const ids = new Set<string>();
  const sources = new Set<string>();
  return [...articles].filter(a => a.status === "게시" && !a.deletedAt)
    .sort((a,b) => (Date.parse(b.date) || 0) - (Date.parse(a.date) || 0))
    .filter(a => {
      const source = sourceKey(a.sourceUrl);
      if (ids.has(a.id) || (source && sources.has(source))) return false;
      ids.add(a.id); if (source) sources.add(source); return true;
    });
}

export function selectInsightHome(articles: Article[], categories: InsightCategory[] = []) {
  const published = dedupeInsightArticles(articles);
  const names = categories.length
    ? [...categories].filter(c => c.visible !== false && !c.parentId).sort((a,b) => a.order-b.order).map(c => c.name)
    : [...new Set(published.map(a=>a.category).filter(Boolean))];
  const hidden = new Set(categories.filter(c=>c.visible === false).map(c=>c.name));
  const sectionNames = [...new Set([...names, ...published.map(a=>a.category)])].filter(name=>name&&!hidden.has(name));
  const hero = published.slice(0,3);
  const bulletin = published[3];
  const used = new Set([...hero, ...(bulletin ? [bulletin] : [])].map(a=>a.id));
  const discovery = published.filter(a=>!used.has(a.id) && !hidden.has(a.category) && ["문화","엔터","라이프"].includes(a.category)).slice(0,3);
  discovery.forEach(a=>used.add(a.id));
  const sections = sectionNames.map(name=>({name, articles:published.filter(a=>a.category===name&&!used.has(a.id)).slice(0,3)})).filter(s=>s.articles.length);
  sections.forEach(section=>section.articles.forEach(a=>used.add(a.id)));
  const picks = published.filter(a=>!used.has(a.id)).slice(0,3);
  return {hero, bulletin, discovery, picks, sections, names};
}
