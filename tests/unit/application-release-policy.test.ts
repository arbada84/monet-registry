import { describe, expect, it } from "vitest";
import { classifyApplicationChanges, assertUnchangedBuildHooks, verifyCandidate, hasSuccessfulSourceCi, legalStatusMarkers } from "../../scripts/lib/application-release-policy.mjs";

describe("application release profile", () => {
  it("allows application changes without pretending to deploy Worker source", () => {
    expect(classifyApplicationChanges(["src/app/page.tsx", "cloudflare/auto-press-worker/src/index.js"])).toMatchObject({ ok: true, workerSourceOnly: ["cloudflare/auto-press-worker/src/index.js"] });
  });
  it.each(["cloudflare/d1/migrations/001.sql", "ops/desktop-backup/runtime.py", "src/lib/database-provider.ts", ".env.local", "output/report.json", "public/leak.gpg"])("rejects data/private path %s", path => {
    expect(classifyApplicationChanges([path]).ok).toBe(false);
  });
  it("rejects empty changes and unreviewed build hooks", () => {
    expect(classifyApplicationChanges([]).ok).toBe(false);
    expect(() => assertUnchangedBuildHooks({ scripts: { build: "next build" } }, { scripts: { build: "next build && deploy-worker" } })).toThrow();
  });
  it("requires the exact production artifact and source", () => {
    const candidate = { readyState: "READY", target: "production", projectId: "p", meta: { gitCommitSha: "s", gitDirty: "0" } };
    expect(verifyCandidate(candidate, { sha: "s", projectId: "p" })).toBe(true);
    expect(verifyCandidate({ ...candidate, target: "preview" }, { sha: "s", projectId: "p" })).toBe(false);
    expect(verifyCandidate(candidate, { sha: "other", projectId: "p" })).toBe(false);
    expect(verifyCandidate({ ...candidate, meta: { ...candidate.meta, gitDirty: "1" } }, { sha: "s", projectId: "p" })).toBe(false);
  });
  it("does not accept other-SHA or failed CI", () => {
    const run = { id: 1, head_sha: "s", name: "CI", status: "completed", conclusion: "success" };
    expect(hasSuccessfulSourceCi([run], "s")).toBe(true);
    expect(hasSuccessfulSourceCi([run], "other")).toBe(false);
    expect(hasSuccessfulSourceCi([run, { ...run, id: 2, conclusion: "failure" }], "s")).toBe(false);
  });
  it("keeps missing legal status visible for baseline comparisons", () => {
    expect(legalStatusMarkers('<div data-privacy-legal-status="missing">')).toEqual(['data-privacy-legal-status="missing"']);
  });
  it("requires separate review for schedules, workflows and Worker bindings", () => {
    for (const file of ["vercel.json", ".github/workflows/deploy.yml", "cloudflare/auto-press-worker/wrangler.toml"]) expect(classifyApplicationChanges([file], { allowCiWorkflow: true }).ok).toBe(false);
    expect(classifyApplicationChanges([".github/workflows/ci.yml"]).ok).toBe(false);
    expect(classifyApplicationChanges([".github/workflows/ci.yml"], { allowCiWorkflow: true }).ok).toBe(true);
  });
});
