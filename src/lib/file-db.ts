/**
 * 로컬 개발용 JSON 파일 DB
 * MySQL 환경변수가 없을 때 자동으로 사용
 * data/ 디렉토리에 JSON 파일로 저장
 */
import fs from "fs";
import path from "path";
import type { Article, ViewLogEntry, DistributeLog } from "@/types/article";

const DATA_DIR = path.join(process.cwd(), "data");

function filePath(name: string) {
  return path.join(DATA_DIR, `${name}.json`);
}

function readJson<T>(name: string, fallback: T): T {
  try {
    const p = filePath(name);
    if (!fs.existsSync(p)) return fallback;
    return JSON.parse(fs.readFileSync(p, "utf-8")) as T;
  } catch {
    return fallback;
  }
}

function writeJson(name: string, data: unknown) {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(filePath(name), JSON.stringify(data, null, 2), "utf-8");
}

// ─── Articles ────────────────────────────────────────────

export function fileGetArticles(): Article[] {
  const arts = readJson<Article[]>("articles", []);
  return [...arts].sort((a, b) => b.date.localeCompare(a.date));
}

export function fileGetArticleById(id: string): Article | null {
  return readJson<Article[]>("articles", []).find((a) => a.id === id) ?? null;
}

export function fileGetArticleByNo(no: number): Article | null {
  return readJson<Article[]>("articles", []).find((a) => a.no === no) ?? null;
}

export function fileCreateArticle(article: Article): void {
  const arts = readJson<Article[]>("articles", []);
  arts.push(article);
  writeJson("articles", arts);
}

export function fileUpdateArticle(id: string, updates: Partial<Article>): void {
  const arts = readJson<Article[]>("articles", []);
  const idx = arts.findIndex((a) => a.id === id);
  if (idx !== -1) arts[idx] = { ...arts[idx], ...updates };
  writeJson("articles", arts);
}

export function fileDeleteArticle(id: string): void {
  writeJson("articles", readJson<Article[]>("articles", []).filter((a) => a.id !== id));
}

export function fileIncrementViews(id: string): void {
  const arts = readJson<Article[]>("articles", []);
  const idx = arts.findIndex((a) => a.id === id);
  if (idx !== -1) arts[idx].views = (arts[idx].views || 0) + 1;
  writeJson("articles", arts);
}

// ─── View Logs ───────────────────────────────────────────

export function fileAddViewLog(entry: { articleId: string; path: string }): void {
  const logs = readJson<ViewLogEntry[]>("view-logs", []);
  logs.unshift({ ...entry, timestamp: new Date().toISOString() });
  if (logs.length > 10000) logs.splice(10000);
  writeJson("view-logs", logs);
}

export function fileGetViewLogs(): ViewLogEntry[] {
  return readJson<ViewLogEntry[]>("view-logs", []);
}

// ─── Distribute Logs ─────────────────────────────────────

export function fileGetDistributeLogs(): DistributeLog[] {
  return readJson<DistributeLog[]>("distribute-logs", []).slice(0, 100);
}

export function fileAddDistributeLogs(logs: DistributeLog[]): void {
  const existing = readJson<DistributeLog[]>("distribute-logs", []);
  writeJson("distribute-logs", [...logs, ...existing].slice(0, 100));
}

export function fileClearDistributeLogs(): void {
  writeJson("distribute-logs", []);
}

// ─── Site Settings ───────────────────────────────────────

export function fileGetSetting<T>(key: string, fallback: T): T {
  const all = readJson<Record<string, unknown>>("settings", {});
  return key in all ? (all[key] as T) : fallback;
}

export function fileSaveSetting(key: string, value: unknown): void {
  const all = readJson<Record<string, unknown>>("settings", {});
  all[key] = value;
  writeJson("settings", all);
}
