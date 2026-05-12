#!/usr/bin/env node
import { execFileSync } from "node:child_process";

const args = new Set(process.argv.slice(2));
const base = getArgValue("--base") || "origin/main";
const json = args.has("--json") || getArgValue("--format") === "json";
const markdown = args.has("--markdown") || getArgValue("--format") === "markdown";
const failOnUnmatched = args.has("--fail-on-unmatched");

function getArgValue(name) {
  const prefix = `${name}=`;
  const match = process.argv.slice(2).find((arg) => arg.startsWith(prefix));
  return match ? match.slice(prefix.length) : "";
}

function git(args) {
  return execFileSync("git", args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
}

function lines(text) {
  return text ? text.split(/\r?\n/).filter(Boolean) : [];
}

const groups = [
  {
    id: "change-packaging",
    label: "Change Packaging And Review Aids",
    risk: "low",
    deployable: false,
    patterns: [/^scripts\/change-group-report\.mjs$/],
  },
  {
    id: "browser-smoke-harness",
    label: "Browser Smoke Harness",
    risk: "medium",
    deployable: true,
    patterns: [/^scripts\/browser-smoke\.mjs$/, /^src\/app\/smoke\/article-embed\//],
  },
  {
    id: "build-warning-analysis",
    label: "Build Warning Analysis",
    risk: "low",
    deployable: true,
    patterns: [
      /^scripts\/analyze-webpack-cache-warnings\.mjs$/,
      /^scripts\/generate-live-preview-buckets\.mjs$/,
      /^src\/app\/live-preview-render\//,
      /^src\/app\/page-live-preview-render\//,
      /^src\/generated\/live-preview-buckets\//,
      /^src\/generated\/page-live-preview\//,
      /^src\/app\/example\/registry\//,
      /^src\/app\/live-preview\//,
      /^src\/app\/page-live-preview\//,
      /^src\/app\/api\/mail\/detail\/route\.ts$/,
      /^src\/app\/cam\/dashboard\/DashboardHistoryChart\.tsx$/,
    ],
  },
  {
    id: "deploy-safety",
    label: "Deployment Safety",
    risk: "medium",
    deployable: true,
    patterns: [/^\.gitignore$/, /^scripts\/predeploy-safety-check\.mjs$/],
  },
  {
    id: "dependencies",
    label: "Dependency And CI Harness",
    risk: "high",
    deployable: true,
    patterns: [/^package\.json$/, /^pnpm-lock\.yaml$/, /^vitest\.config\.mts$/, /^tests\//],
  },
  {
    id: "automation-operational",
    label: "Automation Operational Guard",
    risk: "high",
    deployable: true,
    patterns: [
      /^vercel\.json$/,
      /^scripts\/check-automation-schedules\.mjs$/,
      /^src\/lib\/auto-defaults\.ts$/,
      /^src\/app\/api\/cron\/auto-news\/route\.ts$/,
      /^src\/app\/api\/cron\/auto-press\/route\.ts$/,
    ],
  },
  {
    id: "security-runtime",
    label: "Security Runtime Guardrails",
    risk: "high",
    deployable: true,
    patterns: [
      /^next\.config\.ts$/,
      /^src\/middleware\.ts$/,
      /^src\/lib\/redis\.ts$/,
      /^src\/lib\/safe-remote-url\.ts$/,
      /^src\/lib\/fetch-retry\.ts$/,
      /^src\/lib\/server-upload-image\.ts$/,
      /^src\/lib\/watermark\.ts$/,
      /^src\/app\/api\/auth\//,
      /^src\/app\/api\/ai\//,
      /^src\/app\/api\/upload\//,
      /^src\/app\/api\/netpro\//,
      /^src\/app\/api\/press-feed\//,
      /^src\/app\/api\/cron\//,
      /^src\/app\/api\/admin\//,
    ],
  },
  {
    id: "content-safety",
    label: "Content And Embed Safety",
    risk: "high",
    deployable: true,
    patterns: [
      /^src\/lib\/comment-sanitize\.ts$/,
      /^src\/lib\/article-html-sanitize\.ts$/,
      /^src\/lib\/html-embed-safety\.ts$/,
      /^src\/app\/api\/db\/comments\//,
      /^src\/app\/article\/\[id\]\/components\/ArticleBody\.tsx$/,
      /^src\/components\/RichEditor\.tsx$/,
      /^src\/components\/ui\/PopupRenderer\.tsx$/,
    ],
  },
  {
    id: "service-performance",
    label: "Service Query And Feed Performance",
    risk: "medium",
    deployable: true,
    patterns: [
      /^src\/lib\/db-server\.ts$/,
      /^src\/lib\/supabase-server-db\.ts$/,
      /^src\/app\/page\.tsx$/,
      /^src\/app\/feed\.json\//,
      /^src\/app\/api\/rss\//,
      /^src\/app\/api\/v1\/articles\//,
      /^src\/app\/api\/db\/articles\/sidebar\//,
      /^src\/app\/reporter\//,
      /^src\/app\/api\/og\//,
    ],
  },
  {
    id: "public-runtime",
    label: "Public Runtime Cleanup",
    risk: "medium",
    deployable: true,
    patterns: [
      /^src\/app\/providers\.tsx$/,
      /^src\/app\/api\/coupang\//,
      /^src\/app\/search\/components\/SearchContent\.tsx$/,
      /^src\/components\/registry\/culturepeople-header-0\//,
      /^src\/components\/themes\/culturepeople\/CulturePeopleHeader\.tsx$/,
      /^src\/components\/themes\/insightkorea\/InsightKoreaHeader\.tsx$/,
      /^src\/components\/ui\/screenshot\.tsx$/,
    ],
  },
  {
    id: "admin-image-cleanup",
    label: "Admin Image Warning Cleanup",
    risk: "low",
    deployable: true,
    patterns: [
      /^src\/components\/ui\/AdminPreviewImage\.tsx$/,
      /^src\/components\/ImageSearchPanel\.tsx$/,
      /^src\/app\/cam\/accounts\//,
      /^src\/app\/cam\/articles\//,
      /^src\/app\/cam\/headlines\//,
      /^src\/app\/cam\/mail-press\//,
      /^src\/app\/cam\/settings\//,
    ],
  },
  {
    id: "article-client-compatibility",
    label: "Article Client API Compatibility",
    risk: "medium",
    deployable: true,
    patterns: [
      /^src\/app\/cam\/analytics\/page\.tsx$/,
      /^src\/app\/cam\/dashboard\/page\.tsx$/,
      /^src\/app\/cam\/distribute\/page\.tsx$/,
      /^src\/components\/registry\/culturepeople-category-news-3\/index\.tsx$/,
      /^src\/components\/registry\/culturepeople-news-grid-2\/index\.tsx$/,
      /^src\/components\/registry\/culturepeople-text-links-4\/index\.tsx$/,
    ],
  },
  {
    id: "generated-version-artifact",
    label: "Version Artifact Policy",
    risk: "low",
    deployable: true,
    patterns: [/^src\/config\/version\.json$/, /^scripts\/generate-version\.mjs$/],
  },
  {
    id: "preexisting-or-adjacent",
    label: "Pre-existing Or Adjacent Admin Changes",
    risk: "review",
    deployable: false,
    patterns: [
      /^src\/app\/cam\/analytics\//,
      /^src\/app\/cam\/dashboard\//,
      /^src\/app\/cam\/distribute\//,
      /^src\/components\/registry\/culturepeople-category-news-3\//,
      /^src\/components\/registry\/culturepeople-news-grid-2\//,
      /^src\/components\/registry\/culturepeople-text-links-4\//,
      /^src\/config\/version\.json$/,
    ],
  },
];

const tracked = lines(git(["diff", "--name-only", base]));
const untracked = lines(git(["ls-files", "--others", "--exclude-standard"]));
const allFiles = [...new Set([...tracked, ...untracked])].sort();
const grouped = Object.fromEntries(
  groups.map((group) => [
    group.id,
    {
      label: group.label,
      risk: group.risk,
      deployable: group.deployable,
      files: [],
    },
  ])
);
const unmatched = [];
const localOnlyArtifacts = allFiles.filter((file) => file.startsWith(".planning/") || file.startsWith(".agents/"));

for (const file of allFiles) {
  const group = groups.find((candidate) => candidate.patterns.some((pattern) => pattern.test(file)));
  if (group) {
    grouped[group.id].files.push(file);
  } else {
    unmatched.push(file);
  }
}

const reviewOrder = groups
  .filter((group) => grouped[group.id].files.length > 0)
  .map((group) => group.id);
const warnings = [];

if (unmatched.length > 0) {
  warnings.push("Some changed files are not assigned to a review/deploy group.");
}
if (localOnlyArtifacts.length > 0) {
  warnings.push("Local-only .agents/ or .planning/ artifacts are present in the git-visible file set.");
}
if (grouped["preexisting-or-adjacent"].files.length > 0) {
  warnings.push("Pre-existing or adjacent admin changes should be reviewed separately before deployment.");
}
if (grouped["generated-version-artifact"].files.length > 0) {
  warnings.push(
    "Version artifact changes are intentional only when refreshing the tracked admin UI version; default builds preserve the existing file."
  );
}

const report = {
  generatedAt: new Date().toISOString(),
  base,
  totals: {
    files: allFiles.length,
    tracked: tracked.length,
    untracked: untracked.length,
    unmatched: unmatched.length,
    localOnlyArtifacts: localOnlyArtifacts.length,
  },
  reviewOrder,
  groups: grouped,
  unmatched,
  localOnlyArtifacts,
  warnings,
};

function renderMarkdown(report) {
  const lines = [
    "# Change Group Report",
    "",
    `Generated: ${report.generatedAt}`,
    `Base: ${report.base}`,
    `Total files: ${report.totals.files} (${report.totals.tracked} tracked, ${report.totals.untracked} untracked)`,
    `Unmatched files: ${report.totals.unmatched}`,
    `Local-only artifacts: ${report.totals.localOnlyArtifacts}`,
    "",
    "## Recommended Review Order",
    "",
  ];

  for (const id of report.reviewOrder) {
    const group = report.groups[id];
    lines.push(`- ${group.label} (${id}): ${group.files.length} files, risk ${group.risk}`);
  }

  for (const [id, group] of Object.entries(report.groups)) {
    lines.push("", `## ${group.label}`, "", `ID: ${id}`, `Risk: ${group.risk}`, `Deployable: ${group.deployable}`);
    if (group.files.length === 0) {
      lines.push("", "- No files.");
      continue;
    }
    lines.push("");
    for (const file of group.files) lines.push(`- \`${file}\``);
  }

  if (report.unmatched.length > 0) {
    lines.push("", "## Unmatched", "");
    for (const file of report.unmatched) lines.push(`- \`${file}\``);
  }

  if (report.warnings.length > 0) {
    lines.push("", "## Warnings", "");
    for (const warning of report.warnings) lines.push(`- ${warning}`);
  }

  return lines.join("\n");
}

if (json) {
  console.log(JSON.stringify(report, null, 2));
} else if (markdown) {
  console.log(renderMarkdown(report));
} else {
  console.log(`Change group report against ${report.base}`);
  console.log(`Total files: ${report.totals.files} (${report.totals.tracked} tracked, ${report.totals.untracked} untracked)`);
  for (const [id, group] of Object.entries(report.groups)) {
    console.log(`\n[${id}] ${group.label} (${group.files.length}, risk ${group.risk})`);
    for (const file of group.files) console.log(`- ${file}`);
  }
  if (report.unmatched.length) {
    console.log(`\n[unmatched] Needs manual classification (${report.unmatched.length})`);
    for (const file of report.unmatched) console.log(`- ${file}`);
  }
  for (const warning of report.warnings) console.warn(`WARNING: ${warning}`);
}

if (failOnUnmatched && (report.unmatched.length > 0 || report.localOnlyArtifacts.length > 0)) {
  process.exit(1);
}
