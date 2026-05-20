#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const errors = [];

function readText(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

function assert(condition, message) {
  if (!condition) {
    errors.push(message);
  }
}

const requirements = readText(".planning/REQUIREMENTS.md");
const roadmap = readText(".planning/ROADMAP.md");
const state = readText(".planning/STATE.md");

const completedRequirementIds = [
  "PERF-01",
  "PERF-02",
  "PERF-03",
  "SEC-01",
  "SEC-02",
  "SEC-03",
  "CLEAN-01",
  "CLEAN-02",
  "CLEAN-03",
  "CLEAN-04",
  "TEST-01",
  "TEST-02",
  "QUAL-01",
  "QUAL-02",
  "FEAT-01",
  "FEAT-02",
  "FEAT-03",
];

for (const id of completedRequirementIds) {
  assert(
    new RegExp(`- \\[x\\] \\*\\*${id}\\*\\*`).test(requirements),
    `${id} checklist item must be marked complete in .planning/REQUIREMENTS.md`,
  );
  assert(
    new RegExp(`\\| ${id} \\| Phase \\d+ \\| Complete \\|`).test(requirements),
    `${id} traceability row must be Complete in .planning/REQUIREMENTS.md`,
  );
}

const completedPlanFiles = [
  "10-01-PLAN.md",
  "10-02-PLAN.md",
  "10-03-PLAN.md",
  "11-01-PLAN.md",
  "11-02-PLAN.md",
  "11-03-PLAN.md",
  "12-01-PLAN.md",
  "12-02-PLAN.md",
  "12-03-PLAN.md",
  "12-04-PLAN.md",
  "13-01-PLAN.md",
  "13-02-PLAN.md",
  "13-03-PLAN.md",
  "13-04-PLAN.md",
  "14-01-PLAN.md",
];

for (const planFile of completedPlanFiles) {
  assert(
    roadmap.includes(`[x] ${planFile}`),
    `${planFile} must be checked in .planning/ROADMAP.md`,
  );
}

assert(
  !/v2\.0[^\n]*(?:in progress|In Progress)/.test(roadmap),
  "v2.0 milestone must not be marked as in progress after Phase 14 completion.",
);
assert(
  !roadmap.includes("**Plans**: TBD"),
  "Completed v2.0 phases must list concrete plans instead of TBD.",
);
assert(
  /status:\s*Complete/.test(state),
  ".planning/STATE.md must mark the v2.0 milestone status as Complete.",
);

const totalPlans = Number(state.match(/total_plans:\s*(\d+)/)?.[1]);
const completedPlans = Number(state.match(/completed_plans:\s*(\d+)/)?.[1]);
assert(
  Number.isFinite(totalPlans) && Number.isFinite(completedPlans),
  ".planning/STATE.md must include numeric total_plans and completed_plans.",
);
assert(
  completedPlans <= totalPlans,
  ".planning/STATE.md completed_plans must not exceed total_plans.",
);

if (errors.length > 0) {
  console.error("Planning consistency check failed:");
  for (const error of errors) {
    console.error(`- ${error}`);
  }
  process.exit(1);
}

console.log("Planning consistency check passed.");
