import fs from "fs";
import path from "path";

const args = new Set(process.argv.slice(2));
const forceWrite = args.has("--write") || process.env.UPDATE_VERSION_FILE === "1";
const filePath = path.join(process.cwd(), "src/config/version.json");

function createVersionData() {
  const now = new Date();
  const kstNow = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  const version = kstNow
    .toISOString()
    .replace(/T/, " ")
    .replace(/\..+/, "")
    .replace(/-/g, "")
    .replace(/:/g, "")
    .slice(2, 13)
    .replace(" ", ":");

  return {
    version: `v.${version}`,
    builtAt: kstNow.toISOString(),
  };
}

function readExistingVersion() {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return null;
  }
}

const existingVersion = readExistingVersion();

if (existingVersion && !forceWrite) {
  console.log(
    `[Version Generator] Keeping tracked version ${existingVersion.version}. Use --write or UPDATE_VERSION_FILE=1 to refresh it.`
  );
  process.exit(0);
}

const versionData = createVersionData();
fs.mkdirSync(path.dirname(filePath), { recursive: true });
fs.writeFileSync(filePath, `${JSON.stringify(versionData, null, 2)}\n`);

const action = existingVersion ? "Updated" : "Created";
console.log(`[Version Generator] ${action} version file: ${versionData.version}`);
