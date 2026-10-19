/** Framework-free checks. Native model/GPU behavior still needs physical phones. */
import assert from 'node:assert/strict';
import { calculateCrochet } from '../utils/helper/calculators';
import { buildHelperMessages, contextKey, parseHelperPlan, searchHelperPatterns, type HelperMessage } from '../utils/helper/context';
import { HelperSession } from '../utils/helper/session';
import { HelperInferenceError, runHelperInference, type HelperNativeContext, type HelperRuntime } from '../utils/helper/inference';
import { scrapEngineLockKind, withScrapEngineLock } from '../utils/scrapModelTransfer';
import type { CrochetPattern } from '../store/machine';

const tick = () => new Promise<void>((resolve) => setTimeout(resolve, 0));
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>((done) => { resolve = done; }); return { promise, resolve }; }
const calc = (operation: Parameters<typeof calculateCrochet>[0]['operation'], values: number[], units: string[] = []) => calculateCrochet({ operation, values, units });
const pattern = (id: string, title: string): CrochetPattern => ({ id, title, creator: 'Maker', videoId: 'abcdefghijk', youtubeUrl: 'https://www.youtube.com/watch?v=abcdefghijk', thumbnailUrl: '', difficulty: 'beginner', yarnWeight: 'worsted', hookSize: '5 mm', totalRows: 10, stitchesPerRow: 20, tags: ['coaster'], steps: [], bookmarks: [] });
const p = pattern('real-1', 'Simple coaster');
const context = { pattern: p, project: null };
const message: HelperMessage = { id: 'u1', role: 'user', text: 'Explain this', contextKey: contextKey(context), contextLabel: p.title };

