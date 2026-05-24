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
  /\[x\] \*\*v2\.0 Operational optimization and code quality\*\*[^\n]*completed 2026-05-21/.test(roadmap),
  "v2.0 milestone must remain marked complete in .planning/ROADMAP.md.",
);
assert(
  !roadmap.includes("**Plans**: TBD"),
  "Completed v2.0 phases must list concrete plans instead of TBD.",
);

const currentMilestone = state.match(/^milestone:\s*(.+)$/m)?.[1]?.trim();
const stateStatus = state.match(/^status:\s*(.+)$/m)?.[1]?.trim();
if (currentMilestone === "v2.0") {
  assert(
    stateStatus === "Complete",
    ".planning/STATE.md must mark the v2.0 milestone status as Complete.",
  );
} else {
  assert(
    /^(Planned|In Progress|Complete)$/.test(stateStatus || ""),
    ".planning/STATE.md must use a valid milestone status.",
  );
}

if (currentMilestone === "v3.0") {
  const v3RequirementIds = [
    "DEV-01",
    "AUTO-01",
    "AUTO-02",
    "AUTO-03",
    "AUTO-04",
    "AUTO-05",
    "AUTO-06",
    "AUTO-07",
    "AUTO-08",
    "AUTO-09",
    "OPS-01",
    "QA-01",
  ];

  for (const id of v3RequirementIds) {
    assert(
      new RegExp(`\\*\\*${id}\\*\\*`).test(requirements),
      `${id} must be listed in .planning/REQUIREMENTS.md for v3.0.`,
    );
    assert(
      new RegExp(`\\| ${id} \\| (Setup|Phase \\d+) \\| (Complete|Pending) \\|`).test(requirements),
      `${id} traceability row must exist in .planning/REQUIREMENTS.md.`,
    );
  }

  assert(
    roadmap.includes("### v3.0 Auto-Press Operations And Queue Reliability - In Progress"),
    ".planning/ROADMAP.md must show v3.0 as the active milestone.",
  );
  assert(
    /\[[ x]\] 15-01-PLAN\.md/.test(roadmap),
    "Phase 15 plan must be listed in .planning/ROADMAP.md.",
  );
}

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
