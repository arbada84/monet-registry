#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const errors = [];

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

function assert(condition, message) {
  if (!condition) {
    errors.push(message);
  }
}

const middleware = read("src/middleware.ts");
const packageJson = JSON.parse(read("package.json"));

const maintenanceFunctionIndex = middleware.indexOf("function isMaintenanceAdminApi");
const maintenanceGuardIndex = middleware.indexOf("isMaintenanceAdminApi(pathname)");
const genericApiGuardIndex = middleware.indexOf('pathname.startsWith("/api/db")');

assert(maintenanceFunctionIndex !== -1, "middleware must define isMaintenanceAdminApi().");
assert(
  /pathname\.startsWith\("\/api\/admin\/fix-"\)/.test(middleware),
  "isMaintenanceAdminApi() must include /api/admin/fix-* routes.",
);
assert(
  /pathname\.startsWith\("\/api\/admin\/migrate-"\)/.test(middleware),
  "isMaintenanceAdminApi() must include /api/admin/migrate-* routes.",
);
assert(
  /process\.env\.MAINTENANCE_API_ENABLED\s*!==\s*"true"/.test(middleware),
  "maintenance admin APIs must default to disabled unless MAINTENANCE_API_ENABLED=true.",
);
assert(
  /NextResponse\.json\(\{\s*success:\s*false,\s*error:\s*"Not found"\s*\},\s*\{\s*status:\s*404\s*\}\)/s.test(middleware),
  "disabled maintenance admin APIs must return a 404-style response.",
);
assert(
  maintenanceGuardIndex !== -1 && genericApiGuardIndex !== -1 && maintenanceGuardIndex < genericApiGuardIndex,
  "maintenance admin API guard must run before the generic authenticated API guard.",
);

const requiredRoutes = [
  "src/app/api/admin/fix-canonical-url/route.ts",
  "src/app/api/admin/fix-categories/route.ts",
  "src/app/api/admin/fix-external-images/route.ts",
  "src/app/api/admin/fix-thumbnail-dup/route.ts",
  "src/app/api/admin/migrate-categories/route.ts",
  "src/app/api/admin/migrate-comments/route.ts",
  "src/app/api/admin/migrate-no/route.ts",
];

for (const route of requiredRoutes) {
  assert(fs.existsSync(path.join(root, route)), `${route} must remain covered by the maintenance guard list.`);
}

assert(
  packageJson.scripts?.["check:maintenance-admin"] === "node scripts/check-maintenance-admin-guard.mjs",
  "package.json must expose check:maintenance-admin.",
);
assert(
  packageJson.scripts?.["ci:all"]?.includes("check:maintenance-admin"),
  "ci:all must include check:maintenance-admin.",
);

if (errors.length > 0) {
  console.error("Maintenance admin API guard check failed:");
  for (const error of errors) {
    console.error(`- ${error}`);
  }
  process.exit(1);
}

console.log("Maintenance admin API guard check passed.");
