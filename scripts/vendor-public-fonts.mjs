import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import postcss from "postcss";

const sources = [
  { name: "Geist", query: "Geist:wght@100..900", license: "geist" },
  { name: "Geist Mono", query: "Geist Mono:wght@100..900", license: "geistmono" },
  { name: "Noto Sans KR", query: "Noto Sans KR:wght@400;500;700", license: "notosanskr" },
  { name: "Instrument Serif", query: "Instrument Serif:ital@0;1", license: "instrumentserif" },
  { name: "Playfair Display", query: "Playfair Display:wght@400;500;600;700", license: "playfairdisplay" },
];
if (!process.argv.includes("--apply")) {
  console.log(JSON.stringify({ mode: "dry-run", families: sources.map(s => s.name), command: "node scripts/vendor-public-fonts.mjs --apply" }, null, 2));
  process.exit(0);
}
const root = process.cwd();
const directory = path.join(root, "public/fonts");
fs.mkdirSync(directory, { recursive: true });
const hash = bytes => createHash("sha256").update(bytes).digest("hex");
const downloaded = new Map();
const cached = fs.existsSync(path.join(directory, "manifest.json"))
  ? new Map(JSON.parse(fs.readFileSync(path.join(directory, "manifest.json"), "utf8")).files.map(file => [file.source, file])) : new Map();
const manifest = { version: 1, families: [], files: [] };
const styles = [];
async function get(url, headers = {}) {
  const response = await fetch(url, { headers, signal: AbortSignal.timeout(30000), redirect: "error" });
  if (!response.ok) throw new Error(`Font source returned HTTP ${response.status}`);
  return response;
}
for (const source of sources) {
  const url = new URL("https://fonts.googleapis.com/css2");
  url.searchParams.set("family", source.query);
  url.searchParams.set("display", "swap");
  const css = await (await get(url, { "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36" })).text();
  const ast = postcss.parse(css);
  const declarations = [];
  ast.walkAtRules("font-face", rule => rule.walkDecls("src", declaration => declarations.push(declaration)));
  if (!declarations.length) throw new Error("Font stylesheet has no font faces");
  for (const declaration of declarations) {
    const match = declaration.value.match(/^url\((['"]?)(https:\/\/[^)'"\s]+)\1\)(?:\s+format\(['"]woff2['"]\))?$/);
    if (!match || new URL(match[2]).origin !== "https://fonts.gstatic.com") throw new Error("Unexpected font asset source");
    const fontUrl = match[2];
    if (!downloaded.has(fontUrl)) {
      const prior = cached.get(fontUrl);
      const previous = prior && fs.existsSync(path.join(directory, prior.file)) ? fs.readFileSync(path.join(directory, prior.file)) : null;
      const bytes = previous && hash(previous) === prior.sha256 ? previous : Buffer.from(await (await get(fontUrl)).arrayBuffer());
      if (bytes.subarray(0, 4).toString() !== "wOF2") throw new Error("Expected a real WOFF2 font");
      const sha256 = hash(bytes);
      const file = `${sha256}.woff2`;
      fs.writeFileSync(path.join(directory, file), bytes);
      downloaded.set(fontUrl, file);
      manifest.files.push({ file, sha256, bytes: bytes.length, source: fontUrl });
    }
    declaration.value = `url('/fonts/${downloaded.get(fontUrl)}') format('woff2')`;
  }
  ast.walkAtRules("font-face", rule => rule.walkDecls("font-family", declaration => { declaration.value = `'CulturePeople ${source.name}'`; }));
  const faces = new Map();
  ast.walkAtRules("font-face", rule => {
    const signature = JSON.stringify(rule.nodes.filter(node => node.type === "decl" && node.prop !== "font-weight").map(node => [node.prop, node.value]));
    const weight = rule.nodes.find(node => node.type === "decl" && node.prop === "font-weight");
    const prior = faces.get(signature);
    if (prior && weight) {
      const target = prior.nodes.find(node => node.type === "decl" && node.prop === "font-weight");
      const weights = [...target.value.matchAll(/\d+/g), ...weight.value.matchAll(/\d+/g)].map(match => Number(match[0]));
      target.value = `${Math.min(...weights)} ${Math.max(...weights)}`;
      rule.remove();
    } else faces.set(signature, rule);
  });
  ast.walkComments(comment => comment.remove());
  const licenseUrl = `https://raw.githubusercontent.com/google/fonts/main/ofl/${source.license}/OFL.txt`;
  const license = await (await get(licenseUrl)).text();
  if (!license.includes("SIL OPEN FONT LICENSE")) throw new Error("Font license could not be verified");
  const licenseFile = `${source.license}-OFL.txt`;
  fs.writeFileSync(path.join(directory, licenseFile), license);
  manifest.families.push({ name: source.name, stylesheet: url.toString(), originalCssSha256: hash(css), licenseFile, licenseSource: licenseUrl, licenseSha256: hash(license), faces: declarations.length });
  styles.push(ast.toString());
  console.log(`${source.name}: ${declarations.length} font faces`);
}
styles.push(`:root { --font-geist-sans: 'CulturePeople Geist', Arial, sans-serif; --font-geist-mono: 'CulturePeople Geist Mono', monospace; --font-noto-sans-kr: 'CulturePeople Noto Sans KR', sans-serif; }
.font-instrument-serif { font-family: 'CulturePeople Instrument Serif', serif; }
.font-playfair-display { font-family: 'CulturePeople Playfair Display', serif; }`);
fs.writeFileSync(path.join(root, "src/app/fonts.css"), styles.join("\n\n") + "\n");
fs.writeFileSync(path.join(directory, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n");
console.log(JSON.stringify({ files: manifest.files.length, bytes: manifest.files.reduce((sum, file) => sum + file.bytes, 0), runtimeGoogleRequests: 0 }));
