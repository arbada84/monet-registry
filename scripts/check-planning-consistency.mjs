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
    /^(Planned|In Progress|Complete|Shipped)$/.test(stateStatus || ""),
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
    if (stateStatus === "Complete" || stateStatus === "Shipped") {
      assert(
        new RegExp(`- \\[x\\] \\*\\*${id}\\*\\*`).test(requirements),
        `${id} checklist item must be marked complete when v3.0 is complete or shipped.`,
      );
      assert(
        new RegExp(`\\| ${id} \\| (Setup|Phase \\d+) \\| Complete \\|`).test(requirements),
        `${id} traceability row must be Complete when v3.0 is complete or shipped.`,
      );
      continue;
    }

    assert(
      new RegExp(`\\| ${id} \\| (Setup|Phase \\d+) \\| (Complete|Pending) \\|`).test(requirements),
      `${id} traceability row must exist in .planning/REQUIREMENTS.md.`,
    );
  }

  if (stateStatus === "Complete" || stateStatus === "Shipped") {
    assert(
      /### v3\.0 Auto-Press Operations And Queue Reliability - (Complete|Shipped)/.test(roadmap),
      ".planning/ROADMAP.md must show v3.0 as complete or shipped when the state is complete/shipped.",
    );
    assert(
      /\[x\] \*\*v3\.0 Auto-press operations and queue reliability\*\*[^\n]*(completed|shipped) 2026-05-25/.test(
        roadmap,
      ),
      ".planning/ROADMAP.md must mark the v3.0 milestone complete or shipped.",
    );
  } else {
    assert(
      roadmap.includes("### v3.0 Auto-Press Operations And Queue Reliability - In Progress"),
      ".planning/ROADMAP.md must show v3.0 as the active milestone.",
    );
  }

  assert(
    /\[[ x]\] 15-01-PLAN\.md/.test(roadmap),
    "Phase 15 plan must be listed in .planning/ROADMAP.md.",
  );

  if (stateStatus === "Complete" || stateStatus === "Shipped") {
    const v3PlanFiles = [
      "15-01-PLAN.md",
      "16-01-PLAN.md",
      "16-02-PLAN.md",
      "17-01-PLAN.md",
      "17-02-PLAN.md",
      "17-03-PLAN.md",
      "18-01-PLAN.md",
      "18-02-PLAN.md",
      "19-01-PLAN.md",
      "19-02-PLAN.md",
    ];

    for (const planFile of v3PlanFiles) {
      assert(
        roadmap.includes(`[x] ${planFile}`),
        `${planFile} must be checked when v3.0 is complete.`,
      );
    }
  }
}

if (currentMilestone === "v4.0") {
  const v4RequirementIds = [
    "SMTP-01",
    "SMTP-02",
    "SMTP-03",
    "SMTP-04",
  ];

  for (const id of v4RequirementIds) {
    assert(
      new RegExp(`\\*\\*${id}\\*\\*`).test(requirements),
      `${id} must be listed in .planning/REQUIREMENTS.md for v4.0.`,
    );
    assert(
      new RegExp(`\\| ${id} \\| Phase \\d+ \\| (Complete|Pending) \\|`).test(requirements),
      `${id} traceability row must exist in .planning/REQUIREMENTS.md.`,
    );
  }

  if (stateStatus === "In Progress") {
    assert(
      roadmap.includes("### v4.0 SMTP Credential Hardening - In Progress"),
      ".planning/ROADMAP.md must show v4.0 as the active milestone.",
    );
    assert(
      /\[ \] \*\*v4\.0 SMTP credential hardening\*\*[^\n]*started 2026-05-25/.test(roadmap),
      ".planning/ROADMAP.md must mark v4.0 as started while active.",
    );
  }

  for (const planFile of ["20-01-PLAN.md", "20-02-PLAN.md"]) {
    assert(
      roadmap.includes(`[ ] ${planFile}`) || roadmap.includes(`[x] ${planFile}`),
      `${planFile} must be listed in .planning/ROADMAP.md.`,
    );
  }

  if (stateStatus === "Complete") {
    assert(
      roadmap.includes("[x] **v4.0 SMTP credential hardening**"),
      ".planning/ROADMAP.md must check v4.0 when STATE is complete.",
    );
    assert(
      roadmap.includes("### v4.0 SMTP Credential Hardening - Complete"),
      ".planning/ROADMAP.md must show v4.0 as complete when STATE is complete.",
    );
    for (const planFile of ["20-01-PLAN.md", "20-02-PLAN.md"]) {
      assert(
        roadmap.includes(`[x] ${planFile}`),
        `${planFile} must be checked when v4.0 is complete.`,
      );
    }
    for (const id of v4RequirementIds) {
      assert(
        new RegExp(`\\| ${id} \\| Phase \\d+ \\| Complete \\|`).test(requirements),
        `${id} traceability row must be complete when v4.0 is complete.`,
      );
    }
    assert(
      requirements.includes("v4.0 requirements: 4 total, 4 complete, 0 pending"),
      ".planning/REQUIREMENTS.md must show v4.0 fully complete when STATE is complete.",
    );
  }
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
