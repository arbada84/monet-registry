#!/usr/bin/env node
/**
 * 전체 기사 연속 재편집 래퍼
 * batch-reedit.mjs를 offset을 올려가며 자동으로 반복 실행
 *
 * Usage: node scripts/batch-reedit-all.mjs [--start 100] [--batch 50]
 */
import { execSync } from "child_process";

const args = process.argv.slice(2);
const START = parseInt(args.find((_, i) => args[i - 1] === "--start") || "100");
const BATCH = parseInt(args.find((_, i) => args[i - 1] === "--batch") || "50");
const TOTAL = 2962;

console.log(`=== 전체 기사 연속 재편집 ===`);
console.log(`시작: ${START}, 배치: ${BATCH}, 총: ${TOTAL}\n`);

for (let offset = START; offset < TOTAL; offset += BATCH) {
  const batchNum = Math.floor(offset / BATCH) + 1;
  console.log(`\n========== 배치 #${batchNum} (offset=${offset}) ==========\n`);

  try {
    execSync(`node scripts/batch-reedit.mjs --limit ${BATCH} --offset ${offset}`, {
      stdio: "inherit",
      timeout: 600000, // 10분 타임아웃
    });
  } catch (e) {
    console.error(`\n배치 #${batchNum} 오류: ${e.message}`);
    console.log(`재시작: node scripts/batch-reedit-all.mjs --start ${offset} --batch ${BATCH}`);
    process.exit(1);
  }

  // 배치 간 5초 대기
  if (offset + BATCH < TOTAL) {
    console.log(`\n다음 배치까지 5초 대기...`);
    execSync("sleep 5");
  }
}

console.log(`\n=== 전체 완료! ===`);
