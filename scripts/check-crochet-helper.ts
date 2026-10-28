/** Framework-free checks. Native model/GPU behavior still needs physical phones. */
import assert from 'node:assert/strict';
import { calculateCrochet } from '../utils/helper/calculators';
import { buildHelperMessages, contextKey, getStarters, searchHelperPatterns, type HelperMessage } from '../utils/helper/context';
import { quickHelperReply, cleanHelperAnswer } from '../utils/helper/replies';
import { HelperSession } from '../utils/helper/session';
import { HelperInferenceEngine, HelperInferenceError, type HelperNativeContext, type HelperRuntime } from '../utils/helper/inference';
import { scrapEngineLockKind, withScrapEngineLock } from '../utils/scrapModelTransfer';
import type { CrochetPattern, CrochetProject, YarnStashItem } from '../store/machine';

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
  const general = { pattern: null, project: null };
  assert.match(quickHelperReply('How do I make a single crochet stitch?', general, [])!.text, /two loops on the hook/i);
  assert.match(quickHelperReply('How many loops are on the hook before finishing a single crochet?', general, [])!.text, /two loops/i);
  assert.equal(quickHelperReply('How do I make a single crochet decrease?', general, []), null);
  assert.match(quickHelperReply('find beginner elephant patterns', general, [p])!.text, /couldn’t find/i);
  assert.match(quickHelperReply('What can you do', general, [])!.text, /calculate yarn/);
  assert.match(quickHelperReply('Explain this pattern', general, [])!.text, /Open a pattern/);
  assert.equal(quickHelperReply('Explain this pattern', context, [])!.patterns![0].id, p.id);
  assert.match(quickHelperReply('Find beginner coaster patterns', general, [p])!.text, /local catalog/);
  assert.equal(quickHelperReply('suggest a coaster', general, [p])!.patterns![0].id, p.id);
  assert.equal(quickHelperReply('what should I make?', general, [p])!.patterns![0].id, p.id);
  assert.equal(quickHelperReply('Why does the edge of my circle curl?', general, [p]), null);
  assert.match(quickHelperReply('Convert 100 yards to meters', general, [])!.text, /91.44 m/);
  assert.equal(quickHelperReply('I have 100 yards and 40 grams, convert it', general, [])!.calculator, 'convert');
  assert.equal(quickHelperReply('Will I have enough yarn?', general, [])!.calculator, 'yarn');
  assert.equal(quickHelperReply('How many skeins do I need?', general, [])!.calculator, 'skeins');
  assert.equal(quickHelperReply('How many stitches for this width?', general, [])!.calculator, 'gauge');
  assert.equal(quickHelperReply('What does dc mean?', general, [])!.text.includes('UK'), true);
  assert.equal(quickHelperReply('Why does the edge of my circle curl?', general, []), null);
  const increased = quickHelperReply('increase from 40 to 48 stitches', general, [])!;
  assert.match(increased.text, /\(4 sc, inc\) × 8/);
  assert.equal(increased.calculator, 'shaping');
  assert.equal(increased.calculated, true);
  assert.equal(increased.actions?.some((action) => action.kind === 'stitch-target' && action.stitches === 48), true);
  const decreased = quickHelperReply('decrease from 36 to 24', general, [])!;
  assert.match(decreased.text, /\(1 sc, dec\) × 12/);
  assert.match(quickHelperReply('how many yards left in 35g of a 100g 220yd skein', general, [])!.text, /77 yd/);
  const uneven = quickHelperReply('Rnd 4: *2 sc, inc* rep around (18)', general, [])!;
  assert.match(uneven.text, /single crochet/);
  assert.match(uneven.text, /not a multiple of 4/);
  assert.equal(uneven.actions?.some((action) => action.kind === 'row-note'), true);
  assert.equal(uneven.actions?.some((action) => action.kind === 'stitch-target'), false);
  const even = quickHelperReply('Rnd 2: *sc, inc* rep around (18)', general, [])!;
  assert.match(even.text, /6 repeats/);
  assert.equal(even.actions?.find((action) => action.kind === 'stitch-target' && action.stitches === 18) != null, true);
  assert.match(quickHelperReply('UK terms: Rnd 1: 6 dc (6)', general, [])!.text, /UK/);
  const stashYarn: YarnStashItem = { id: 'yarn-1', hexColor: '#C6A36E', brand: 'Paintbox', colorName: 'Soft Fudge', yarnWeight: 'worsted', hookSize: '5 mm', skeinCount: 2 };
  assert.match(quickHelperReply('What can I make with my stash?', general, [], [])!.text, /empty/);
  const matched = quickHelperReply('What can I make with my stash?', general, [p], [stashYarn])!;
  assert.match(matched.text, /worsted/);
  assert.ok(matched.patterns && matched.patterns.length > 0, 'stash matching returns catalog cards');
  const forThis = quickHelperReply('Do I have stash yarn for this?', context, [p], [stashYarn])!;
  assert.match(forThis.text, /worsted/);
  assert.ok(forThis.patterns && forThis.patterns.length > 0);
  const activeProject: CrochetProject = {
    id: 'project-1', name: 'Swatch', patternId: null, status: 'in-progress', currentStitch: 0, stitchesPerRow: 20,
    currentRow: 4, totalRows: 10, hookSize: '5 mm', yarnWeight: 'worsted', timerStartedAt: null, accumulatedSeconds: 600,
    yarnColors: [], rowNote: '', checkpoints: [], createdAt: 0, updatedAt: 0,
  };
  assert.deepEqual(getStarters({ pattern: null, project: activeProject }, '/active', []), ['Explain Row 4', 'Evenly space increases', 'Estimate time left', 'Pin a note to this row']);
  assert.equal(getStarters(context, '/pattern', [])[2], 'Do I have stash yarn for this?');
  assert.equal(getStarters(general, '/me', [])[0], 'Match patterns to my yarn stash');
  assert.match(quickHelperReply('Estimate time left', { pattern: null, project: activeProject }, [])!.text, /23\.333 minutes remaining/);
  const memory = new Map<string, string>();
  const store = {
    getItem: async (key: string) => memory.get(key) ?? null,
    setItem: async (key: string, value: string) => { memory.set(key, value); },
    removeItem: async (key: string) => { memory.delete(key); },
  };
  const persisted = new HelperSession(store, 0);
  persisted.bindOwner('alice');
  persisted.append({ ...message, id: 'saved-row', text: 'Rnd 4 decoded' });
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.match(memory.get('crochet-helper-messages:alice') ?? '', /Rnd 4 decoded/);
  persisted.bindOwner('bob');
  assert.equal(persisted.snapshot().messages.length, 0);
  assert.match(memory.get('crochet-helper-messages:alice') ?? '', /Rnd 4 decoded/);
  persisted.bindOwner('alice');
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.equal(persisted.snapshot().messages[0]?.text, 'Rnd 4 decoded');
  persisted.clear();
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.equal(memory.has('crochet-helper-messages:alice'), false);
  persisted.bindOwner('alice');
  persisted.append({ ...message, id: 'sign-out', text: 'private' });
  await new Promise((resolve) => setTimeout(resolve, 20));
  persisted.bindOwner(null);
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.equal(memory.has('crochet-helper-messages:alice'), false);
  assert.equal(cleanHelperAnswer('A useful answer. #Crochet #Crochet #Crochet', true), 'A useful answer.');
  assert.equal(cleanHelperAnswer('```json\n{ "answer": "Use a stitch marker. #Crochet #Crochet', true), 'Use a stitch marker.');
  assert.equal(cleanHelperAnswer('```json\n{ "answer": '), '');
  assert.equal(cleanHelperAnswer('<|im_start|>assistant\nUse a stitch marker.'), 'Use a stitch marker.');
  const messages = buildHelperMessages({ question: 'What is the hook?', context, history: [message, { ...message, text: 'SECRET OTHER PATTERN', contextKey: 'other' }] });
  assert.ok(!JSON.stringify(messages).includes('SECRET OTHER PATTERN'));
  const appEvidence = buildHelperMessages({ question: 'Tell me about my yarn stash and my projects', context: general, history: [], yarns: [stashYarn], projects: [activeProject] });
  assert.match(JSON.stringify(appEvidence), /Paintbox/);
  assert.match(JSON.stringify(appEvidence), /Swatch/);
  assert.ok(!JSON.stringify(buildHelperMessages({ question: 'Why is my circle curling?', context: general, history: [], yarns: [stashYarn], projects: [activeProject] })).includes('Paintbox'));
  const catalogEvidence = buildHelperMessages({ question: 'Tell me about coaster patterns', context: general, history: [], catalog: [p] });
  assert.match(JSON.stringify(catalogEvidence), /Simple coaster/);
  assert.ok(JSON.stringify(messages).includes('not a verified complete transcript'));
  assert.ok(!messages[0].content.includes('JSON schema'));
  s.stream(active, 'stale text'); assert.equal(s.snapshot().partial, '');
  assert.equal(messages[messages.length - 1].content, 'What is the hook?');

  let released = 0; let completions = 0; let stopCalls = 0; let inits = 0;
  const paramsSeen: Record<string, unknown>[] = [];
  const ctx: HelperNativeContext = {
    gpu: true, completion: async (params, onToken) => {
      completions++; paramsSeen.push(params); onToken?.({ token: 'Use a stitch marker.' }); return { text: 'Use a stitch marker.' };
    },
    getFormattedChat: async (_messages, _template, params) => { assert.equal((params as { jinja: boolean }).jinja, false); return { prompt: 'small' }; },
    tokenize: async () => ({ tokens: [1, 2] }),
    stopCompletion: () => { stopCalls++; }, release: () => { released++; },
  };
  const runtime: HelperRuntime = { initLlama: async (params) => { inits++; assert.equal(params.n_ctx, 2048); return ctx; } };
  const args = { runtime, modelPath: 'file:///model.gguf', platform: 'ios', messages,
    signal: new AbortController().signal, timeoutMs: 500 };
  const engine = new HelperInferenceEngine();
  const streamed: string[] = [];
  assert.equal(await engine.run({ ...args, onText: (text) => streamed.push(text) }), 'Use a stitch marker.');
  assert.equal(released, 0); assert.equal(completions, 1); assert.ok(stopCalls >= 1);
  assert.equal(scrapEngineLockKind(), null);
  assert.ok(streamed.includes('Use a stitch marker.'));
  assert.equal(paramsSeen[0].response_format, undefined);
  assert.equal(paramsSeen[0].messages, undefined);
  assert.equal(paramsSeen[0].prompt, 'small'); assert.equal(paramsSeen[0].n_predict, 160);
  await engine.run(args); assert.equal(inits, 1); // Warm follow-up must not reload the model.
  await withScrapEngineLock('scan', async () => { assert.equal(released, 1); });
  await engine.run(args); assert.equal(inits, 2); // A scan evicted the context first.
  await engine.dispose(); assert.equal(released, 2);

  const beforeNoGpu = completions;
  await assert.rejects(engine.run({ ...args, runtime: { initLlama: async () => ({ ...ctx, gpu: false }) } }), (e) => e instanceof HelperInferenceError && e.code === 'failed');
  assert.equal(completions, beforeNoGpu);

  const locked = deferred<void>();
  const holder = withScrapEngineLock('scan', () => locked.promise);
  await assert.rejects(engine.run(args), (e) => e instanceof HelperInferenceError && e.code === 'busy');
  assert.equal(scrapEngineLockKind(), 'scan'); locked.resolve(); await holder;

  const init = deferred<HelperNativeContext>();
  const controller = new AbortController();
  const late = engine.run({ ...args, runtime: { initLlama: () => init.promise }, signal: controller.signal });
  controller.abort();
  await assert.rejects(late, (e) => e instanceof HelperInferenceError && e.code === 'cancelled');
  assert.equal(scrapEngineLockKind(), 'helper-chat');
  const before = completions;
  init.resolve(ctx); await tick();
  assert.equal(completions, before); assert.equal(scrapEngineLockKind(), null);

  const completion = deferred<{ text: string }>();
  const timed = engine.run({ ...args, runtime: { initLlama: async () => ({ ...ctx, completion: () => completion.promise }) }, timeoutMs: 5 });
  await assert.rejects(timed, (e) => e instanceof HelperInferenceError && e.code === 'timeout');
  assert.equal(scrapEngineLockKind(), 'helper-chat');
  completion.resolve({ text: 'late answer' }); await tick();
  assert.equal(scrapEngineLockKind(), null);

  let formatCalls = 0;
  const shrink = { ...ctx, getFormattedChat: async () => ({ prompt: ++formatCalls === 1 ? 'long' : 'short' }),
    tokenize: async (text: string) => ({ tokens: text === 'long' ? Array(1700).fill(1) : [1] }) };
  assert.equal(await engine.run({ ...args, messages: [...messages.slice(0, 2), { role: 'assistant', content: 'old' }, ...messages.slice(2)], runtime: { initLlama: async () => shrink } }), 'Use a stitch marker.');
  assert.equal(formatCalls, 2);
  await engine.dispose();

  // Output is visible before native completion resolves; clear/account change rejects late tokens.
  const wait = deferred<{ text: string }>(); let emit!: NonNullable<Parameters<HelperNativeContext['completion']>[1]>;
  const streamingRuntime = { initLlama: async () => ({ ...ctx, completion: (_: object, token?: typeof emit) => { emit = token!; return wait.promise; } }) };
  const g = s.begin(message, () => {})!;
  const streaming = engine.run({ ...args, runtime: streamingRuntime, onText: (text) => s.stream(g, text) });
  await tick(); emit({ token: 'Use a stitch marker.' });
  assert.equal(s.snapshot().partial, 'Use a stitch marker.');
  s.bindOwner('carol'); emit({ token: ' OLD ACCOUNT' });
  assert.equal(s.snapshot().partial, '');
  await engine.dispose(); // Clear during generation prevents retaining its KV cache.
  wait.resolve({ text: 'Use a stitch marker.' }); await streaming;
  const releaseBefore = released;
  await engine.run(args); assert.equal(released, releaseBefore);

  // Another native operation must await idle release, not merely initiate it.
  await engine.dispose();
  const releaseGate = deferred<void>(); let releaseStarted = false;
  const gatedRuntime = { initLlama: async () => ({ ...ctx, release: () => { releaseStarted = true; return releaseGate.promise; } }) };
  await engine.run({ ...args, runtime: gatedRuntime });
  const pendingDispose = engine.dispose(); await tick(); assert.equal(releaseStarted, true);
  let scanStarted = false;
  const scan = withScrapEngineLock('download', async () => { scanStarted = true; });
  await tick(); assert.equal(scanStarted, false);
  releaseGate.resolve(); await Promise.all([pendingDispose, scan]); assert.equal(scanStarted, true);

  const expiring = new HelperInferenceEngine(5);
  await expiring.run(args); const wasReleased = released;
  await new Promise((resolve) => setTimeout(resolve, 15)); assert.equal(released, wasReleased + 1);
  await expiring.dispose();

  let stoppedLoop = false;
  const loopRuntime = { initLlama: async () => ({ ...ctx,
    stopCompletion: () => { stoppedLoop = true; },
    completion: async (_: object, token?: NonNullable<Parameters<HelperNativeContext['completion']>[1]>) => {
      token?.({ token: 'Use a marker. #Crochet #Crochet #Crochet' });
      assert.equal(stoppedLoop, true);
      return { text: 'Use a marker. #Crochet #Crochet #Crochet' };
    },
  }) };
  assert.equal(await engine.run({ ...args, runtime: loopRuntime }), 'Use a marker.');
  await engine.dispose();
  console.log('Crochet Handy Helper checks passed: fast replies, calculators, streaming, warm reuse/eviction, account isolation, cancellation, timeout, engine lock, and token budget.');
}
void main().catch((error) => { console.error(error); process.exitCode = 1; });
