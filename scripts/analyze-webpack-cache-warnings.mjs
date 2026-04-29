#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const args = new Set(process.argv.slice(2));
const json = args.has("--json");
const root = process.cwd();
const nextDir = path.join(root, ".next");

function getArgValue(name) {
  const prefix = `${name}=`;
  const match = process.argv.slice(2).find((arg) => arg.startsWith(prefix));
  return match ? match.slice(prefix.length) : "";
}

function walk(dir, predicate = () => true) {
  if (!fs.existsSync(dir)) return [];
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...walk(fullPath, predicate));
    } else if (predicate(fullPath)) {
      out.push(fullPath);
    }
  }
  return out;
}

function sizeKb(filePath) {
  return Number((fs.statSync(filePath).size / 1024).toFixed(1));
}

function relative(filePath) {
  return path.relative(root, filePath).replace(/\\/g, "/");
}

function readSample(filePath, maxBytes = 512 * 1024) {
  const fd = fs.openSync(filePath, "r");
  try {
    const buffer = Buffer.alloc(Math.min(fs.statSync(filePath).size, maxBytes));
    fs.readSync(fd, buffer, 0, buffer.length, 0);
    return buffer.toString("utf8");
  } finally {
    fs.closeSync(fd);
  }
}

function readText(filePath, maxBytes = 2 * 1024 * 1024) {
  const stat = fs.statSync(filePath);
  if (stat.size <= maxBytes) return fs.readFileSync(filePath, "utf8");
  return readSample(filePath, maxBytes);
}

function readClientChunkRouteIndex() {
  const manifestPath = path.join(nextDir, "app-build-manifest.json");
  const routeIndex = new Map();
  if (!fs.existsSync(manifestPath)) return routeIndex;

  try {
    const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
    for (const [route, files] of Object.entries(manifest.pages || {})) {
      if (!Array.isArray(files)) continue;
      for (const file of files) {
        if (typeof file !== "string" || !file.startsWith("static/chunks/")) continue;
        const routes = routeIndex.get(file) || [];
        routes.push(route);
        routeIndex.set(file, routes);
      }
    }
  } catch {
    // Keep analysis best-effort if Next changes the manifest shape.
  }

  return routeIndex;
}

function addMarker(markers, marker) {
  if (!markers.includes(marker)) markers.push(marker);
}

const clientChunkRouteIndex = readClientChunkRouteIndex();

