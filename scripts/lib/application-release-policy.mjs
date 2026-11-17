const DATA_PATHS = /^(?:cloudflare\/d1\/|supabase\/migrations\/|ops\/desktop-backup\/|src\/lib\/(?:db-server|d1-server-db|supabase-server-db|database-provider|site-settings-store)\.ts$)/;
const PRIVATE_PATHS = /(?:^|\/)(?:\.env(?:\.|$)|[^/]*\.(?:sqlite3?|db|gpg|pem|key|zip|tgz|tar(?:\.\w+)?|zst|gz|bak|p12)$)|^(?:output|backups|\.migration)\//i;

export function classifyApplicationChanges(files, { allowCiWorkflow = false } = {}) {
  const data = files.filter(file => DATA_PATHS.test(file) || /\.sql$/i.test(file));
  const privateFiles = files.filter(file => PRIVATE_PATHS.test(file));
  const configuration = files.filter(file => file === "vercel.json" || file.startsWith(".github/workflows/") || /^cloudflare\/.*wrangler\./.test(file));
  const blockedConfiguration = configuration.filter(file => !(allowCiWorkflow && file === ".github/workflows/ci.yml"));
  return { ok: files.length > 0 && data.length === 0 && privateFiles.length === 0 && blockedConfiguration.length === 0,
    data, privateFiles, configuration, blockedConfiguration, workerSourceOnly: files.filter(file => file.startsWith("cloudflare/") && !DATA_PATHS.test(file)) };
}

export function assertUnchangedBuildHooks(before, after) {
  for (const hook of ["preinstall", "install", "postinstall", "prepare", "prebuild", "build", "postbuild", "build:vercel"]) {
    if (before.scripts?.[hook] !== after.scripts?.[hook]) throw new Error(`Build hook changed: ${hook}; separate release review required`);
  }
}

export function verifyCandidate(deployment, { sha, projectId }) {
  const clean = ["0", 0, false].includes(deployment.meta?.gitDirty) || deployment.source === "git";
  return deployment.readyState === "READY" && deployment.target === "production" && deployment.projectId === projectId
    && clean && !["1", 1, true].includes(deployment.meta?.gitDirty)
    && (deployment.meta?.gitCommitSha || deployment.meta?.githubCommitSha) === sha;
}

export function hasSuccessfulSourceCi(runs, sha) {
  const run = runs.filter(run => run.head_sha === sha && run.name === "CI").sort((a, b) => b.id - a.id)[0];
  return Boolean(run && run.status === "completed" && run.conclusion === "success");
}

export function legalStatusMarkers(html) {
  return [...String(html).matchAll(/data-[\w-]*legal[\w-]*=["'][^"']*["']/g)].map(match => match[0]).sort();
}
