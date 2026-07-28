#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import { spawn, spawnSync } from "node:child_process";
import puppeteer from "puppeteer";

loadSmokeEnv();

const args = new Set(process.argv.slice(2));
const json = args.has("--json");
const baseUrl = normalizeBaseUrl(getArgValue("--base-url") || process.env.SMOKE_BASE_URL || "http://127.0.0.1:3000");
const explicitArticlePath = getArgValue("--article-path") || process.env.SMOKE_ARTICLE_PATH || "";
const screenshotDir = getArgValue("--screenshot-dir") || process.env.SMOKE_SCREENSHOT_DIR || "";
const smokeArticleFixturePath = "/smoke/article-embed";
const smokeRegistryComponent = getSmokeRegistryComponent();
const noAutoStart = args.has("--no-auto-start");
const publicSiteOnly = args.has("--public-site-only");
const adminOpsReadOnly = args.has("--admin-ops-read-only");
const blockedSubjectPolicyOnly = args.has("--blocked-subject-policy-only");
const editorialLabOnly = args.has("--editorial-lab-only");
const noAdminAuth = publicSiteOnly || args.has("--no-admin-auth") || process.env.SMOKE_ADMIN_AUTH === "0";
const noArticleFixture = publicSiteOnly || args.has("--no-article-fixture") || process.env.SMOKE_PUBLIC_ARTICLE_FIXTURE === "0";
const allowRemoteAdminAuth = args.has("--allow-remote-admin-auth") || process.env.SMOKE_ALLOW_REMOTE_AUTH_SMOKE === "1";
const explicitAdminToken = process.env.SMOKE_ADMIN_AUTH_TOKEN || "";
const adminOpsPages = adminOpsReadOnly || args.has("--admin-ops-pages") || process.env.SMOKE_ADMIN_OPS_PAGES === "1";
const adminOpsPaths = editorialLabOnly
  ? ["/cam/editorial-lab"]
  : blockedSubjectPolicyOnly
    ? ["/cam/auto-press/blocked-subjects"]
    : ["/cam/articles", "/cam/auto-press", "/cam/auto-press/blocked-subjects", "/cam/editorial-lab", "/cam/distribute", "/cam/rss", "/cam/seo", "/cam/portal-review", "/cam/ads"];

function getArgValue(name) {
  const prefix = `${name}=`;
  const match = process.argv.slice(2).find((arg) => arg.startsWith(prefix));
  return match ? match.slice(prefix.length) : "";
}

function loadSmokeEnv() {
  const files = process.env.SMOKE_ENV_MODE === "development"
    ? [".env.local", ".env.production.local", ".env", ".env.production"]
    : [".env.production.local", ".env.local", ".env.production", ".env"];
  for (const file of files) {
    if (!fs.existsSync(file)) continue;
    const text = fs.readFileSync(file, "utf8");
    for (const line of text.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const match = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
      if (!match || process.env[match[1]] !== undefined) continue;
      process.env[match[1]] = parseEnvValue(match[2]);
    }
  }
}

function parseEnvValue(raw) {
  const value = raw.trim();
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    return value.slice(1, -1).replace(/\\n/g, "\n").replace(/\\"/g, '"').replace(/\\'/g, "'");
  }
  return value;
}

function normalizeBaseUrl(value) {
  return value.endsWith("/") ? value.slice(0, -1) : value;
}

function resolveBrowserExecutable() {
  const explicit = process.env.PUPPETEER_EXECUTABLE_PATH || process.env.CHROME_EXECUTABLE_PATH;
  if (explicit && fs.existsSync(explicit)) return explicit;
  if (process.platform !== "linux") return undefined;
  return [
    "/usr/bin/google-chrome",
    "/usr/bin/google-chrome-stable",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
  ].find((candidate) => fs.existsSync(candidate));
}

function resolveUrl(path) {
  return new URL(path, `${baseUrl}/`).toString();
}

function getSmokeRegistryComponent() {
  if (process.env.SMOKE_REGISTRY_COMPONENT) return process.env.SMOKE_REGISTRY_COMPONENT;
  try {
    const registryPath = "public/generated/registry.json";
    if (fs.existsSync(registryPath)) {
      const names = Object.keys(JSON.parse(fs.readFileSync(registryPath, "utf8")));
      if (names[0]) return names[0];
    }
  } catch {
    // Fall back to the source directory below.
  }

  try {
    return fs
      .readdirSync("src/components/registry", { withFileTypes: true })
      .find((entry) => entry.isDirectory())?.name || "";
  } catch {
    return "";
  }
}

function sameOrigin(url) {
  try {
    return new URL(url).origin === new URL(baseUrl).origin;
  } catch {
    return false;
  }
}

function isLocalBaseUrl() {
  try {
    const { hostname } = new URL(baseUrl);
    return hostname === "127.0.0.1" || hostname === "localhost" || hostname === "::1";
  } catch {
    return false;
  }
}

function shouldEnableSmokeArticleFixture() {
  return !noArticleFixture && isLocalBaseUrl();
}