function routeReferencesFor(filePath) {
  const manifestPath = relative(filePath).replace(/^\.next\//, "");
  return clientChunkRouteIndex.get(manifestPath) || [];
}

function isPreviewRoute(route) {
  return (
    route.includes("/live-preview/[name]") ||
    route.includes("/live-preview-render/buckets/") ||
    route.includes("/page-live-preview-render/buckets/") ||
    route.includes("/page-live-preview/[name]")
  );
}

function classifyContent(filePath) {
  const rel = relative(filePath);
  const sample = readText(filePath);
  const routeReferences = routeReferencesFor(filePath);
  const markers = [];

  if (/\.next\/(?:server\/app|static\/chunks\/app)\/live-preview\/\[name\]\//.test(rel)) {
    addMarker(markers, "registry-live-preview-route");
  }
  if (/\.next\/(?:server\/app|static\/chunks\/app)\/live-preview-render\/buckets\/bucket-\d{2}\/\[name\]\//.test(rel)) {
    addMarker(markers, "registry-live-preview-bucket-route");
  }
  if (/\.next\/(?:server\/app|static\/chunks\/app)\/page-live-preview\/\[name\]\//.test(rel)) {
    addMarker(markers, "page-live-preview-route");
  }
  if (/\.next\/(?:server\/app|static\/chunks\/app)\/page-live-preview-render\/buckets\/bucket-\d{2}\/\[name\]\//.test(rel)) {
    addMarker(markers, "page-live-preview-bucket-route");
  }
  if (/\.next\/server\/app\/cam\/.+\/page_client-reference-manifest\.js$/.test(rel)) {
    addMarker(markers, "admin-client-reference-manifest");
  }
  if (/\.next\/server\/app\/article\/\[id\]\/page_client-reference-manifest\.js$/.test(rel)) {
    addMarker(markers, "public-article-client-reference-manifest");
  }
  if (/\.next\/static\/chunks\/polyfills-/.test(rel)) addMarker(markers, "browser-polyfills");
  if (routeReferences.length > 1 && routeReferences.every(isPreviewRoute)) {
    addMarker(markers, "preview-shared-client-chunk");
  }
  if (routeReferences.length >= 30) addMarker(markers, "app-wide-shared-client-chunk");

  if (/quill\/dist|parchment|code-block-container|ql-container|SnowTheme|new Quill/i.test(sample)) {
    addMarker(markers, "quill-rich-editor");
  }
  if (/recharts|d3-shape|d3-scale|ResponsiveContainer|BarChart|CartesianGrid/i.test(sample)) {
    addMarker(markers, "charting-dependency");
  }
  if (/components\/registry|webpackAsyncContext|webpackEmptyAsyncContext|Failed to load component/i.test(sample)) {
    addMarker(markers, "registry-dynamic-import-context");
  }
  if (/photo-\d{13}-[a-z0-9]+|i_made_a_code_boilerplate_to_ship_projects/i.test(sample)) {
    addMarker(markers, "registry-component-content");
  }
  if (/__RSC_MANIFEST|clientModules|ssrModuleMapping/i.test(sample)) addMarker(markers, "next-client-reference-manifest");
  if (/next\/dist|NEXT_PRIVATE_|BAILOUT_TO_CLIENT_SIDE_RENDERING|app-router|webpackChunk_N_E/i.test(sample)) {
    addMarker(markers, "next-runtime-internal");
  }
  if (/mailparser|imapflow|nodemailer|mammoth|pdf-parse|IconvLite|openxmlformats/i.test(sample)) {
    addMarker(markers, "mail-document-processing-dependency");
  }
  if (/X-Supabase|AuthSessionMissingError|postgrest|realtime-js|createSignedUploadUrl/i.test(sample)) {
    addMarker(markers, "supabase-client-dependency");
  }
  if (/framer-motion|motion-dom|motion-utils|MotionValue|VisualElement|presenceAffectsLayout|motionComponentSymbol|data-framer-portal-id/i.test(sample)) {
    addMarker(markers, "motion-animation-dependency");
  }

  return markers.length > 0 ? markers : ["unclassified-large-js"];
}

function topFiles(dir, minKb, limit) {
  return walk(dir, (file) => file.endsWith(".js") || file.endsWith(".json") || file.endsWith(".pack"))
    .map((file) => {
      const routeReferences = routeReferencesFor(file);
      return {
        file: relative(file),
        kb: sizeKb(file),
        markers: file.endsWith(".js") && sizeKb(file) >= minKb ? classifyContent(file) : [],
        routeReferenceCount: routeReferences.length,
        routeReferences: routeReferences.slice(0, 12),
      };
    })
    .filter((item) => item.kb >= minKb)
    .sort((a, b) => b.kb - a.kb)
    .slice(0, limit);
}

function topFilesUnder(relativeDir, minKb, limit) {
  return topFiles(path.join(root, ...relativeDir.split("/")), minKb, limit);
}

const minKb = Number(getArgValue("--min-kb") || "100");
const limit = Number(getArgValue("--limit") || "30");

const result = {
  ok: true,
  nextDirPresent: fs.existsSync(nextDir),
  minKb,
  observations: {
    webpackCacheWarningClass:
      "Webpack PackFileCacheStrategy serializes large strings in production cache packs. This is a build-cache performance warning, not a runtime correctness or security error.",
    likelySources: [
      "Large dynamically imported registry preview contexts for isolated preview routes such as /live-preview and page-live-preview.",
      "Bucketed registry preview routes under /live-preview-render/buckets split the former broad /live-preview registry context into smaller per-bucket chunks.",
      "Bucketed page preview routes under /page-live-preview-render/buckets split the former broad /page-live-preview page context into smaller per-bucket chunks.",
      "The /example/registry index intentionally avoids inline dynamic component rendering and links to the isolated preview route instead.",
      "App-wide Next client-reference manifests repeated across /cam and public routes; /cam manifests are a visible sample, not the only source.",
      "Preview shared client chunks referenced by both /live-preview and /page-live-preview.",
      "App-wide shared client runtime chunks referenced by many routes.",
      "Registry component content chunks produced by generated preview/demo component sets.",
      "The article editor is dependency-free; Quill package fingerprints are still marked if that dependency is reintroduced.",
      "Optional dashboard/admin charting chunks are marked if reintroduced; the current dashboard history chart is dependency-free.",
      "Mail/document parser packages are externalized from server bundles; analyzer markers remain if those dependencies are re-bundled.",
    ],
    remediationTradeoff:
      "Disabling webpack persistent cache can hide the warning but slows rebuilds and is riskier than keeping the warning classified. Structural reduction would require splitting/removing broad dynamic import contexts, removing app-wide client roots, or further reducing generated preview/client-reference output.",
  },
  previewRouteFootprint: {
    livePreviewServerAppFiles: topFilesUnder(".next/server/app/live-preview/[name]", 0, 10),
    livePreviewClientChunks: topFilesUnder(".next/static/chunks/app/live-preview/[name]", 0, 10),
    registryBucketPreviewServerAppFiles: topFilesUnder(".next/server/app/live-preview-render/buckets", 0, 10),
    registryBucketPreviewClientChunks: topFilesUnder(".next/static/chunks/app/live-preview-render/buckets", 0, 10),
    pageLivePreviewServerAppFiles: topFilesUnder(".next/server/app/page-live-preview/[name]", 0, 10),
    pageLivePreviewClientChunks: topFilesUnder(".next/static/chunks/app/page-live-preview/[name]", 0, 10),
    pageBucketPreviewServerAppFiles: topFilesUnder(".next/server/app/page-live-preview-render/buckets", 0, 10),
    pageBucketPreviewClientChunks: topFilesUnder(".next/static/chunks/app/page-live-preview-render/buckets", 0, 10),
  },
  topServerAppFiles: topFiles(path.join(nextDir, "server", "app"), minKb, limit),
  topServerChunks: topFiles(path.join(nextDir, "server", "chunks"), minKb, limit),
  topClientChunks: topFiles(path.join(nextDir, "static", "chunks"), minKb, limit),
  topWebpackCachePacks: topFiles(path.join(nextDir, "cache", "webpack"), 1024, 20),
};

if (!result.nextDirPresent) {
  result.ok = false;
  result.error = ".next directory is missing. Run pnpm build before this analysis.";
}

const hasKnownSources = [
  ...result.topServerAppFiles,
  ...result.topServerChunks,
  ...result.topClientChunks,
].some((item) =>
  item.markers.some((marker) =>
    [
      "quill-rich-editor",
      "registry-live-preview-route",
      "registry-live-preview-bucket-route",
      "page-live-preview-route",
      "page-live-preview-bucket-route",
      "preview-shared-client-chunk",
      "app-wide-shared-client-chunk",
      "registry-component-content",
      "registry-dynamic-import-context",
      "next-client-reference-manifest",
      "admin-client-reference-manifest",
      "public-article-client-reference-manifest",
      "charting-dependency",
      "mail-document-processing-dependency",
      "supabase-client-dependency",
      "motion-animation-dependency",
      "next-runtime-internal",
      "browser-polyfills",
    ].includes(marker)
  )
);

if (result.nextDirPresent && !hasKnownSources) {
  result.ok = false;
  result.error = "No known large bundle source was detected; investigate webpack warnings manually.";
}

if (json) {
  console.log(JSON.stringify(result, null, 2));
} else {
  console.log("Webpack cache warning analysis");
  console.log(`- .next present: ${result.nextDirPresent}`);
  console.log(`- warning class: ${result.observations.webpackCacheWarningClass}`);
  console.log("- likely sources:");
  for (const source of result.observations.likelySources) console.log(`  - ${source}`);
  console.log("\nPreview route footprint:");
  for (const [key, files] of Object.entries(result.previewRouteFootprint)) {
    const totalKb = files.reduce((sum, item) => sum + item.kb, 0).toFixed(1);
    console.log(`- ${key}: ${totalKb} KB across ${files.length} files`);
  }
  console.log("\nTop server app files:");
  for (const item of result.topServerAppFiles.slice(0, 8)) {
    console.log(`- ${item.kb} KB ${item.file} [${item.markers.join(", ")}]`);
  }
  console.log("\nTop client chunks:");
  for (const item of result.topClientChunks.slice(0, 8)) {
    console.log(`- ${item.kb} KB ${item.file} [${item.markers.join(", ")}]`);
  }
  if (result.error) console.error(`ERROR: ${result.error}`);
}

process.exit(result.ok ? 0 : 1);
