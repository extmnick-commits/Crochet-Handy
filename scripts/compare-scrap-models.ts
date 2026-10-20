/**
 * Score two on-device scrap-model logs.
 *
 * Helper chat downloads Qwen2.5-0.5B-Instruct. This script does not download
 * either model and does not declare a winner unless every shared run
 * recorded latency and peak memory.
 *
 * Usage:
 *   npx tsx scripts/compare-scrap-models.ts current.jsonl smaller.jsonl
 *
 * Each line is one JSON object:
 *   modelId, downloadBytes, inputId, valid, violations,
 *   latencyMs, peakMemoryBytes, gpu, devices, reasonNoGPU
 *
 * Collect lines on a physical device with EXPO_PUBLIC_SCRAP_AI_BENCH=1.
 * Peak memory is filled in from Instruments or Android Studio; the app leaves
 * it null. A null latency or peak memory means this script will not name a
 * faster or better model.
 *
 * Smaller candidate, not installed by the app:
 *   Qwen2.5-0.5B-Instruct-Q4_K_M
 *   revision 41ba88dbac95fed2528c92514c131d73eb5a174b
 *   397808192 bytes
 *   sha256 6eb923e7d26e9cea28811e1a8e852009b21242fb157b26149d3b188f3a8c8653
 */
import fs from 'node:fs';

import { compareScrapModelLogs, type ScrapBenchEntry } from '../utils/scrapBench';
import { SCRAP_COMPARISON_MODEL_PIN, SCRAP_MODEL_PIN } from '../utils/scrapModelPin';

const currentPath = process.argv[2];
const smallerPath = process.argv[3];

if (!currentPath || !smallerPath) {
  console.log(`Current model: ${SCRAP_MODEL_PIN.id} (${SCRAP_MODEL_PIN.bytes} bytes)`);
  console.log(`Comparison candidate: ${SCRAP_COMPARISON_MODEL_PIN.id} (${SCRAP_COMPARISON_MODEL_PIN.bytes} bytes)`);
  console.log('Pass two JSONL logs from the same inputs. No winner is chosen from download size alone.');
  process.exit(0);
}

const report = compareScrapModelLogs(readLog(currentPath), readLog(smallerPath));
console.log(JSON.stringify(report, null, 2));
if (!report.winner) process.exit(2);

function readLog(file: string): ScrapBenchEntry[] {
  return fs
    .readFileSync(file, 'utf8')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) => JSON.parse(line) as ScrapBenchEntry);
}
