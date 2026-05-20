import type { Page } from "puppeteer";
import { expect } from "vitest";
import {
  adminFetch,
  adminUrl,
  clickButtonByText,
  getAdminTestConfig,
  selectValueAfterLabel,
  setInputValueAfterLabel,
  setRichEditorHtml,
  setSafeAdminDefaults,
} from "./admin-auth";

interface ArticleListItem {
  id: string;
  no?: number;
  title: string;
  status: string;
}

interface ArticleListResponse {
  success: boolean;
  articles: ArticleListItem[];
}

export function uniqueE2eTitle(label: string): string {
  return `[E2E] ${label} ${Date.now()}`;
}

export async function createDraftArticleFromUi(page: Page, title: string): Promise<ArticleListItem> {
  await setSafeAdminDefaults(page);
  await page.goto(adminUrl("/cam/articles/new"), { waitUntil: "networkidle0" });
  await setInputValueAfterLabel(page, "제목", title);
  await setInputValueAfterLabel(page, "태그", "e2e, 자동테스트");
  await setInputValueAfterLabel(page, "요약문", "E2E 테스트용 임시 기사입니다.");
  await setRichEditorHtml(page, "<p>E2E 테스트 본문입니다. 생성 후 정리됩니다.</p>");
  await selectValueAfterLabel(page, "상태", "임시저장");
  await clickButtonByText(page, "저장");
  await page.waitForFunction(() => window.location.pathname === "/cam/articles", { timeout: 20_000 });

  const article = await findArticleByTitle(page, title);
  expect(article?.status).toBe("임시저장");
  return article!;
}

export async function updateDraftTitleFromUi(page: Page, articleId: string, title: string): Promise<void> {
  await page.goto(adminUrl(`/cam/articles/${articleId}/edit`), { waitUntil: "networkidle0" });
  await setInputValueAfterLabel(page, "제목", title);
  await clickButtonByText(page, "저장");
  await page.waitForFunction(
    () => document.body.textContent?.includes("저장되었습니다!") || document.body.textContent?.includes("저장 완료"),
    { timeout: 20_000 },
  );
}

export async function publishArticleFromUi(page: Page, articleId: string): Promise<ArticleListItem> {
  await page.goto(adminUrl(`/cam/articles/${articleId}/edit`), { waitUntil: "networkidle0" });
  await clickButtonByText(page, "게시");
  await page.waitForFunction(
    () => document.body.textContent?.includes("저장되었습니다!") || document.body.textContent?.includes("저장 완료"),
    { timeout: 30_000 },
  );
  const article = await getArticleById(page, articleId);
  expect(article?.status).toBe("게시");
  return article!;
}

export async function findArticleByTitle(page: Page, title: string): Promise<ArticleListItem | null> {
  const response = await adminFetch<ArticleListResponse>(
    page,
    `/api/db/articles?q=${encodeURIComponent(title)}&limit=10000`,
  );
  expect(response.status).toBe(200);
  return response.data.articles.find((article) => article.title === title) ?? null;
}

export async function getArticleById(page: Page, articleId: string): Promise<ArticleListItem | null> {
  const response = await adminFetch<{ success: boolean; article: ArticleListItem | null }>(
    page,
    `/api/db/articles?id=${encodeURIComponent(articleId)}`,
  );
  expect(response.status).toBe(200);
  return response.data.article ?? null;
}

export async function deleteArticle(page: Page, articleId: string): Promise<void> {
  const response = await adminFetch(page, `/api/db/articles?id=${encodeURIComponent(articleId)}`, { method: "DELETE" });
  expect(response.status).toBe(200);
}

export async function purgeArticleIfPossible(articleId: string): Promise<void> {
  const { cronSecret, baseUrl } = getAdminTestConfig();
  if (!cronSecret) return;

  await fetch(new URL(`/api/db/articles?id=${encodeURIComponent(articleId)}&action=purge`, `${baseUrl}/`).toString(), {
    method: "DELETE",
    headers: { Authorization: `Bearer ${cronSecret}` },
  }).catch(() => undefined);
}

export async function expectPublicArticleReachable(article: ArticleListItem): Promise<void> {
  if (!article.no) throw new Error("published article should have numeric article no");
  const response = await fetch(adminUrl(`/article/${article.no}`));
  expect(response.status).toBe(200);
}
