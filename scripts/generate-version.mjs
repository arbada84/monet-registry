import fs from 'fs';
import path from 'path';

const now = new Date();
const kstNow = new Date(now.getTime() + (9 * 60 * 60 * 1000));
const version = kstNow.toISOString().replace(/T/, ' ').replace(/\..+/, '').replace(/-/g, '').replace(/:/g, '').slice(2, 13).replace(' ', ':');
// 형식: 260410:1730 (YYMMDD:HHMM)

const versionData = {
  version: `v.${version}`,
  builtAt: kstNow.toISOString()
};

const filePath = path.join(process.cwd(), 'src/config/version.json');
fs.writeFileSync(filePath, JSON.stringify(versionData, null, 2));

console.log(`[Version Generator] New version generated: ${versionData.version}`);
