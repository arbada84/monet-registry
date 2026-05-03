import type { AutoPressSource } from "@/types/article";
import { normalizeAutoPressCount } from "@/lib/auto-press-count";

export function interleaveSourceItems<T>(groups: T[][]): T[] {
  const maxLength = groups.reduce((max, group) => Math.max(max, group.length), 0);
  const result: T[] = [];

  for (let index = 0; index < maxLength; index += 1) {
    for (const group of groups) {
      const item = group[index];
      if (item !== undefined) result.push(item);
    }
  }

  return result;
}

export function isNewswireAutoPressSource(source: Pick<AutoPressSource, "id" | "name" | "rssUrl">): boolean {
  const haystack = `${source.id || ""} ${source.name || ""} ${source.rssUrl || ""}`.toLowerCase();
  return haystack.includes("newswire") || haystack.includes("nwrss") || haystack.includes("뉴스와이어");
}

export function getAutoPressCandidateLimit(options: {
  count: number;
  requireImage: boolean;
  preview: boolean;
}): number {
  const count = normalizeAutoPressCount(options.count, 1);
  if (options.preview) return Math.max(count * 3, count);
  return Math.max(count * (options.requireImage ? 10 : 3), count * 2);
}
