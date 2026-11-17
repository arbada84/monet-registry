import { execFileSync } from "node:child_process";
import { describe, expect, it, vi } from "vitest";
import { executeSteps, runStep } from "../../scripts/predeploy-ops-check.mjs";

describe("predeploy operations execution", () => {
  const steps = [
    { name: "first", required: true, command: process.execPath, args: [] },
    { name: "second", required: true, command: process.execPath, args: [] },
  ];
  const failure = {
    name: "first", required: true, command: "fixture", status: 1, state: "failed",
    failure: null, ok: false, durationMs: 0, stdoutPreview: "", stderrPreview: "",
  };

  it("does not report an unexecuted plan as verified", () => {
    const report = JSON.parse(execFileSync(process.execPath,
      ["scripts/predeploy-ops-check.mjs", "--dry-run", "--json"], { encoding: "utf8" }));
    expect(report).toMatchObject({ ok: null, state: "planned", mode: "dry-run" });
    expect(report.steps.every((step: { state: string }) => step.state === "planned")).toBe(true);
  });

  it("stops after a required failure", () => {
    const runner = vi.fn(() => failure);
    const results = executeSteps(steps, 1000, runner);
    expect(runner).toHaveBeenCalledTimes(1);
    expect(results[1]).toMatchObject({ state: "skipped", ok: null });
  });

  it("continues after an optional failure", () => {
    const runner = vi.fn(() => failure);
    executeSteps([{ ...steps[0], required: false }, steps[1]], 1000, runner);
    expect(runner).toHaveBeenCalledTimes(2);
  });

  it("terminates a real hanging child", () => {
    const result = runStep({ ...steps[0], args: ["-e", "setInterval(() => {}, 1000)"] }, 100);
    expect(result).toMatchObject({ ok: false, state: "failed", failure: "ETIMEDOUT" });
  });

  it("rejects invalid limits before running any checks", () => {
    expect(() => execFileSync(process.execPath,
      ["scripts/predeploy-ops-check.mjs", "--timeout-ms=0"], { stdio: "pipe" })).toThrow();
  });
});
