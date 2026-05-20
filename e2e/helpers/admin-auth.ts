import crypto from "node:crypto";
import puppeteer, { type Browser, type Page } from "puppeteer";
import { expect } from "vitest";
import { getBaseUrl } from "./api-client";

const ADMIN_COOKIE = "cp-admin-auth";

export interface AdminTestConfig {
  baseUrl: string;
  username: string;
  password: string;
  mutationEnabled: boolean;
  allowPublish: boolean;
  cronSecret: string;
}

export function getAdminTestConfig(): AdminTestConfig {
  return {
    baseUrl: getBaseUrl().replace(/\/$/, ""),
    username: process.env.E2E_ADMIN_USERNAME || process.env.ADMIN_USERNAME || "",
    password: process.env.E2E_ADMIN_PASSWORD || process.env.ADMIN_PASSWORD || "",
    mutationEnabled: process.env.E2E_ADMIN_MUTATION_ENABLED === "1",
    allowPublish: process.env.E2E_ADMIN_ALLOW_PUBLISH === "1",
    cronSecret: process.env.CRON_SECRET || "",
  };
}

export function canRunAdminLoginTests(): boolean {
  const config = getAdminTestConfig();
  return Boolean(config.username && config.password);
}

export function canRunAdminMutationTests(): boolean {
  const config = getAdminTestConfig();
  return canRunAdminLoginTests() && config.mutationEnabled;
}

export async function launchAdminBrowser(): Promise<Browser> {
  return puppeteer.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });
}

export async function newAdminPage(browser: Browser): Promise<Page> {
  const page = await browser.newPage();
  page.setDefaultTimeout(20_000);
  page.setDefaultNavigationTimeout(30_000);
  await page.setViewport({ width: 1440, height: 1200 });
  await page.evaluateOnNewDocument(() => {
    localStorage.setItem("cp-distribute-defaults", JSON.stringify({ indexNow: false, googlePing: false }));
  });
  return page;
}

export function adminUrl(path: string): string {
  return new URL(path, `${getAdminTestConfig().baseUrl}/`).toString();
}

export async function loginAsAdmin(page: Page, redirectPath = "/cam/dashboard"): Promise<void> {
  const config = getAdminTestConfig();
  await page.goto(adminUrl(`/cam/login?redirect=${encodeURIComponent(redirectPath)}`), { waitUntil: "networkidle0" });
  await page.type('input[type="text"]', config.username);
  await page.type('input[type="password"]', config.password);
  await Promise.allSettled([
    page.waitForNavigation({ waitUntil: "networkidle0", timeout: 15_000 }),
    clickButtonByText(page, "로그인"),
  ]);
  await page.waitForFunction(() => !window.location.pathname.startsWith("/cam/login"), { timeout: 15_000 });
  expect(page.url()).toContain(redirectPath);
}

export async function setSafeAdminDefaults(page: Page): Promise<void> {
  await page.evaluate(() => {
    localStorage.setItem("cp-distribute-defaults", JSON.stringify({ indexNow: false, googlePing: false }));
  });
}

export async function clickButtonByText(page: Page, text: string): Promise<void> {
  const clicked = await page.evaluate((targetText) => {
    const buttons = Array.from(document.querySelectorAll("button"));
    const button = buttons.find((candidate) => candidate.textContent?.trim() === targetText);
    if (!button) return false;
    (button as HTMLButtonElement).click();
    return true;
  }, text);
  expect(clicked, `button "${text}" should exist`).toBe(true);
}

export async function setInputValueAfterLabel(page: Page, labelText: string, value: string): Promise<void> {
  const updated = await page.evaluate(({ labelText, value }) => {
    const setNativeValue = (element: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement, nextValue: string) => {
      const proto = element instanceof HTMLTextAreaElement
        ? HTMLTextAreaElement.prototype
        : element instanceof HTMLSelectElement
          ? HTMLSelectElement.prototype
          : HTMLInputElement.prototype;
      const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
      setter?.call(element, nextValue);
      element.dispatchEvent(new Event("input", { bubbles: true }));
      element.dispatchEvent(new Event("change", { bubbles: true }));
    };
    const labels = Array.from(document.querySelectorAll("label"));
    const label = labels.find((candidate) => candidate.textContent?.trim().startsWith(labelText));
    const input = label?.parentElement?.querySelector("input, textarea, select") as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement | null;
    if (!input) return false;
    input.focus();
    setNativeValue(input, value);
    return true;
  }, { labelText, value });
  expect(updated, `field "${labelText}" should exist`).toBe(true);
}

export async function selectValueAfterLabel(page: Page, labelText: string, value: string): Promise<void> {
  const updated = await page.evaluate(({ labelText, value }) => {
    const labels = Array.from(document.querySelectorAll("label"));
    const label = labels.find((candidate) => candidate.textContent?.trim().startsWith(labelText));
    const select = label?.parentElement?.querySelector("select") as HTMLSelectElement | null;
    if (!select) return false;
    const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")?.set;
    setter?.call(select, value);
    select.dispatchEvent(new Event("change", { bubbles: true }));
    return true;
  }, { labelText, value });
  expect(updated, `select "${labelText}" should exist`).toBe(true);
}

export async function setRichEditorHtml(page: Page, html: string): Promise<void> {
  const updated = await page.evaluate((html) => {
    const editor = document.querySelector('[data-rich-editor-surface="true"]') as HTMLElement | null;
    if (!editor) return false;
    editor.focus();
    editor.innerHTML = html;
    editor.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: editor.textContent || "" }));
    editor.dispatchEvent(new Event("blur", { bubbles: true }));
    return true;
  }, html);
  expect(updated, "rich editor should exist").toBe(true);
}

export async function getAdminCookieHeader(page: Page): Promise<string> {
  const cookies = await page.cookies(getAdminTestConfig().baseUrl);
  return cookies.map((cookie) => `${cookie.name}=${cookie.value}`).join("; ");
}

export async function adminFetch<T = unknown>(
  page: Page,
  path: string,
  init: RequestInit = {},
): Promise<{ status: number; data: T }> {
  const cookie = await getAdminCookieHeader(page);
  const response = await fetch(adminUrl(path), {
    ...init,
    headers: {
      cookie,
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      ...(init.headers || {}),
    },
  });
  const text = await response.text();
  const data = text ? JSON.parse(text) as T : ({} as T);
  return { status: response.status, data };
}

export function createAdminAuthToken(name = "E2E 관리자", role = "superadmin"): string {
  const secret = process.env.COOKIE_SECRET || "cp-cookie-secret-dev-only-not-for-production";
  const payload = `${Date.now()}|${name}|${role}`;
  const b64 = Buffer.from(payload, "utf8").toString("base64url");
  const sig = crypto.createHmac("sha256", secret).update(b64).digest("hex");
  return `${b64}.${sig}`;
}

export async function applySignedAdminCookie(page: Page): Promise<void> {
  const url = new URL(getAdminTestConfig().baseUrl);
  await page.setCookie({
    name: ADMIN_COOKIE,
    value: createAdminAuthToken(),
    url: getAdminTestConfig().baseUrl,
    path: "/",
    httpOnly: true,
    secure: url.protocol === "https:",
    sameSite: "Lax",
  });
  await page.evaluateOnNewDocument(() => {
    localStorage.setItem("cp-admin-user", "E2E 관리자");
    localStorage.setItem("cp-admin-role", "superadmin");
    localStorage.setItem("cp-distribute-defaults", JSON.stringify({ indexNow: false, googlePing: false }));
  });
}