async function main() {
  assert.match(calc('yarn', [35, 100, 200], ['yd']).text, /70 yd/);
  assert.match(calc('skeins', [450, 200], ['yd']).text, /3 skeins/);
  assert.match(calc('convert', [1], ['yd', 'm']).text, /0.914 m/);
  assert.match(calc('convert', [1], ['oz', 'g']).text, /28.35 g/);
  assert.equal(calc('convert', [1], ['g', 'yd']).ok, false);
  assert.equal(calc('convert', [1], ['toString', '__proto__']).ok, false);
  assert.equal(calc('yarn', [35, 0, 200], ['yd']).ok, false);
  assert.equal(calc('yarn', [-1, 100, 200]).ok, false);
  assert.equal(calc('gauge', [30, 18, 10, 0]).ok, false);
  assert.equal(calc('gauge', [30, 18, 10, 4, 2]).ok, true);
  assert.match(calc('gauge', [30, 18, 10]).text, /54 stitches/);
  assert.match(calc('rows', [30, 22, 10]).text, /66 rows/);
  assert.match(calc('percent', [100, -20]).text, /= 80/);
  assert.equal(calc('time', [30, 0, 40]).ok, false);
  assert.match(calc('time', [60, 10, 40]).text, /180 minutes remaining/);
  assert.equal(calc('percent', [Infinity, 10]).ok, false);
  assert.match(calc('shaping', [40, 48]).text, /\(4 sc, inc\) × 8/);
  assert.match(calc('shaping', [40, 32]).text, /\(3 sc, dec\) × 8/);
  // Reconstruct every generated one-round shaping instruction, including remainders.
  for (let from = 2; from <= 55; from++) for (let to = Math.ceil(from / 2); to <= from * 2; to++) {
    if (from === to) continue;
    const result = calc('shaping', [from, to]);
    assert.equal(result.ok, true);
    let consumed = 0; let produced = 0;
    for (const part of result.text.split('\n')[0].matchAll(/\((?:(\d+) sc, )?(inc|dec)\) × (\d+)/g)) {
      const plain = Number(part[1] ?? 0); const times = Number(part[3]);
      consumed += (plain + (part[2] === 'inc' ? 1 : 2)) * times;
      produced += (plain + (part[2] === 'inc' ? 2 : 1)) * times;
    }
    // Long instructions intentionally use a bounded aggregate representation.
    if (!result.text.includes('spacing the longer groups')) { assert.equal(consumed, from); assert.equal(produced, to); }
  }

  const s = new HelperSession();
  s.bindOwner('alice'); s.open('main');
  let stopped = 0;
  const generation = s.begin(message, () => { stopped++; })!;
  assert.equal(s.begin(message, () => {}), null);
  s.close(); assert.equal(stopped, 1);
  assert.equal(s.snapshot().messages.length, 1);
  assert.equal(s.finish(generation, { ...message, role: 'assistant', text: 'stale' }), false);
  s.open('pattern-real-1'); assert.equal(s.snapshot().messages.length, 1);
  s.bindOwner('bob'); assert.equal(s.snapshot().messages.length, 0); assert.equal(s.snapshot().surface, null);
  const active = s.begin(message, () => {})!;
  assert.equal(s.finish(active, { ...message, role: 'assistant', text: 'done' }), true);
  s.clear(); assert.equal(s.snapshot().messages.length, 0);
  assert.equal(s.finish(active, message), false);

  const candidates = searchHelperPatterns('find beginner coaster patterns', [p, p, pattern('real-2', 'Coaster pair')]);
  assert.equal(candidates.length, 2);
  const response = { action: 'search', answer: 'Try these.', operation: 'none', values: [], units: [], patternIds: ['real-1'] };
  assert.ok(parseHelperPlan(JSON.stringify(response), candidates));
  assert.equal(parseHelperPlan(JSON.stringify({ ...response, patternIds: ['invented'] }), candidates), null);
  assert.equal(parseHelperPlan(JSON.stringify({ ...response, action: 'deleteProject' }), candidates), null);
  assert.equal(parseHelperPlan(JSON.stringify({ ...response, values: ['eval(1)'] }), candidates), null);
  assert.equal(parseHelperPlan('not json', candidates), null);
  const messages = buildHelperMessages({ question: 'What is the hook?', context, candidates, history: [message, { ...message, text: 'SECRET OTHER PATTERN', contextKey: 'other' }] });
  assert.ok(!JSON.stringify(messages).includes('SECRET OTHER PATTERN'));
  assert.ok(JSON.stringify(messages).includes('not a verified complete transcript'));
  assert.equal(messages[messages.length - 1].content, 'What is the hook?');

  let released = 0; let completions = 0; let stopCalls = 0;
  const ctx: HelperNativeContext = {
    gpu: true, completion: async () => { completions++; return { text: 'reply' }; },
    getFormattedChat: async () => ({ prompt: 'small' }), tokenize: async () => ({ tokens: [1, 2] }),
    stopCompletion: () => { stopCalls++; }, release: () => { released++; },
  };
  const runtime: HelperRuntime = { initLlama: async () => ctx };
  const args = { runtime, modelPath: 'file:///model.gguf', platform: 'ios', messages,
    signal: new AbortController().signal, timeoutMs: 500 };
  assert.equal(await runHelperInference(args), 'reply');
  assert.equal(released, 1); assert.equal(completions, 1); assert.ok(stopCalls >= 1);
  assert.equal(scrapEngineLockKind(), null);

  const beforeNoGpu = completions;
  await assert.rejects(runHelperInference({ ...args, runtime: { initLlama: async () => ({ ...ctx, gpu: false }) } }), (e) => e instanceof HelperInferenceError && e.code === 'failed');
  assert.equal(completions, beforeNoGpu);

  const locked = deferred<void>();
  const holder = withScrapEngineLock('scan', () => locked.promise);
  await assert.rejects(runHelperInference(args), (e) => e instanceof HelperInferenceError && e.code === 'busy');
  assert.equal(scrapEngineLockKind(), 'scan'); locked.resolve(); await holder;

  const init = deferred<HelperNativeContext>();
  const controller = new AbortController();
  const late = runHelperInference({ ...args, runtime: { initLlama: () => init.promise }, signal: controller.signal });
  controller.abort();
  await assert.rejects(late, (e) => e instanceof HelperInferenceError && e.code === 'cancelled');
  assert.equal(scrapEngineLockKind(), 'helper-chat');
  const before = completions;
  init.resolve(ctx); await tick();
  assert.equal(completions, before); assert.equal(scrapEngineLockKind(), null);

  const completion = deferred<{ text: string }>();
  const timed = runHelperInference({ ...args, runtime: { initLlama: async () => ({ ...ctx, completion: () => completion.promise }) }, timeoutMs: 5 });
  await assert.rejects(timed, (e) => e instanceof HelperInferenceError && e.code === 'timeout');
  assert.equal(scrapEngineLockKind(), 'helper-chat');
  completion.resolve({ text: 'late answer' }); await tick();
  assert.equal(scrapEngineLockKind(), null);

  let formatCalls = 0;
  const shrink = { ...ctx, getFormattedChat: async () => ({ prompt: ++formatCalls === 1 ? 'long' : 'short' }),
    tokenize: async (text: string) => ({ tokens: text === 'long' ? Array(3500).fill(1) : [1] }) };
  assert.equal(await runHelperInference({ ...args, runtime: { initLlama: async () => shrink } }), 'reply');
  assert.equal(formatCalls, 2);
  console.log('Crochet Handy Helper checks passed: calculators, shaping invariants, account/context isolation, references, cancellation, timeout, engine lock, and token budget.');
}
void main().catch((error) => { console.error(error); process.exitCode = 1; });
