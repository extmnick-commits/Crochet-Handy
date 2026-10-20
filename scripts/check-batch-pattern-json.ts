/**
 * Unit checks for batch pattern JSON parsing (no network).
 * Run: npx tsx scripts/check-batch-pattern-json.ts
 */
import {
  parseBatchPatternsResponse,
  repairBatchPatternJson,
} from '../utils/batchPatternJsonParse';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function testRepairNumericRange(): void {
  const broken = '{"patterns":[{"videoIndex":0,"totalRows":20-25,"stitchesPerRow":36}]}';
  const repaired = repairBatchPatternJson(broken);
  const parsed = parseBatchPatternsResponse(broken);
  assert(repaired.includes('"totalRows":20'), 'range repair keeps first integer');
  assert(
    (parsed.patterns?.[0] as { totalRows?: number }).totalRows === 20,
    'parse accepts repaired range field',
  );
}

function testBareMinusOnNumericField(): void {
  const broken = '{"patterns":[{"videoIndex":0,"estimatedTimeMinutes":-}]}';
  const parsed = parseBatchPatternsResponse(broken);
  assert(
    (parsed.patterns?.[0] as { estimatedTimeMinutes?: null }).estimatedTimeMinutes === null,
    'bare minus becomes null',
  );
}

function testTrailingComma(): void {
  const broken = '{"patterns":[{"videoIndex":0,"totalRows":12,},]}';
  const parsed = parseBatchPatternsResponse(broken);
  assert(Array.isArray(parsed.patterns) && parsed.patterns.length === 1, 'trailing comma repaired');
}

function testPreservesDescriptionRanges(): void {
  const ok =
    '{"patterns":[{"videoIndex":0,"description":"Use rows 20-25 for the brim","totalRows":20}]}';
  const parsed = parseBatchPatternsResponse(ok);
  assert(
    (parsed.patterns?.[0] as { description?: string }).description?.includes('20-25'),
    'string ranges in description unchanged',
  );
}

function main(): void {
  testRepairNumericRange();
  testBareMinusOnNumericField();
  testTrailingComma();
  testPreservesDescriptionRanges();
  console.log('check-batch-pattern-json: ok');
}

main();
