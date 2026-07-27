import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { afterEach, describe, expect, it } from "vitest";

const tempDirs: string[] = [];

function runCheck(env: NodeJS.ProcessEnv) {
  return spawnSync(process.execPath, ["scripts/deploy-culturepeople-vercel.mjs", "--check-token"], {
    cwd: process.cwd(),
    env,
    encoding: "utf8",
  });
}

describe("CulturePeople Vercel deploy token discovery", () => {
  afterEach(() => {
    for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
  });

  it("uses the explicit process environment without printing the token", () => {
    const token = "explicit-secret-token";
    const result = runCheck({
      ...process.env,
      CULTUREPEOPLE_VERCEL_TOKEN: token,
      CULTUREPEOPLE_VERCEL_ENV_FILE: path.join(tmpdir(), "missing-culturepeople-vercel.env"),
    });

    expect(result.status).toBe(0);
    expect(result.stdout).toContain("Token source: process environment");
    expect(result.stdout).toContain("Token state: set");
    expect(`${result.stdout}${result.stderr}`).not.toContain(token);
  });

  it("falls back to the project-specific secure env file", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "culturepeople-vercel-test-"));
    tempDirs.push(dir);
    const envFile = path.join(dir, "vercel.env");
    const token = "file-secret-token";
    writeFileSync(envFile, `CULTUREPEOPLE_VERCEL_TOKEN=${token}\n`, { mode: 0o600 });
    const env: NodeJS.ProcessEnv = { ...process.env, CULTUREPEOPLE_VERCEL_ENV_FILE: envFile };
    delete env.CULTUREPEOPLE_VERCEL_TOKEN;

    const result = runCheck(env);

    expect(result.status).toBe(0);
    expect(result.stdout).toContain("Token source: project secure env file");
    expect(result.stdout).toContain("Token state: set");
    expect(`${result.stdout}${result.stderr}`).not.toContain(token);
  });

  it("passes the token through the child environment instead of command arguments", () => {
    const source = readFileSync("scripts/deploy-culturepeople-vercel.mjs", "utf8");

    expect(source).toContain("VERCEL_TOKEN: token");
    expect(source).not.toContain("`--token=${token}`");
  });
});
