import assert from 'node:assert/strict';
import type OpenAI from 'openai';
import { partitionVideosByEnglishThumbnailText } from '../utils/thumbnailEnglishFilter';
import { isGeminiRateLimitError } from '../utils/geminiRequestPacing';

async function main() {
  let calls = 0;
  const limit = Object.assign(new Error('rate limited'), { status: 429 });
  const client = { chat: { completions: { create: async () => { calls++; throw limit; } } } } as unknown as OpenAI;
  assert.equal(isGeminiRateLimitError(limit), true);
  assert.equal(isGeminiRateLimitError(new Error('network')), false);
  await assert.rejects(partitionVideosByEnglishThumbnailText(client, 'test', [{ id: 'one' }, { id: 'two' }]), (error) => error === limit);
  assert.equal(calls, 1, 'a rate limit stops rather than retries or approving unchecked thumbnails');
  process.env.SCRAPE_GEMINI_MIN_INTERVAL_MS = '30';
  const started: number[] = [];
  const paced = { chat: { completions: { create: async () => {
    started.push(Date.now());
    return { choices: [{ message: { content: '{"results":[]}' } }] };
  } } } } as unknown as OpenAI;
  await partitionVideosByEnglishThumbnailText(paced, 'test', Array.from({ length: 9 }, (_, i) => ({ id: String(i) })));
  assert.equal(started.length, 3);
  assert.ok(started[1] - started[0] >= 28 && started[2] - started[1] >= 28, 'each thumbnail request is spaced');
  delete process.env.SCRAPE_GEMINI_MIN_INTERVAL_MS;
  console.log('Scraper rate-limit checks passed.');
}
void main().catch((error) => { console.error(error); process.exitCode = 1; });