function isAllowedSmokeIframeSrc(src) {
  try {
    const url = new URL(src);
    if (url.protocol !== "https:" || url.username || url.password) return false;
    const host = url.hostname.toLowerCase();
    if (["www.youtube.com", "youtube.com", "www.youtube-nocookie.com", "youtube-nocookie.com", "youtu.be", "player.vimeo.com"].includes(host)) {
      return true;
    }
    if (["www.google.com", "maps.google.com"].includes(host) && url.pathname.startsWith("/maps/")) {
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

function isKnownAdvertisingIframeSrc(src) {
  try {
    const host = new URL(src, `${baseUrl}/`).hostname.toLowerCase();
    return [
      "googlesyndication.com",
      "doubleclick.net",
      "google.com",
      "adtrafficquality.google",
      "ads-partners.coupang.com",
    ].some((allowed) => host === allowed || host.endsWith(`.${allowed}`));
  } catch {
    return false;
  }
}

function isKnownAdvertisingPageError(error) {
  const details = `${error?.message || ""}\n${error?.stack || ""}`.toLowerCase();
  return [
    "googlesyndication.com",
    "doubleclick.net",
    "adtrafficquality.google",
    "ads-partners.coupang.com",
  ].some((host) => details.includes(host));
}

function createAdminSmokeToken() {
  if (explicitAdminToken) {
    return { token: explicitAdminToken, source: "SMOKE_ADMIN_AUTH_TOKEN" };
  }
  const secret = process.env.COOKIE_SECRET;
  if (!secret) return null;

  const payload = `${Date.now()}|Smoke Admin|superadmin`;
  const b64 = Buffer.from(payload, "utf8").toString("base64url");
  const sig = crypto.createHmac("sha256", secret).update(b64).digest("hex");
  return { token: `${b64}.${sig}`, source: "COOKIE_SECRET" };
}

async function applyAdminSmokeCookie(page, result) {
  if (noAdminAuth) {
    result.skipped.push({
      check: "authenticated admin editor and popup UI",
      reason: "Admin auth smoke disabled by --no-admin-auth or SMOKE_ADMIN_AUTH=0.",
    });
    return false;
  }
  if (!isLocalBaseUrl() && !allowRemoteAdminAuth) {
    result.skipped.push({
      check: "authenticated admin editor and popup UI",
      reason: "Admin auth smoke is limited to local URLs unless --allow-remote-admin-auth or SMOKE_ALLOW_REMOTE_AUTH_SMOKE=1 is set.",
    });
    return false;
  }

  const auth = createAdminSmokeToken();
  if (!auth) {
    result.skipped.push({
      check: "authenticated admin editor and popup UI",
      reason: "COOKIE_SECRET or SMOKE_ADMIN_AUTH_TOKEN is unavailable, so a signed admin smoke cookie cannot be created.",
    });
    return false;
  }

  const url = new URL(baseUrl);
  await page.setCookie({
    name: "cp-admin-auth",
    value: auth.token,
    url: baseUrl,
    path: "/",
    httpOnly: true,
    secure: url.protocol === "https:",
    sameSite: "Lax",
  });
  await page.evaluateOnNewDocument(() => {
    localStorage.setItem("cp-admin-user", "Smoke Admin");
  });
  result.authenticatedAdmin = {
    attempted: true,
    authSource: auth.source,
    remoteAuthAllowed: allowRemoteAdminAuth,
  };
  return true;
}

function getLocalPort() {
  try {
    return new URL(baseUrl).port || "3000";
  } catch {
    return "3000";
  }
}

async function probeBase() {
  try {
    await fetch(resolveUrl("/api/health"), {
      signal: AbortSignal.timeout(2500),
    });
    return true;
  } catch {
    return false;
  }
}

async function waitForBase(timeoutMs = 45000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    if (await probeBase()) return true;
    await new Promise((resolve) => setTimeout(resolve, 750));
  }
  return false;
}

async function maybeStartLocalServer(result) {
  if (await probeBase()) return null;
  if (noAutoStart || !isLocalBaseUrl()) return null;

  const port = getLocalPort();
  const command = process.platform === "win32" ? "cmd.exe" : "pnpm";
  const commandArgs =
    process.platform === "win32"
      ? ["/d", "/s", "/c", `pnpm exec next start -p ${port}`]
      : ["exec", "next", "start", "-p", port];
  const childEnv = { ...process.env };
  if (shouldEnableSmokeArticleFixture() && !childEnv.SMOKE_PUBLIC_ARTICLE_FIXTURE) {
    childEnv.SMOKE_PUBLIC_ARTICLE_FIXTURE = "1";
  }
  const child = spawn(command, commandArgs, {
    cwd: process.cwd(),
    stdio: ["ignore", "pipe", "pipe"],
    env: childEnv,
  });

  const stdout = [];
  const stderr = [];
  child.stdout?.on("data", (chunk) => stdout.push(chunk.toString()));
  child.stderr?.on("data", (chunk) => stderr.push(chunk.toString()));
  result.startedServer = {
    port,
    pid: child.pid ?? null,
    publicArticleFixture: childEnv.SMOKE_PUBLIC_ARTICLE_FIXTURE === "1",
  };

  const ready = await waitForBase();
  if (!ready) {
    result.startedServer.ready = false;
    result.startedServer.stdout = stdout.join("").slice(-2000);
    result.startedServer.stderr = stderr.join("").slice(-2000);
    child.kill();
    throw new Error(`Local next start did not become ready on ${baseUrl}`);
  }

  result.startedServer.ready = true;
  return child;
}

function stopProcessTree(child) {
  if (!child?.pid) return;
  if (process.platform === "win32") {
    spawnSync("taskkill", ["/pid", String(child.pid), "/T", "/F"], {
      stdio: "ignore",
    });
    return;
  }

  child.kill("SIGTERM");
}

async function settle() {
  await new Promise((resolve) => setTimeout(resolve, 1200));
}

async function collectDomState(page) {
  return page.evaluate(() => {
    const frames = Array.from(document.querySelectorAll("iframe")).map((frame) => {
      const src = frame.getAttribute("src") || "";
      const sandbox = frame.getAttribute("sandbox") || "";
      return {
        src,
        sandbox,
        hasSrcdoc: frame.hasAttribute("srcdoc"),
        hasCredentialsInUrl: /^[a-z][a-z0-9+.-]*:\/\//i.test(src) && /\/\/[^/@]+@/.test(src),
        isJavascriptUrl: /^javascript:/i.test(src.trim()),
      };
    });

    const images = Array.from(document.querySelectorAll("img[src]"));
    const headerElement = document.querySelector("header");
    const header = headerElement?.getBoundingClientRect();
    let nextContentElement = headerElement?.nextElementSibling || null;
    while (nextContentElement) {
      const rect = nextContentElement.getBoundingClientRect();
      const style = window.getComputedStyle(nextContentElement);
      const isLayoutContent = rect.width > 2
        && rect.height > 2
        && style.display !== "none"
        && style.visibility !== "hidden"
        && style.position !== "absolute"
        && style.position !== "fixed";
      if (isLayoutContent) break;
      nextContentElement = nextContentElement.nextElementSibling;
    }
    const nextContent = nextContentElement?.getBoundingClientRect();
    return {
      title: document.title,
      bodyTextPreview: document.body.innerText.replace(/\s+/g, " ").trim().slice(0, 300),
      searchInputs: document.querySelectorAll('input[name="q"]').length,
      searchButtons: document.querySelectorAll('button[aria-label="검색"], button[type="submit"]').length,
      categoryLinks: document.querySelectorAll('a[href^="/category/"]').length,
      articleLinks: document.querySelectorAll('a[href^="/article/"]').length,
      passwordInputs: document.querySelectorAll('input[type="password"]').length,
      editorSurfaces: document.querySelectorAll('[contenteditable="true"], textarea').length,
      menuButtons: document.querySelectorAll('button[aria-label="메뉴 열기/닫기"], button[aria-label="메뉴"], button[aria-label="카테고리 메뉴"], button[aria-label="전체메뉴"]').length,
      imageCount: images.length,
      brokenImages: images.filter((image) => image.complete && image.naturalWidth === 0).map((image) => image.getAttribute("src") || ""),
      viewportWidth: document.documentElement.clientWidth,
      documentWidth: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth),
      majorContentOverlap: Boolean(header && nextContent && nextContent.top + 2 < header.bottom),
      frames,
    };
  });
}

async function triggerLazyContent(page) {
  await page.evaluate(async () => {
    const height = Math.max(document.body.scrollHeight, document.documentElement.scrollHeight);
    for (let y = 0; y < height; y += Math.max(500, window.innerHeight)) {
      window.scrollTo(0, y);
      await new Promise((resolve) => setTimeout(resolve, 40));
    }
    window.scrollTo(0, 0);
  });
  await new Promise((resolve) => setTimeout(resolve, 300));
}

async function clickVisible(page, selector) {
  return page.evaluate((target) => {
    const element = Array.from(document.querySelectorAll(target)).find((candidate) => {
      const rect = candidate.getBoundingClientRect();
      const style = window.getComputedStyle(candidate);
      return rect.width > 0 && rect.height > 0 && style.visibility !== "hidden" && style.display !== "none";
    });
    if (!(element instanceof HTMLElement)) return false;
    element.click();
    return true;
  }, selector);
}

function validateFrames(frames) {
  return frames.filter((frame) => {
    if (isKnownAdvertisingIframeSrc(frame.src)) return false;
    const sandboxTokens = frame.sandbox.split(/\s+/).filter(Boolean);
    const hasRiskySandboxPair = sandboxTokens.includes("allow-scripts") && sandboxTokens.includes("allow-same-origin");
    const allowedEmbed = isAllowedSmokeIframeSrc(frame.src);
    return (
      frame.hasSrcdoc ||
      frame.hasCredentialsInUrl ||
      frame.isJavascriptUrl ||
      !frame.sandbox ||
      (hasRiskySandboxPair && !allowedEmbed)
    );
  });
}

function isIgnorableRequestFailure(request) {
  const failure = request.failure()?.errorText || "";
  if (request.resourceType() !== "fetch" || failure !== "net::ERR_ABORTED") return false;
  try {
    const url = new URL(request.url());
    return url.searchParams.has("_rsc");
  } catch {
    return false;
  }
}

async function runPage(page, path, expectations = {}) {
  const pageResult = {
    path,
    status: null,
    ok: true,
    consoleErrors: [],
    pageErrors: [],
    failedRequests: [],
    badResponses: [],
    viewport: expectations.viewport || null,
    checks: {},
    dom: null,
    warnings: [],
  };

  const onConsole = (message) => {
    if (message.type() === "error") pageResult.consoleErrors.push(message.text());
  };
  const onPageError = (error) => {
    if (isKnownAdvertisingPageError(error)) {
      pageResult.warnings.push(`Known external advertising script error: ${error.message || "unknown"}`);
      return;
    }
    pageResult.pageErrors.push(error.message);
  };
  const onRequestFailed = (request) => {
    if (!sameOrigin(request.url())) return;
    if (isIgnorableRequestFailure(request)) return;
    pageResult.failedRequests.push({
      url: request.url(),
      resourceType: request.resourceType(),
      failure: request.failure()?.errorText || "unknown",
    });
  };
  const onResponse = (response) => {
    if (!sameOrigin(response.url())) return;
    if (response.status() >= 400) {
      pageResult.badResponses.push({
        url: response.url(),
        status: response.status(),
      });
    }
  };

  page.on("console", onConsole);
  page.on("pageerror", onPageError);
  page.on("requestfailed", onRequestFailed);
  page.on("response", onResponse);

  try {
    const response = await page.goto(resolveUrl(path), {
      waitUntil: expectations.waitUntil || "load",
      timeout: 45000,
    });
    pageResult.status = response?.status() ?? null;
    await settle();

    if (expectations.searchOverlay) {
      const clicked = await clickVisible(page, 'button[aria-label="검색"]');
      if (clicked) await new Promise((resolve) => setTimeout(resolve, 250));
      const overlayInputs = await page.$$eval('input[name="q"]', (inputs) => inputs.filter((input) => {
        const rect = input.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
      }).length);
      pageResult.checks.searchButtonClicked = clicked;
      pageResult.checks.searchOverlayInput = overlayInputs >= 1;
      await page.keyboard.press("Escape").catch(() => undefined);
      await page.evaluate(() => {
        const closeButton = Array.from(document.querySelectorAll('button[type="button"]')).find((button) => {
          if (!(button instanceof HTMLElement) || button.textContent?.trim() !== "닫기") return false;
          const rect = button.getBoundingClientRect();
          return rect.width > 0 && rect.height > 0;
        });
        closeButton?.click();
      }).catch(() => undefined);
      await new Promise((resolve) => setTimeout(resolve, 200));
      await page.reload({ waitUntil: expectations.waitUntil || "load", timeout: 45000 });
      await settle();
    }

    if (expectations.mobileMenu) {
      const menuSelector = 'button[aria-label="메뉴 열기/닫기"], button[aria-label="메뉴"], button[aria-label="카테고리 메뉴"], button[aria-label="전체메뉴"]';
      const clicked = await clickVisible(page, menuSelector);
      if (clicked) await new Promise((resolve) => setTimeout(resolve, 350));
      const menuState = await page.evaluate(() => {
        const isVisible = (element) => {
          if (!(element instanceof HTMLElement)) return false;
          const rect = element.getBoundingClientRect();
          const style = window.getComputedStyle(element);
          return rect.width > 0 && rect.height > 0 && style.display !== "none" && style.visibility !== "hidden";
        };
        const trigger = Array.from(document.querySelectorAll('button[aria-label="메뉴 열기/닫기"], button[aria-label="메뉴"], button[aria-label="카테고리 메뉴"], button[aria-label="전체메뉴"]')).find(isVisible);
        const dialog = document.querySelector('[role="dialog"][aria-label="메뉴"]');
        const navigation = document.querySelector('nav[aria-label="모바일 메뉴"]');
        const controlledMenu = trigger?.getAttribute("aria-controls")
          ? document.getElementById(trigger.getAttribute("aria-controls"))
          : null;
        return {
          triggerExpanded: trigger?.getAttribute("aria-expanded") === "true",
          dialogVisible: isVisible(dialog),
          navigationVisible: isVisible(navigation),
          controlledMenuVisible: isVisible(controlledMenu),
        };
      }).catch(() => ({ triggerExpanded: false, dialogVisible: false, navigationVisible: false, controlledMenuVisible: false }));
      pageResult.checks.mobileMenuButton = clicked;
      pageResult.checks.mobileMenuExpanded = menuState.triggerExpanded || menuState.dialogVisible || menuState.navigationVisible || menuState.controlledMenuVisible;
      await page.keyboard.press("Escape").catch(() => undefined);
      await page.evaluate(() => {
        const closeButton = document.querySelector('button[aria-label="메뉴 닫기"]');
        if (closeButton instanceof HTMLElement) {
          closeButton.click();
          return;
        }
        const controlledTrigger = Array.from(document.querySelectorAll('button[aria-controls]')).find((button) =>
          button.getAttribute("aria-expanded") === "true"
        );
        if (controlledTrigger instanceof HTMLElement) controlledTrigger.click();
      }).catch(() => undefined);
      await new Promise((resolve) => setTimeout(resolve, 200));
    }

    if (expectations.publicLayout) await triggerLazyContent(page);
    pageResult.dom = await collectDomState(page);

    if (expectations.search) {
      pageResult.checks.searchInput = pageResult.dom.searchInputs >= 1;
      pageResult.checks.searchButton = pageResult.dom.searchButtons >= 1;
    }

    if (expectations.categories) {
      pageResult.checks.categoryLinks = pageResult.dom.categoryLinks >= 1;
    }

    if (expectations.publicLayout) {
      pageResult.checks.noHorizontalOverflow = pageResult.dom.documentWidth <= pageResult.dom.viewportWidth + 2;
      pageResult.checks.imagesLoaded = pageResult.dom.brokenImages.length === 0;
      pageResult.checks.majorContentNotOverlapping = !pageResult.dom.majorContentOverlap;
    }

    if (expectations.adminLoginGate) {
      pageResult.checks.passwordInput = pageResult.dom.passwordInputs >= 1;
      pageResult.checks.editorNotExposed = pageResult.dom.editorSurfaces === 0;
    }

    if (expectations.registryIndex) {
      const registryState = await page.evaluate(() => ({
        hasTitle: document.body.innerText.includes("Component Registry"),
        openPreviewLinks: document.querySelectorAll('a[href^="/live-preview/"]').length,
        inlinePreviewFrames: document.querySelectorAll("iframe").length,
        failedPreviewText: document.body.innerText.includes("Failed to load component"),
      }));
      pageResult.dom = {
        ...pageResult.dom,
        registryIndex: registryState,
      };
      pageResult.checks.registryIndexTitle = registryState.hasTitle;
      pageResult.checks.registryOpenPreviewLinks = registryState.openPreviewLinks >= 1;
      pageResult.checks.registryNoInlinePreviewFrames = registryState.inlinePreviewFrames === 0;
      pageResult.checks.registryNoFailedPreviewText = !registryState.failedPreviewText;
    }

    const unsafeFrames = validateFrames(pageResult.dom.frames);
    pageResult.checks.iframePolicy = unsafeFrames.length === 0;
    if (unsafeFrames.length > 0) pageResult.unsafeFrames = unsafeFrames;
    const advertisingFrames = pageResult.dom.frames.filter((frame) => isKnownAdvertisingIframeSrc(frame.src));
    if (advertisingFrames.length > 0) {
      pageResult.warnings.push(`Known external advertising frames observed: ${advertisingFrames.length}`);
    }
  } catch (error) {
    pageResult.ok = false;
    pageResult.error = error instanceof Error ? error.message : String(error);
  } finally {
    page.off("console", onConsole);
    page.off("pageerror", onPageError);
    page.off("requestfailed", onRequestFailed);
    page.off("response", onResponse);
  }

  if (pageResult.status && pageResult.status >= 400) pageResult.ok = false;
  if (pageResult.consoleErrors.length || pageResult.pageErrors.length || pageResult.failedRequests.length || pageResult.badResponses.length) {
    pageResult.ok = false;
  }
  if (Object.values(pageResult.checks).some((value) => value === false)) pageResult.ok = false;

  return pageResult;
}

async function checkRegistryQueryRedirect(result) {
  if (!smokeRegistryComponent) {
    result.skipped.push({
      check: "registry query preview redirect",
      reason: "No registry component name was available for redirect smoke.",
    });
    return;
  }

  try {
    const response = await fetch(resolveUrl(`/example/registry?name=${encodeURIComponent(smokeRegistryComponent)}`), {
      redirect: "manual",
      headers: { accept: "text/html" },
      signal: AbortSignal.timeout(5000),
    });
    const location = response.headers.get("location") || "";
    const nextRedirect = response.headers.get("x-nextjs-redirect") || "";
    const expectedPath = `/live-preview/${encodeURIComponent(smokeRegistryComponent)}`;
    const redirectTarget = location || nextRedirect;
    const body = redirectTarget ? "" : await response.text();
    const hasStreamRedirect = body.includes("NEXT_REDIRECT") && body.includes(expectedPath);
    const ok =
      (([301, 302, 303, 307, 308].includes(response.status) || Boolean(nextRedirect)) &&
        redirectTarget.includes(expectedPath)) ||
      hasStreamRedirect;
    result.runtimeChecks.push({
      name: "registry query preview redirect",
      ok,
      status: response.status,
      location,
      nextRedirect,
      hasStreamRedirect,
      expectedPath,
    });
  } catch (error) {
    result.runtimeChecks.push({
      name: "registry query preview redirect",
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

async function runAuthenticatedArticleEditorSmoke(page) {
  const pageResult = await runPage(page, "/cam/articles/new", {});
  pageResult.checks.adminAuthenticated = !page.url().includes("/cam/login");

  if (!pageResult.ok || !pageResult.checks.adminAuthenticated) {
    pageResult.ok = false;
    return pageResult;
  }

  try {
    await page.waitForSelector('[data-rich-editor-surface="true"]', { timeout: 30000 });
    const interaction = await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll("button"));
      const htmlButton = buttons.find((button) => button.textContent?.includes("</>"));
      if (!htmlButton) return { ok: false, reason: "HTML mode button not found" };
      htmlButton.setAttribute("data-smoke-html-mode", "true");
      return { ok: true };
    });
    pageResult.checks.editorHtmlModeButton = interaction.ok;
    if (!interaction.ok) {
      pageResult.ok = false;
      pageResult.error = interaction.reason;
      return pageResult;
    }

    await page.click('[data-smoke-html-mode="true"]');
    await page.waitForSelector('textarea[spellcheck="false"]', { timeout: 10000 });
    await page.click('textarea[spellcheck="false"]');
    await page.keyboard.down("Control");
    await page.keyboard.press("A");
    await page.keyboard.up("Control");
    await page.keyboard.type([
      "<p>Smoke iframe paste</p>",
      '<iframe src="https://www.youtube.com/embed/dQw4w9WgXcQ" sandbox="allow-top-navigation allow-scripts" srcdoc="<p>bad</p>"></iframe>',
      '<iframe src="javascript:alert(1)"></iframe>',
    ].join(""));
    const visualInteraction = await page.evaluate(() => {
      const source = document.querySelector('textarea[spellcheck="false"]');
      const buttons = Array.from(source?.parentElement?.querySelectorAll("button") || []);
      const visualButton = buttons.find((button) => !button.textContent?.includes("</>"));
      if (!visualButton) return false;
      visualButton.setAttribute("data-smoke-visual-mode", "true");
      return true;
    });
    pageResult.checks.editorVisualModeButton = visualInteraction;
    if (!visualInteraction) {
      pageResult.ok = false;
      pageResult.error = "Visual mode button not found";
      return pageResult;
    }

    await page.click('[data-smoke-visual-mode="true"]');
    await page.waitForFunction(() => !document.querySelector('textarea[spellcheck="false"]'), { timeout: 10000 });
    await page.waitForSelector('[data-rich-editor-surface="true"]', { timeout: 20000 });
    await settle();

    const editorState = await page.evaluate(() => {
      const editor = document.querySelector('[data-rich-editor-surface="true"]');
      const frames = Array.from(editor?.querySelectorAll("iframe") || []).map((frame) => ({
        src: frame.getAttribute("src") || "",
        sandbox: frame.getAttribute("sandbox") || "",
        hasSrcdoc: frame.hasAttribute("srcdoc"),
        hasCredentialsInUrl: /^[a-z][a-z0-9+.-]*:\/\//i.test(frame.getAttribute("src") || "") && /\/\/[^/@]+@/.test(frame.getAttribute("src") || ""),
        isJavascriptUrl: /^javascript:/i.test((frame.getAttribute("src") || "").trim()),
      }));
      return {
        editorSurfaces: document.querySelectorAll('[contenteditable="true"], textarea').length,
        iframeCount: frames.length,
        frames,
        html: editor?.innerHTML || "",
      };
    });

    const unsafeFrames = validateFrames(editorState.frames);
    pageResult.dom = {
      ...pageResult.dom,
      authenticatedEditor: {
        editorSurfaces: editorState.editorSurfaces,
        iframeCount: editorState.iframeCount,
        frames: editorState.frames,
      },
    };
    pageResult.checks.editorSurface = editorState.editorSurfaces >= 1;
    pageResult.checks.editorAllowedIframeKept = editorState.iframeCount === 1 && editorState.frames[0]?.src.includes("youtube.com/embed/");
    pageResult.checks.editorUnsafeIframeRemoved = !editorState.html.includes("javascript:alert");
    pageResult.checks.editorIframePolicy = unsafeFrames.length === 0;
    if (unsafeFrames.length > 0) pageResult.unsafeFrames = unsafeFrames;
  } catch (error) {
    pageResult.ok = false;
    pageResult.error = error instanceof Error ? error.message : String(error);
  }

  try {
    await page.evaluate(() => {
      document.querySelectorAll('[data-rich-editor-surface="true"] iframe').forEach((frame) => frame.remove());
      window.addEventListener("beforeunload", (event) => {
        event.stopImmediatePropagation();
      }, { capture: true });
    });
  } catch {
    // Best-effort cleanup so external iframe loads do not affect later page navigation.
  }

  if (Object.values(pageResult.checks).some((value) => value === false)) pageResult.ok = false;
  return pageResult;
}

async function runAuthenticatedPopupEditorSmoke(page) {
  const pageResult = await runPage(page, "/cam/popups", {});
  pageResult.checks.adminAuthenticated = !page.url().includes("/cam/login");

  if (!pageResult.ok || !pageResult.checks.adminAuthenticated) {
    pageResult.ok = false;
    return pageResult;
  }

  try {
    const opened = await page.evaluate(() => {
      const addButton = Array.from(document.querySelectorAll("button")).find((button) => button.textContent?.includes("+"));
      if (!addButton) return false;
      addButton.click();
      return true;
    });
    pageResult.checks.popupAddButton = opened;
    if (!opened) {
      pageResult.ok = false;
      pageResult.error = "Popup add button not found";
      return pageResult;
    }

    await page.waitForSelector("textarea", { timeout: 10000 });
    await page.evaluate(() => {
      const nameInput = Array.from(document.querySelectorAll("input")).find((input) => input.type === "text");
      if (nameInput instanceof HTMLInputElement) {
        nameInput.value = "Smoke popup";
        nameInput.dispatchEvent(new Event("input", { bubbles: true }));
      }
      const textarea = document.querySelector("textarea");
      if (textarea instanceof HTMLTextAreaElement) {
        textarea.value = [
          "<p>Smoke popup preview</p>",
          '<iframe src="https://www.youtube.com/embed/dQw4w9WgXcQ" sandbox="allow-top-navigation allow-scripts" srcdoc="<p>bad</p>"></iframe>',
          '<iframe src="javascript:alert(1)"></iframe>',
        ].join("");
        textarea.dispatchEvent(new Event("input", { bubbles: true }));
      }
    });
    await settle();

    const popupState = await page.evaluate(() => {
      const frames = Array.from(document.querySelectorAll("iframe")).map((frame) => ({
        src: frame.getAttribute("src") || "",
        sandbox: frame.getAttribute("sandbox") || "",
        hasSrcdoc: frame.hasAttribute("srcdoc"),
        hasCredentialsInUrl: /^[a-z][a-z0-9+.-]*:\/\//i.test(frame.getAttribute("src") || "") && /\/\/[^/@]+@/.test(frame.getAttribute("src") || ""),
        isJavascriptUrl: /^javascript:/i.test((frame.getAttribute("src") || "").trim()),
      }));
      return {
        formVisible: Boolean(document.querySelector("textarea")),
        frames,
      };
    });

    const unsafeFrames = validateFrames(popupState.frames);
    pageResult.dom = {
      ...pageResult.dom,
      authenticatedPopupEditor: popupState,
    };
    pageResult.checks.popupFormVisible = popupState.formVisible;
    pageResult.checks.popupIframePolicy = unsafeFrames.length === 0;
    if (unsafeFrames.length > 0) pageResult.unsafeFrames = unsafeFrames;
  } catch (error) {
    pageResult.ok = false;
    pageResult.error = error instanceof Error ? error.message : String(error);
  }

  if (Object.values(pageResult.checks).some((value) => value === false)) pageResult.ok = false;
  return pageResult;
}

async function probeSmokeArticleFixture() {
  if (!shouldEnableSmokeArticleFixture()) return false;
  try {
    const response = await fetch(resolveUrl(smokeArticleFixturePath), {
      signal: AbortSignal.timeout(2500),
    });
    return response.ok;
  } catch {
    return false;
  }
}

async function runPublicArticleEmbedFixtureSmoke(page) {
  const pageResult = await runPage(page, smokeArticleFixturePath, {
    waitUntil: "domcontentloaded",
  });

  if (!pageResult.ok) return pageResult;

  try {
    const fixtureState = await page.evaluate(() => {
      const articleBody = document.querySelector(".article-body");
      const html = articleBody?.innerHTML || "";
      const frames = Array.from(articleBody?.querySelectorAll("iframe") || []).map((frame) => {
        const src = frame.getAttribute("src") || "";
        return {
          src,
          sandbox: frame.getAttribute("sandbox") || "",
          hasSrcdoc: frame.hasAttribute("srcdoc"),
          hasCredentialsInUrl: /^[a-z][a-z0-9+.-]*:\/\//i.test(src) && /\/\/[^/@]+@/.test(src),
          isJavascriptUrl: /^javascript:/i.test(src.trim()),
        };
      });
      return {
        articleBodyPresent: Boolean(articleBody),
        html,
        frameCount: frames.length,
        youtubeFrames: frames.filter((frame) => frame.src.includes("youtube.com/embed/")).length,
        mapFrames: frames.filter((frame) => frame.src.includes("google.com/maps/")).length,
        hasSrcdoc: frames.some((frame) => frame.hasSrcdoc),
        frames,
      };
    });

    const unsafeFrames = validateFrames(fixtureState.frames);
    pageResult.dom = {
      ...pageResult.dom,
      publicArticleEmbedFixture: {
        articleBodyPresent: fixtureState.articleBodyPresent,
        frameCount: fixtureState.frameCount,
        youtubeFrames: fixtureState.youtubeFrames,
        mapFrames: fixtureState.mapFrames,
        hasSrcdoc: fixtureState.hasSrcdoc,
        frames: fixtureState.frames,
      },
    };
    pageResult.checks.articleBodyPresent = fixtureState.articleBodyPresent;
    pageResult.checks.articleFixtureAllowedIframesKept =
      fixtureState.frameCount === 2 && fixtureState.youtubeFrames === 1 && fixtureState.mapFrames === 1;
    pageResult.checks.articleFixtureUnsafeIframesRemoved =
      !fixtureState.html.includes("javascript:alert") &&
      !fixtureState.html.includes("evil.example") &&
      !fixtureState.hasSrcdoc;
    pageResult.checks.articleFixtureIframePolicy = unsafeFrames.length === 0;
    if (unsafeFrames.length > 0) pageResult.unsafeFrames = unsafeFrames;
  } catch (error) {
    pageResult.ok = false;
    pageResult.error = error instanceof Error ? error.message : String(error);
  }

  if (Object.values(pageResult.checks).some((value) => value === false)) pageResult.ok = false;
  return pageResult;
}

async function discoverArticlePath(page) {
  if (explicitArticlePath) return explicitArticlePath;
  await page.goto(resolveUrl("/"), { waitUntil: "load", timeout: 45000 });
  await settle();
  const discoveredPath = await page.evaluate(() => document.querySelector('a[href^="/article/"]')?.getAttribute("href") || "");
  if (discoveredPath) return discoveredPath;
  return (await probeSmokeArticleFixture()) ? smokeArticleFixturePath : "";
}

const result = {
  ok: true,
  baseUrl,
  pages: [],
  runtimeChecks: [],
  skipped: [],
  warnings: [],
};

let serverProcess = null;
let browser = null;

try {
  serverProcess = await maybeStartLocalServer(result);
  browser = await puppeteer.launch({
    headless: "new",
    executablePath: resolveBrowserExecutable(),
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });

  const page = await browser.newPage();
  page.setDefaultTimeout(15000);
  await page.setViewport({ width: 1440, height: 1100, deviceScaleFactor: 1 });
  page.on("dialog", async (dialog) => {
    result.dialogs ??= [];
    result.dialogs.push({ type: dialog.type(), message: dialog.message() });
    await dialog.accept();
  });

  if (publicSiteOnly) {
    let articlePath = "";
    try {
      articlePath = await discoverArticlePath(page);
    } catch (error) {
      result.warnings.push(`Article discovery failed: ${error instanceof Error ? error.message : String(error)}`);
    }
    const viewports = [
      { name: "desktop", width: 1440, height: 1100 },
      { name: "mobile", width: 390, height: 844 },
    ];
    const publicPaths = [
      { path: "/search?q=%EB%89%B4%EC%8A%A4", expectations: { search: true } },
      { path: "/category/%EB%AC%B8%ED%99%94", expectations: {} },
      { path: "/about", expectations: {} },
      { path: "/contact", expectations: {} },
      { path: "/advertising", expectations: {} },
      { path: "/youth-policy", expectations: {} },
    ];
    for (const viewport of viewports) {
      await page.setViewport({ width: viewport.width, height: viewport.height, deviceScaleFactor: 1 });
      result.pages.push(await runPage(page, "/", {
        searchOverlay: true,
        categories: true,
        mobileMenu: viewport.name === "mobile",
        publicLayout: true,
        viewport: viewport.name,
      }));
      for (const entry of publicPaths) {
        result.pages.push(await runPage(page, entry.path, { ...entry.expectations, publicLayout: true, viewport: viewport.name }));
      }
      if (articlePath) {
        result.pages.push(await runPage(page, articlePath, { publicLayout: true, viewport: viewport.name }));
      }
    }
    if (!articlePath) {
      result.skipped.push({
        check: "public article page",
        reason: "No published article link was discoverable from the home page.",
      });
    }
  } else if (adminOpsReadOnly) {
    const adminAuthenticated = await applyAdminSmokeCookie(page, result);
    if (!adminAuthenticated) {
      result.skipped.push({
        check: "read-only admin operations pages",
        reason: "COOKIE_SECRET or SMOKE_ADMIN_AUTH_TOKEN is required; remote auth also requires --allow-remote-admin-auth.",
      });
      result.runtimeChecks.push({ name: "admin read-only authentication", ok: false });
    } else {
      const viewports = blockedSubjectPolicyOnly || editorialLabOnly
        ? [
            { name: "mobile", width: 375, height: 812 },
            { name: "tablet", width: 768, height: 1024 },
            { name: "laptop", width: 1024, height: 900 },
            { name: "desktop", width: 1440, height: 1100 },
          ]
        : [{ name: "desktop", width: 1440, height: 1100 }];
      for (const viewport of viewports) {
        await page.setViewport({ width: viewport.width, height: viewport.height, deviceScaleFactor: 1 });
        for (const adminPath of adminOpsPaths) {
          const pageResult = await runPage(page, adminPath, { viewport: viewport.name });
          pageResult.checks.adminAuthenticated = !page.url().includes("/cam/login");
          pageResult.checks.readOnlyNoMutation = true;
          if (editorialLabOnly) {
            try {
              await page.waitForSelector('[data-editorial-lab="true"]', { timeout: 20000 });
            } catch {
              // The explicit shell check below records a deterministic failure.
            }
            const editorialState = await page.evaluate(() => ({
              shell: Boolean(document.querySelector('[data-editorial-lab="true"]')),
              autoPublishOff: document.querySelector('[data-editorial-lab="true"]')?.getAttribute("data-auto-publish-enabled") === "false",
              horizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
            }));
            pageResult.checks.editorialLabShell = editorialState.shell;
            pageResult.checks.editorialAutoPublishOff = editorialState.autoPublishOff;
            pageResult.checks.editorialNoHorizontalOverflow = !editorialState.horizontalOverflow;
            if (Object.values(pageResult.checks).some((value) => value === false)) pageResult.ok = false;
            if (screenshotDir) {
              fs.mkdirSync(screenshotDir, { recursive: true });
              const screenshotPath = `${screenshotDir}/editorial-lab-${viewport.name}.png`;
              await page.screenshot({ path: screenshotPath, fullPage: true });
              pageResult.screenshot = screenshotPath;
            }
          }
          if (!pageResult.checks.adminAuthenticated) pageResult.ok = false;
          result.pages.push(pageResult);
        }
      }
    }
  } else {
    result.pages.push(await runPage(page, "/", { search: true, categories: true }));
    result.pages.push(await runPage(page, "/search?q=%EB%89%B4%EC%8A%A4", { search: true }));
    result.pages.push(await runPage(page, "/example/registry", { registryIndex: true }));
    await checkRegistryQueryRedirect(result);
    result.pages.push(await runPage(page, "/cam/articles/new", { adminLoginGate: true }));
    result.pages.push(await runPage(page, "/cam/popups", { adminLoginGate: true }));

    const adminAuthenticated = await applyAdminSmokeCookie(page, result);
    if (adminAuthenticated) {
      result.pages.push(await runAuthenticatedArticleEditorSmoke(page));
      result.pages.push(await runAuthenticatedPopupEditorSmoke(page));
      if (adminOpsPages) {
        for (const adminPath of adminOpsPaths) {
          const pageResult = await runPage(page, adminPath, {});
          pageResult.checks.adminAuthenticated = !page.url().includes("/cam/login");
          if (!pageResult.checks.adminAuthenticated) pageResult.ok = false;
          result.pages.push(pageResult);
        }
      }
    } else if (adminOpsPages) {
      result.skipped.push({
        check: "admin operations pages",
        reason: "Admin ops smoke requires COOKIE_SECRET or SMOKE_ADMIN_AUTH_TOKEN and local/explicitly allowed remote auth.",
      });
    }

    let articlePath = "";
    try {
      articlePath = await discoverArticlePath(page);
    } catch (error) {
      result.warnings.push(`Article discovery failed: ${error instanceof Error ? error.message : String(error)}`);
    }
    if (!articlePath) {
      result.skipped.push({
        check: "public article embed page",
        reason: "No /article/ link was discoverable from the local home page. Local DB-backed article API also may be unavailable.",
      });
    } else {
      result.pages.push(
        articlePath === smokeArticleFixturePath
          ? await runPublicArticleEmbedFixtureSmoke(page)
          : await runPage(page, articlePath, {}),
      );
    }

    if (!result.authenticatedAdmin?.attempted) {
      result.skipped.push({
        check: "authenticated admin editor iframe paste",
        reason: "Admin editor requires credentials or a signed smoke cookie. Smoke confirms protected routes show the login gate and do not expose editor surfaces while unauthenticated.",
      });
    }
  }
} finally {
  await browser?.close();
  if (serverProcess) stopProcessTree(serverProcess);
}

result.ok = result.pages.every((page) => page.ok) && result.runtimeChecks.every((check) => check.ok);
if (result.skipped.length > 0) {
  result.warnings.push("Some checks were recorded as skipped. See skipped entries for required credentials or local fixture details.");
}

if (json) {
  console.log(JSON.stringify(result, null, 2));
} else {
  console.log("Browser smoke");
  console.log(`- base URL: ${result.baseUrl}`);
  for (const page of result.pages) {
    console.log(`- ${page.ok ? "PASS" : "FAIL"} ${page.viewport ? `[${page.viewport}] ` : ""}${page.path} (${page.status ?? "no status"})`);
  }
  for (const check of result.runtimeChecks) {
    console.log(`- ${check.ok ? "PASS" : "FAIL"} ${check.name}`);
  }
  for (const skipped of result.skipped) {
    console.log(`- SKIP ${skipped.check}: ${skipped.reason}`);
  }
  for (const warning of result.warnings) console.warn(`WARNING: ${warning}`);
}

process.exit(result.ok ? 0 : 1);
