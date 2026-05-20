import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Browser, Page } from "puppeteer";
import {
  canRunAdminMutationTests,
  getAdminTestConfig,
  launchAdminBrowser,
  loginAsAdmin,
  newAdminPage,
} from "../helpers/admin-auth";
import {
  createDraftArticleFromUi,
  deleteArticle,
  expectPublicArticleReachable,
  findArticleByTitle,
  purgeArticleIfPossible,
  publishArticleFromUi,
  uniqueE2eTitle,
  updateDraftTitleFromUi,
} from "../helpers/article-actions";

describe.skipIf(!canRunAdminMutationTests())("admin article lifecycle", () => {
  let browser: Browser;
  let page: Page;
  const createdArticleIds = new Set<string>();

  beforeAll(async () => {
    browser = await launchAdminBrowser();
    page = await newAdminPage(browser);
    await loginAsAdmin(page, "/cam/articles");
  });

  afterAll(async () => {
    for (const id of createdArticleIds) {
      await purgeArticleIfPossible(id);
    }
    await browser?.close();
  });

  it("creates, edits, and deletes a draft article through the admin UI", async () => {
    const draftTitle = uniqueE2eTitle("임시저장");
    const draft = await createDraftArticleFromUi(page, draftTitle);
    createdArticleIds.add(draft.id);

    const updatedTitle = `${draftTitle} 수정`;
    await updateDraftTitleFromUi(page, draft.id, updatedTitle);
    const updated = await findArticleByTitle(page, updatedTitle);
    expect(updated?.id).toBe(draft.id);

    await deleteArticle(page, draft.id);
    const deletedLookup = await findArticleByTitle(page, updatedTitle);
    expect(deletedLookup).toBeNull();
  });

  it.skipIf(!getAdminTestConfig().allowPublish)("publishes a test article and confirms the public page is reachable", async () => {
    const title = uniqueE2eTitle("게시");
    const draft = await createDraftArticleFromUi(page, title);
    createdArticleIds.add(draft.id);

    const published = await publishArticleFromUi(page, draft.id);
    await expectPublicArticleReachable(published);
  });
});
