import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Browser, Page } from "puppeteer";
import {
  adminFetch,
  adminUrl,
  canRunAdminMutationTests,
  clickButtonByText,
  launchAdminBrowser,
  loginAsAdmin,
  newAdminPage,
  setInputValueAfterLabel,
} from "../helpers/admin-auth";

interface SiteSettings {
  siteName?: string;
  slogan?: string;
  accentColor?: string;
}

interface WatermarkSettings {
  enabled?: boolean;
  type?: "text" | "image";
  text?: string;
  opacity?: number;
  size?: number;
  imageUrl?: string;
}

describe.skipIf(!canRunAdminMutationTests())("admin settings", () => {
  let browser: Browser;
  let page: Page;
  let originalSiteSettings: SiteSettings | null = null;
  let originalWatermarkSettings: WatermarkSettings | null = null;

  beforeAll(async () => {
    browser = await launchAdminBrowser();
    page = await newAdminPage(browser);
    await loginAsAdmin(page, "/cam/settings");
    originalSiteSettings = await readSetting<SiteSettings>(page, "cp-site-settings", {});
    originalWatermarkSettings = await readSetting<WatermarkSettings>(page, "cp-watermark-settings", {});
  });

  afterAll(async () => {
    if (originalSiteSettings) await saveSetting(page, "cp-site-settings", originalSiteSettings);
    if (originalWatermarkSettings) await saveSetting(page, "cp-watermark-settings", originalWatermarkSettings);
    await browser?.close();
  });

  it("saves and restores the brand site name through the UI", async () => {
    const baseName = originalSiteSettings?.siteName || "컬처피플";
    const testName = `${baseName} E2E`;

    await page.goto(adminUrl("/cam/settings"), { waitUntil: "networkidle0" });
    await setInputValueAfterLabel(page, "사이트명", testName);
    await clickButtonByText(page, "저장");
    await page.waitForFunction(() => document.body.textContent?.includes("저장되었습니다!"), { timeout: 20_000 });

    const saved = await readSetting<SiteSettings>(page, "cp-site-settings", {});
    expect(saved.siteName).toBe(testName);
  });

  it("shows SMTP connection-test controls without requiring a real send", async () => {
    await page.goto(adminUrl("/cam/settings"), { waitUntil: "networkidle0" });
    const hasSmtpControls = await page.evaluate(() => {
      const text = document.body.textContent || "";
      const button = Array.from(document.querySelectorAll("button")).find((candidate) => candidate.textContent?.trim() === "연결 테스트");
      return text.includes("메일(SMTP) 설정") && Boolean(button);
    });
    expect(hasSmtpControls).toBe(true);
  });

  it("saves and restores watermark text settings through the UI", async () => {
    await page.goto(adminUrl("/cam/settings"), { waitUntil: "networkidle0" });
    await ensureWatermarkEnabled(page);
    await selectRadioByLabel(page, "텍스트");
    await setInputValueAfterLabel(page, "워터마크 텍스트", "(C) E2E 컬처피플");
    await clickButtonByText(page, "워터마크 설정 저장");
    await page.waitForFunction(() => document.body.textContent?.includes("저장되었습니다!"), { timeout: 20_000 });

    const saved = await readSetting<WatermarkSettings>(page, "cp-watermark-settings", {});
    expect(saved.enabled).toBe(true);
    expect(saved.text).toBe("(C) E2E 컬처피플");
  });
});

async function readSetting<T>(page: Page, key: string, fallback: T): Promise<T> {
  const response = await adminFetch<{ success: boolean; value: T }>(
    page,
    `/api/db/settings?key=${encodeURIComponent(key)}&fallback=${encodeURIComponent(JSON.stringify(fallback))}`,
  );
  expect(response.status).toBe(200);
  return response.data.value;
}

async function saveSetting(page: Page, key: string, value: unknown): Promise<void> {
  const response = await adminFetch(page, "/api/db/settings", {
    method: "PUT",
    body: JSON.stringify({ key, value }),
  });
  expect(response.status).toBe(200);
}

async function ensureWatermarkEnabled(page: Page): Promise<void> {
  const enabled = await page.evaluate(() => {
    const toggle = document.querySelector<HTMLButtonElement>('button[aria-label="워터마크 끄기"], button[aria-label="워터마크 켜기"]');
    if (!toggle) return false;
    if (toggle.getAttribute("aria-label") === "워터마크 켜기") toggle.click();
    return true;
  });
  expect(enabled).toBe(true);
}

async function selectRadioByLabel(page: Page, labelText: string): Promise<void> {
  const selected = await page.evaluate((labelText) => {
    const labels = Array.from(document.querySelectorAll("label"));
    const label = labels.find((candidate) => candidate.textContent?.trim().includes(labelText));
    const radio = label?.querySelector<HTMLInputElement>('input[type="radio"]');
    if (!radio) return false;
    radio.click();
    radio.dispatchEvent(new Event("change", { bubbles: true }));
    return true;
  }, labelText);
  expect(selected).toBe(true);
}
