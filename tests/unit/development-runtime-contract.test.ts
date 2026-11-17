import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (file: string) => readFileSync(file, "utf8");

describe("development runtime contract", () => {
  it("keeps local, CI and screenshot runtime on Node 24", () => {
    expect(JSON.parse(read("package.json")).engines.node).toBe("24.x");
    expect(read(".nvmrc").trim()).toBe("24");
    for (const workflow of ["ci.yml", "crawl-newswire.yml"]) {
      expect(read(`.github/workflows/${workflow}`)).toMatch(/node-version: 24\b/);
    }
    expect(read("docker/screenshot/Dockerfile")).toMatch(/^FROM node:24-slim\b/);
    expect(read("docker/screenshot/Dockerfile")).toContain("ENV PUPPETEER_SKIP_DOWNLOAD=true");
  });

  it("uses the supported headless option without weakening smoke guards", () => {
    const source = read("scripts/browser-smoke.mjs");
    expect(source).toContain("headless: true");
    expect(source).not.toContain('headless: "new"');
    expect(source).toContain("installReadOnlyGuard");
    expect(source).toContain("serverUploadRequests");
  });

  it("runs the registry CLI through Node on noexec source mounts", () => {
    expect(JSON.parse(read("package.json")).scripts["registry:build:full"])
      .toBe("pnpm registry:generate && node node_modules/shadcn/dist/index.js build");
  });
});
