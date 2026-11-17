import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";
import postcss from "postcss";

export function verifyLocalFonts(root = process.cwd()) {
  const directory = path.join(root, "public/fonts");
  const manifest = JSON.parse(fs.readFileSync(path.join(directory, "manifest.json"), "utf8"));
  const css = postcss.parse(fs.readFileSync(path.join(root, "src/app/fonts.css"), "utf8"));
  const errors = [];
  const hash = bytes => createHash("sha256").update(bytes).digest("hex");
  const names = new Set(manifest.files.map(file => file.file));
  for (const file of manifest.files) {
    if (!/^[a-f0-9]{64}\.woff2$/.test(file.file)) { errors.push("Unexpected font filename"); continue; }
    const bytes = fs.readFileSync(path.join(directory, file.file));
    if (bytes.subarray(0, 4).toString() !== "wOF2" || hash(bytes) !== file.sha256 || bytes.length !== file.bytes) errors.push(`Font integrity failed: ${file.file}`);
  }
  for (const family of manifest.families) {
    if (!/^[a-z]+-OFL\.txt$/.test(family.licenseFile)) { errors.push("Unexpected font license path"); continue; }
    const license = fs.readFileSync(path.join(directory, family.licenseFile), "utf8");
    if (!license.includes("SIL OPEN FONT LICENSE") || hash(license) !== family.licenseSha256) errors.push(`License invalid: ${family.name}`);
  }
  let faces = 0;
  css.walkAtRules("font-face", rule => {
    faces++;
    rule.walkDecls("src", declaration => {
      const name = declaration.value.match(/^url\('\/fonts\/([a-f0-9]{64}\.woff2)'\) format\('woff2'\)$/)?.[1];
      if (!name || !names.has(name)) errors.push("Non-local or unknown font source");
    });
  });
  if (!faces) errors.push("No font faces found");
  function walk(directory) {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const file = path.join(directory, entry.name);
      if (entry.isDirectory()) walk(file);
      else if (/\.[jt]sx?$/.test(file) && /from\s+["']next\/font\/google["']/.test(fs.readFileSync(file, "utf8"))) errors.push(`Build-time Google font dependency: ${path.relative(root, file)}`);
    }
  }
  walk(path.join(root, "src"));
  return { ok: errors.length === 0, families: manifest.families.length, files: names.size, faces, bytes: manifest.files.reduce((sum, file) => sum + file.bytes, 0), errors };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try { const report = verifyLocalFonts(); console.log(JSON.stringify(report, null, 2)); if (!report.ok) process.exitCode = 1; }
  catch { console.error("Local font assets or licenses are missing or invalid."); process.exitCode = 1; }
}
