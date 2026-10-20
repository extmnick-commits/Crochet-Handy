/**
 * Scrap-yarn AI checks that do not load llama.rn.
 * Run with: npx tsx scripts/check-scrap-yarn-ai.ts
 *
 * Native init, GPU, and peak memory are not covered here. Those need a
 * development build on a physical iPhone and Android phone.
 */
import fs from 'node:fs';
import path from 'node:path';

import { compareScrapModelLogs, type ScrapBenchEntry } from '../utils/scrapBench';
import { rankScrapCatalog, readTutorialYards, tutorialMaterialsNote, visionFitReason } from '../utils/scrapCatalogRank';
import { scrapChoiceSchema, validateScrapChoices } from '../utils/scrapModelOutput';
import {
  ANDROID_VISION_PAIR,
  IOS_VISION_PAIR,
  SCRAP_MODEL_PIN,
  visionModelPair,
  type ScrapModelPin,
} from '../utils/scrapModelPin';
import { checkPatternDraft } from '../utils/scrapPatternDraft';
import {
  ScrapChecksumError,
  ScrapEngineBusyError,
  ScrapStorageError,
  ScrapTransferCancelledError,
  createMemoryTransferIO,
  downloadPinnedModel,
  downloadPinnedPair,
  inspectPinnedModel,
  modelTransferStatusLabel,
  scrapEngineLockKind,
  scrapModelPaths,
  verifyPinnedFile,
  type ModelTransferIO,
  type ModelTransferProgress,
} from '../utils/scrapModelTransfer';
import { rankScrapPlans } from '../utils/scrapPlans';
import {
  INFERENCE_TIMEOUT_MS,
  cancelActiveScrapSuggestion,
  resetScrapSessionForTests,
  runPersonalizedScrapSuggestion,
  type ScrapLlamaContext,
  type ScrapLlamaRuntime,
} from '../utils/scrapYarnSession';
import { createSha256, sha256Bytes } from '../utils/sha256';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function equal<T>(actual: T, expected: T, message: string) {
  if (actual !== expected) {
    throw new Error(`${message}\n  actual:   ${String(actual)}\n  expected: ${String(expected)}`);
  }
}

const COLORS = [
  { name: 'Cream', hex: '#F4F1DE' },
  { name: 'Teal', hex: '#2A9D8F' },
];

async function main() {
  checkSha256();
  checkPlans();
  checkCatalogRank();
  checkOutputValidation();
  await checkTransfers();
  await checkSessions();
  checkVisionPins();
  checkVisionCatalog();
  await checkPinnedPairDownload();
  checkPatternDrafts();
  checkComparison();
  checkNativeConfig();
  console.log('scrap yarn AI checks passed');
}

function checkSha256() {
  equal(sha256Bytes(new Uint8Array()), 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855', 'empty sha256');
  equal(
    sha256Bytes(new TextEncoder().encode('abc')),
    'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    'abc sha256',
  );
  const payload = new TextEncoder().encode('chunked-hash');
  const hasher = createSha256();
  hasher.update(payload.subarray(0, 3));
  hasher.update(payload.subarray(3));
  equal(hasher.digest(), sha256Bytes(payload), 'multi-chunk sha256');
}

function checkPlans() {
  const tiny = rankScrapPlans(18);
  equal(tiny.length, 1, '18 yards should leave one plan');
  assert(tiny.every((plan) => plan.estimatedYards <= 18), '18 yard plans stay inside the total');
  const two = rankScrapPlans(22);
  equal(two.length, 2, '22 yards should leave two plans');
  assert(two.every((plan) => plan.estimatedYards <= 22), '22 yard plans stay inside the total');
  equal(rankScrapPlans(5).length, 0, '5 yards should leave no plan');
  const three = rankScrapPlans(100);
  equal(three.length, 3, '100 yards can still cap at three plans');
  assert(three.every((plan) => plan.estimatedYards <= 100), '100 yard plans stay inside the total');
}

function checkCatalogRank() {
  const rows = [
    { id: 'key', title: 'Mini keychain', tags: ['keychain'], yarnWeight: 'worsted' as const, tutorialYards: null },
    { id: 'ami', title: 'Plush amigurumi', tags: ['amigurumi'], yarnWeight: 'worsted' as const, tutorialYards: null },
    { id: 'listed', title: 'Tiny charm', tags: ['charm'], yarnWeight: 'dk' as const, tutorialYards: 40 },
    { id: 'blanket', title: 'Big blanket', tags: ['blanket'], yarnWeight: 'worsted' as const, tutorialYards: null },
  ];
  equal(rankScrapCatalog(rows, { yarnWeight: 'worsted', availableYards: 20, limit: 6 }).length, 0, 'a 25 yd planning class does not fit in 20 yards');
  const fitted = rankScrapCatalog(rows, { yarnWeight: 'worsted', availableYards: 25, limit: 6 });
  equal(fitted.map((card) => card.id).join(','), 'key', 'only the micro tutorial fits 25 yards');
  assert(fitted[0]?.yardageNote.includes('does not list yardage'), 'missing tutorial yardage stays unlabeled');
  assert(!fitted[0]?.yardageNote.includes('Tutorial requirement'), 'planning copy is not a tutorial requirement');
  const listed = rankScrapCatalog(rows, { yarnWeight: 'worsted', availableYards: 50, limit: 6 });
  const listedCard = listed.find((card) => card.id === 'listed');
  assert(listedCard, 'a real tutorial yardage can fit');
  equal(listedCard?.yardageNote, 'Tutorial requirement: 40 yd', 'numeric tutorial yards are shown as a requirement');
  assert(!listed.some((card) => card.id === 'blanket'), 'a blanket is not given a made-up yardage');
  equal(readTutorialYards({ tutorialYards: 12 }), 12, 'numeric tutorial yards are read');
  equal(readTutorialYards({ summary: 'uses 300 yards' }), null, 'prose yardage is not treated as a requirement');
}

function checkOutputValidation() {
  const plans = rankScrapPlans(75);
  const schema = scrapChoiceSchema(
    plans.map((plan) => plan.id),
    COLORS.map((color) => `${color.name} (${color.hex})`),
  );
  const enums = (schema.properties.choices.items.properties.planId.enum as string[]).join(',');
  equal(enums, plans.map((plan) => plan.id).join(','), 'schema only offers plans that fit');
  const tokens = COLORS.map((color) => `${color.name} (${color.hex})`);
  const valid = {
    choices: plans.map((plan, index) => ({
      planId: plan.id,
      layout: plan.layout,
      colors: [tokens[index % tokens.length]],
      estimatedYardage: '9999 yd',
      hookSize: '12.0 mm',
    })),
  };
  const accepted = validateScrapChoices(JSON.stringify(valid), plans, COLORS, 'worsted', 75);
  assert(accepted.ideas, 'extra yardage text does not replace the plan');
  equal(accepted.violations, 0, 'valid choices have no violations');
  equal(accepted.ideas?.[0]?.estimatedYards, plans[0]?.estimatedYards, 'yardage stays on the plan');
  equal(accepted.ideas?.[0]?.hookSize, '5.0 mm', 'hook size stays on the yarn weight');

  const unknownColor = structuredClone(valid);
  unknownColor.choices[0].colors = ['Magenta (#FF00FF)'];
  const rejectedColor = validateScrapChoices(JSON.stringify(unknownColor), plans, COLORS, 'worsted', 75);
  equal(rejectedColor.ideas, null, 'unknown colors are rejected');

  const unknownPlan = structuredClone(valid);
  unknownPlan.choices[0].planId = 'not-a-plan';
  equal(validateScrapChoices(JSON.stringify(unknownPlan), plans, COLORS, 'worsted', 75).ideas, null, 'unknown plans are rejected');

  const duplicate = structuredClone(valid);
  duplicate.choices[1].planId = duplicate.choices[0].planId;
  equal(validateScrapChoices(JSON.stringify(duplicate), plans, COLORS, 'worsted', 75).ideas, null, 'duplicate plans are rejected');

  const quantity = structuredClone(valid);
  (quantity.choices[0] as { quantity?: number }).quantity = 5000;
  equal(validateScrapChoices(JSON.stringify(quantity), plans, COLORS, 'worsted', 75).ideas, null, 'invalid quantities are rejected');

  equal(validateScrapChoices('{"choices":[]}', plans, COLORS, 'worsted', 75).ideas, null, 'incomplete output is rejected');
  equal(validateScrapChoices('not json', plans, COLORS, 'worsted', 75).ideas, null, 'non-json output is rejected');
}

async function checkTransfers() {
  const bytes = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]);
  const pin: ScrapModelPin = {
    id: 'test-model',
    filename: 'model.gguf',
    revision: 'rev-1',
    url: 'https://example.test/model.gguf',
    bytes: bytes.length,
    sha256: sha256Bytes(bytes),
  };
  const paths = scrapModelPaths('memory://models/', pin.filename);

  const truncated = createMemoryTransferIO();
  truncated.setDownload(async () => bytes.slice(0, 4));
  await expectReject(downloadPinnedModel(truncated.io, pin, paths, undefined, undefined, 3), ScrapChecksumError, 'truncated download removes the partial');
  assert(!truncated.has(paths.partial) && !truncated.has(paths.final), 'truncated download does not promote the file');

  const flipped = new Uint8Array(bytes);
  flipped[3] = 9;
  const corrupt = createMemoryTransferIO();
  corrupt.setDownload(async () => flipped);
  await expectReject(downloadPinnedModel(corrupt.io, pin, paths, undefined, undefined, 3), ScrapChecksumError, 'flipped byte');
  assert(!corrupt.events.some((event) => event.startsWith('move:')), 'a bad checksum is not promoted');
  assert(!corrupt.has(paths.final), 'a bad checksum leaves no final file');

  const good = createMemoryTransferIO();
  good.setDownload(async ({ onProgress }) => {
    onProgress(bytes.length, bytes.length);
    return bytes;
  });
  await downloadPinnedModel(good.io, pin, paths, undefined, undefined, 3);
  assert(good.has(paths.final), 'verified file is promoted');
  assert(!good.has(paths.partial), 'partial file is removed after promotion');
  const moveAt = good.events.findIndex((event) => event.startsWith('move:'));
  const readAt = good.events.findIndex((event) => event.startsWith('read:'));
  assert(readAt >= 0 && moveAt > readAt, 'the file is hashed before it is promoted');

  const legacy = createMemoryTransferIO();
  legacy.put(paths.final, bytes);
  const legacyStatus = await inspectPinnedModel(legacy.io, pin, paths, undefined, 3);
  equal(legacyStatus, 'ready', 'an older download with the right bytes is accepted');
  assert(legacy.has(paths.receipt), 'a receipt is stored after the first hash');
  legacy.events.length = 0;
  equal(await inspectPinnedModel(legacy.io, pin, paths, undefined, 3), 'ready', 'a matching receipt skips another hash');
  assert(!legacy.events.some((event) => event.startsWith('read:')), 'receipt cache does not reread the file');

  const replaced = createMemoryTransferIO();
  replaced.put(paths.final, flipped);
  equal(await inspectPinnedModel(replaced.io, pin, paths, undefined, 3), 'missing', 'a corrupt saved file is removed');
  assert(!replaced.has(paths.final), 'corrupt saved bytes are deleted');

  const oversized: ModelTransferIO = {
    availableBytes: () => 0,
    fileSize: async (file) => (file.endsWith('.gguf') ? 400 * 1024 * 1024 + 1 : null),
    fileStamp: async () => 1,
    readChunk: () => {
      throw new Error('hashed a file that failed the size check');
    },
    deleteFile: () => undefined,
    moveFile: () => undefined,
    readText: () => null,
    writeText: () => undefined,
    download: async () => undefined,
  };
  const hugePaths = scrapModelPaths('memory://models/', SCRAP_MODEL_PIN.filename);
  equal(await verifyPinnedFile(oversized, SCRAP_MODEL_PIN, hugePaths), 'invalid', 'a file over 400 MB is not ready unless it is the pinned size');

  const nativeHash = createMemoryTransferIO();
  nativeHash.setDownload(async () => bytes);
  let hashedPath = '';
  const nativeIo: ModelTransferIO = {
    ...nativeHash.io,
    async hashFile(path) {
      hashedPath = path;
      return pin.sha256;
    },
  };
  await downloadPinnedModel(nativeIo, pin, paths);
  equal(hashedPath, paths.partial, 'a native hash reads the partial download');
  assert(!nativeHash.events.some((event) => event.startsWith('read:')), 'a native hash does not read the file in JavaScript');
  assert(nativeHash.has(paths.final) && nativeHash.has(paths.receipt), 'a native hash still writes the receipt');

  const badNative = createMemoryTransferIO();
  badNative.setDownload(async () => bytes);
  const badNativeIo: ModelTransferIO = {
    ...badNative.io,
    async hashFile() {
      return 'ab'.repeat(32);
    },
  };
  await expectReject(downloadPinnedModel(badNativeIo, pin, paths), ScrapChecksumError, 'a native hash mismatch removes the partial');
  assert(!badNative.has(paths.partial) && !badNative.has(paths.final), 'a mismatched native hash is not kept');

  const cancelHash = createMemoryTransferIO();
  cancelHash.setDownload(async () => bytes);
  let hashing = false;
  const cancelHashIo: ModelTransferIO = {
    ...cancelHash.io,
    async hashFile(_path, _size, _onHashed, cancelled) {
      hashing = true;
      if (cancelled?.()) throw new ScrapTransferCancelledError();
      return pin.sha256;
    },
  };
  await expectReject(
    downloadPinnedModel(cancelHashIo, pin, paths, undefined, { cancelled: () => hashing, bind() {} }),
    ScrapTransferCancelledError,
    'cancel during native hash',
  );
  assert(!cancelHash.has(paths.partial) && !cancelHash.has(paths.final), 'a cancelled native hash deletes the partial');

  const kept = createMemoryTransferIO();
  kept.put(paths.final, bytes);
  const diskIo: ModelTransferIO = {
    ...kept.io,
    async hashFile() {
      throw new Error('disk');
    },
  };
  let diskError: unknown = null;
  try {
    await inspectPinnedModel(diskIo, pin, paths);
  } catch (error) {
    diskError = error;
  }
  assert(diskError instanceof Error && diskError.message === 'disk', 'a hash failure stays an error');
  assert(kept.has(paths.final), 'a hash error does not delete the saved file');

  const receiptIoBase = createMemoryTransferIO();
  receiptIoBase.put(paths.final, bytes);
  let hashCalls = 0;
  const receiptIo: ModelTransferIO = {
    ...receiptIoBase.io,
    async hashFile() {
      hashCalls += 1;
      return pin.sha256;
    },
  };
  equal(await inspectPinnedModel(receiptIo, pin, paths), 'ready', 'the first native hash accepts the pinned file');
  equal(hashCalls, 1, 'the first inspect hashes once');
  equal(await inspectPinnedModel(receiptIo, pin, paths), 'ready', 'a matching receipt skips the native hash');
  equal(hashCalls, 1, 'a matching receipt does not hash again');

  equal(
    modelTransferStatusLabel({
      phase: 'download',
      written: 1,
      total: 2,
      ratio: 0.5,
      fileLabel: 'language model',
      fileIndex: 0,
      fileCount: 2,
    }),
    'Downloading language model (1 of 2)',
    'download status names the language file',
  );
  equal(
    modelTransferStatusLabel({
      phase: 'verify',
      written: 2,
      total: 2,
      ratio: 1,
      fileLabel: 'image projector',
      fileIndex: 1,
      fileCount: 2,
    }),
    'Verifying image projector (2 of 2)',
    'verify status names the projector',
  );

  const tight = createMemoryTransferIO({ available: 1024 });
  tight.setDownload(async () => bytes);
  await expectReject(downloadPinnedModel(tight.io, pin, paths), ScrapStorageError, 'storage check');
  assert(!tight.events.some((event) => event.startsWith('download:')), 'low storage does not start the download');

  let cancelFlag = false;
  const cancelIo = createMemoryTransferIO();
  cancelIo.setDownload(async ({ cancelled }) => {
    await new Promise((resolve) => setTimeout(resolve, 10));
    if (cancelled()) throw new ScrapTransferCancelledError();
    return bytes;
  });
  const cancelToken = {
    cancelled: () => cancelFlag,
    bind(nativeCancel: () => void) {
      if (cancelFlag) nativeCancel();
    },
  };
  const pending = downloadPinnedModel(cancelIo.io, pin, paths, undefined, cancelToken, 3);
  cancelFlag = true;
  await expectReject(pending, ScrapTransferCancelledError, 'cancel during download');
  assert(!cancelIo.has(paths.partial) && !cancelIo.has(paths.final), 'cancelled download deletes the partial');

  const busyIo = createMemoryTransferIO();
  const releaseDownload: { current: ((bytes: Uint8Array) => void) | null } = { current: null };
  busyIo.setDownload(
    () =>
      new Promise((resolve) => {
        releaseDownload.current = resolve;
      }),
  );
  const first = downloadPinnedModel(busyIo.io, pin, paths);
  await expectReject(downloadPinnedModel(busyIo.io, pin, paths), ScrapEngineBusyError, 'overlapping download');
  for (let attempt = 0; attempt < 5 && !releaseDownload.current; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  assert(releaseDownload.current, 'the first download should be waiting');
  releaseDownload.current(bytes);
  await first;
  equal(scrapEngineLockKind(), null, 'download lock is released');
}

async function checkSessions() {
  resetScrapSessionForTests();
  const plans = rankScrapPlans(75);
  const text = JSON.stringify({
    choices: plans.map((plan) => ({
      planId: plan.id,
      layout: plan.layout,
      colors: [`${COLORS[0].name} (${COLORS[0].hex})`],
    })),
  });

  const initCalls: { n_gpu_layers: number; devices?: string[] }[] = [];
  const resolveInit: { current: ((context: ScrapLlamaContext) => void) | null } = { current: null };
  let released = 0;
  let completions = 0;
  const runtime: ScrapLlamaRuntime = {
    initLlama: (params) => {
      initCalls.push({ n_gpu_layers: params.n_gpu_layers, devices: params.devices });
      return new Promise((resolve) => {
        resolveInit.current = resolve;
      });
    },
  };
  const pending = runPersonalizedScrapSuggestion({
    runtime,
    supported: true,
    modelReady: true,
    modelPath: 'file://model.gguf',
    platform: 'ios',
    colors: COLORS,
    weight: 'worsted',
    availableYards: 75,
  });
  const overlapping = runPersonalizedScrapSuggestion({
    runtime,
    supported: true,
    modelReady: true,
    modelPath: 'file://model.gguf',
    platform: 'ios',
    colors: COLORS,
    weight: 'worsted',
    availableYards: 75,
  });
  equal(initCalls.length, 1, 'a second tap does not start another session');
  equal(scrapEngineLockKind(), 'load', 'the engine lock is held during init');
  cancelActiveScrapSuggestion();
  resolveInit.current?.(contextFrom(text, () => {
    released += 1;
  }, () => {
    completions += 1;
  }));
  const cancelled = await pending;
  await overlapping;
  assert(cancelled.discarded, 'cancel during init discards the result');
  equal(completions, 0, 'cancel during init does not generate');
  equal(released, 1, 'cancel during init still releases the context');
  equal(scrapEngineLockKind(), null, 'the lock is released after init is released');

  resetScrapSessionForTests();
  let stop: () => void = () => undefined;
  let generationReleased = 0;
  let generationStarted: () => void = () => undefined;
  const generationGate = new Promise<void>((resolve) => {
    generationStarted = resolve;
  });
  const generatingRuntime: ScrapLlamaRuntime = {
    initLlama: async () => ({
      gpu: true,
      devices: ['Metal'],
      reasonNoGPU: '',
      completion: () => {
        generationStarted();
        return new Promise((_resolve, reject) => {
          stop = () => reject(new Error('stopped'));
        });
      },
      stopCompletion: async () => stop(),
      release: async () => {
        generationReleased += 1;
      },
    }),
  };
  const running = runPersonalizedScrapSuggestion({
    runtime: generatingRuntime,
    supported: true,
    modelReady: true,
    modelPath: 'file://model.gguf',
    platform: 'ios',
    colors: COLORS,
    weight: 'worsted',
    availableYards: 75,
  });
  await generationGate;
  cancelActiveScrapSuggestion();
  const stopped = await running;
  assert(stopped.discarded, 'cancel during generation discards the result');
  equal(generationReleased, 1, 'cancel during generation releases the context');

  resetScrapSessionForTests();
  const timed = await runPersonalizedScrapSuggestion({
    runtime: {
      initLlama: async () =>
        contextFrom(text, () => undefined, () => undefined, () => new Promise(() => undefined)),
    },
    supported: true,
    modelReady: true,
    modelPath: 'file://model.gguf',
    platform: 'android',
    colors: COLORS,
    weight: 'worsted',
    availableYards: 75,
    timeoutMs: INFERENCE_TIMEOUT_MS,
    scheduleTimeout: (_ms, fn) => {
      fn();
      return { cancel() {} };
    },
  });
  assert(!timed.discarded, 'a timeout still returns offline ideas');
  equal(timed.source, 'offline-rules', 'timeout falls back offline');
  assert(timed.note?.includes('too long'), 'timeout explains the fallback');

  resetScrapSessionForTests();
  const androidCalls: number[] = [];
  const android = await runPersonalizedScrapSuggestion({
    runtime: {
      initLlama: async (params) => {
        androidCalls.push(params.n_gpu_layers);
        if (params.n_gpu_layers > 0) throw new Error('gpu init failed');
        return contextFrom(text, () => undefined, () => undefined);
      },
    },
    supported: true,
    modelReady: true,
    modelPath: 'file://model.gguf',
    platform: 'android',
    colors: COLORS,
    weight: 'worsted',
    availableYards: 75,
    scheduleTimeout: (_ms, _fn) => ({ cancel() {} }),
  });
  equal(androidCalls.join(','), '99,0', 'Android retries on CPU after GPU init fails');
  equal(android.source, 'local-ai', 'CPU retry can still personalize');
  assert(!androidCalls.some((layers) => layers !== 99 && layers !== 0), 'CPU retry does not pass a GPU layer count');

  resetScrapSessionForTests();
  const failed = await runPersonalizedScrapSuggestion({
    runtime: {
      initLlama: async () => {
        throw new Error('both backends failed');
      },
    },
    supported: true,
    modelReady: true,
    modelPath: 'file://model.gguf',
    platform: 'android',
    colors: COLORS,
    weight: 'worsted',
    availableYards: 75,
  });
  equal(failed.source, 'offline-rules', 'a failed Android CPU retry stays offline');
  equal(scrapEngineLockKind(), null, 'a failed init releases the lock');
}

function checkVisionPins() {
  assert(visionModelPair('web') == null, 'web has no vision pair');
  equal(IOS_VISION_PAIR.text.filename.includes('Q4_K_M'), true, 'iOS text file is the Metal quant');
  equal(IOS_VISION_PAIR.projector.filename.includes('Q8_0'), true, 'iOS projector is Q8_0');
  equal(ANDROID_VISION_PAIR.text.filename.includes('Q4_0'), true, 'Android text file is the OpenCL quant');
  equal(ANDROID_VISION_PAIR.projector.filename.includes('F16') || ANDROID_VISION_PAIR.projector.filename.includes('f16'), true, 'Android projector is F16');
  assert(IOS_VISION_PAIR.text.revision !== ANDROID_VISION_PAIR.text.revision, 'the two platforms keep their own conversions');
  for (const pair of [IOS_VISION_PAIR, ANDROID_VISION_PAIR]) {
    assert(pair.text.url.includes(pair.text.revision), 'vision text URL is pinned');
    assert(pair.projector.url.includes(pair.projector.revision), 'projector URL is pinned');
    assert(!pair.text.url.includes('/resolve/main/'), 'vision text URL does not track main');
    assert(pair.text.sha256.length === 64 && pair.projector.sha256.length === 64, 'vision hashes are sha256');
    assert(pair.text.bytes > 0 && pair.projector.bytes > 0, 'vision sizes are pinned');
  }
}

function checkVisionCatalog() {
  assert(visionFitReason('worsted', 'worsted', 'small').includes('matches'), 'an exact weight is explained');
  assert(visionFitReason('dk', 'worsted', 'micro').includes('close'), 'an adjacent weight is explained');
  equal(tutorialMaterialsNote(null), 'This tutorial does not list materials.', 'missing materials stay unlabeled');
  assert(
    tutorialMaterialsNote([{ name: 'Yarn', weight: 'Worsted', yardage: '40 yd' }]).includes('40 yd'),
    'recorded materials are shown',
  );
  assert(!visionFitReason('worsted', 'worsted', 'small').toLowerCase().includes('guaranteed'), 'a reason does not guarantee the leftovers');
}

async function checkPinnedPairDownload() {
  const memory = createMemoryTransferIO();
  const textPin: ScrapModelPin = {
    id: 'text',
    filename: 'text.gguf',
    revision: 'abc',
    url: 'https://example.test/text.gguf',
    bytes: 4,
    sha256: '',
  };
  const projectorPin: ScrapModelPin = {
    id: 'proj',
    filename: 'proj.gguf',
    revision: 'abc',
    url: 'https://example.test/proj.gguf',
    bytes: 4,
    sha256: '',
  };
  const textBytes = new Uint8Array([1, 2, 3, 4]);
  const projectorBytes = new Uint8Array([5, 6, 7, 8]);
  textPin.sha256 = sha256Bytes(textBytes);
  projectorPin.sha256 = sha256Bytes(projectorBytes);
  memory.setDownload(async ({ destination, onProgress, cancelled }) => {
    if (cancelled()) throw new ScrapTransferCancelledError();
    const body = destination.includes('proj') ? projectorBytes : textBytes;
    onProgress(body.length, body.length);
    return body;
  });
  const pairUpdates: ModelTransferProgress[] = [];
  const saved = await downloadPinnedPair(
    memory.io,
    [
      { pin: textPin, paths: scrapModelPaths('mem/', textPin.filename), label: 'language model' },
      { pin: projectorPin, paths: scrapModelPaths('mem/', projectorPin.filename), label: 'image projector' },
    ],
    (update) => pairUpdates.push(update),
  );
  equal(saved.length, 2, 'a vision pair downloads both files');
  assert(
    pairUpdates.some((update) => update.phase === 'download' && update.fileLabel === 'language model' && update.fileIndex === 0 && update.fileCount === 2),
    'the language file is labeled while it downloads',
  );
  assert(
    pairUpdates.some((update) => update.phase === 'verify' && update.fileLabel === 'image projector' && update.fileIndex === 1 && update.fileCount === 2),
    'the projector is labeled while it is verified',
  );
  memory.put(scrapModelPaths('mem/', projectorPin.filename).partial, new Uint8Array([1]));
  const corruptPin = { ...projectorPin, sha256: 'f'.repeat(64), bytes: 1 };
  await expectReject(
    downloadPinnedPair(memory.io, [
      { pin: textPin, paths: scrapModelPaths('mem/', textPin.filename) },
      { pin: corruptPin, paths: scrapModelPaths('mem/', 'broken.gguf') },
    ]),
    ScrapChecksumError,
    'a corrupt projector',
  );
}

function checkPatternDrafts() {
  const request = {
    make: 'coaster',
    size: '4 inches',
    skill: 'beginner' as const,
    yarnCategory: 'worsted' as const,
    yards: 20,
  };
  const rectangle = checkPatternDraft(
    JSON.stringify({
      shape: 'sc-rectangle',
      title: 'Draft coaster',
      stitchesAcross: 10,
      rows: 4,
      hookMm: 5,
      gaugeNote: 'Assumed gauge: 14 sc and 16 rows = 4 inches.',
      abbreviations: [
        { abbr: 'ch', meaning: 'chain' },
        { abbr: 'sc', meaning: 'single crochet' },
      ],
      materials: 'Worsted yarn and a 5.0 mm hook. Rough draft estimate is under the yards you entered.',
      instructions: [1, 2, 3, 4].map((n) => ({
        n,
        text: n === 1 ? 'Chain 11. Single crochet in the second chain and across.' : n === 4 ? 'Chain 1, turn, single crochet across. Fasten off.' : 'Chain 1, turn, single crochet across.',
        stitchCount: 10,
      })),
    }),
    request,
  );
  equal(rectangle.kind, 'draft', 'a correct rectangle passes');
  if (rectangle.kind === 'draft') assert(rectangle.banner.includes('Not tested'), 'a passing draft says it is not tested');

  const broken = checkPatternDraft(
    JSON.stringify({
      shape: 'sc-circle',
      title: 'Circle',
      rounds: 3,
      hookMm: 5,
      gaugeNote: 'Assumed gauge.',
      abbreviations: [
        { abbr: 'ch', meaning: 'chain' },
        { abbr: 'sc', meaning: 'single crochet' },
      ],
      materials: 'Worsted yarn.',
      instructions: [
        { n: 1, text: 'Magic ring, 6 sc.', stitchCount: 6 },
        { n: 2, text: 'Increase around.', stitchCount: 12 },
        { n: 3, text: 'Continue. Fasten off.', stitchCount: 16 },
      ],
    }),
    request,
  );
  equal(broken.kind, 'rejected', 'a broken increase is rejected');

  const open = checkPatternDraft(
    JSON.stringify({
      shape: 'sc-rectangle',
      title: 'Open row',
      stitchesAcross: 8,
      rows: 2,
      hookMm: 5,
      gaugeNote: 'Assumed gauge.',
      abbreviations: [
        { abbr: 'ch', meaning: 'chain' },
        { abbr: 'sc', meaning: 'single crochet' },
      ],
      materials: 'Worsted yarn.',
      instructions: [
        { n: 1, text: 'Chain 9. Single crochet across.', stitchCount: 8 },
        { n: 2, text: 'Chain 1, turn, single crochet across.', stitchCount: 8 },
      ],
    }),
    request,
  );
  equal(open.kind, 'rejected', 'a missing fasten-off is rejected');

  const overClaim = checkPatternDraft(
    JSON.stringify({
      shape: 'sc-rectangle',
      title: 'Too big',
      stitchesAcross: 40,
      rows: 30,
      hookMm: 5,
      gaugeNote: 'Assumed gauge.',
      abbreviations: [
        { abbr: 'ch', meaning: 'chain' },
        { abbr: 'sc', meaning: 'single crochet' },
      ],
      materials: 'Worsted yarn. These leftovers are enough.',
      instructions: Array.from({ length: 30 }, (_, index) => ({
        n: index + 1,
        text: index === 0 ? 'Chain 41. Single crochet across. Fasten off.' : 'Chain 1, turn, single crochet across. Fasten off.',
        stitchCount: 40,
      })),
    }),
    { ...request, yards: 10 },
  );
  equal(overClaim.kind, 'rejected', 'an over-claim of yardage is rejected');

  const sweater = checkPatternDraft(JSON.stringify({ shape: 'unsupported', title: '', hookMm: 5, gaugeNote: '', abbreviations: [], materials: '', instructions: [] }), request);
  equal(sweater.kind, 'unsupported', 'a sweater request stays unsupported');
  assert(sweater.kind === 'unsupported' && !('instructions' in sweater), 'an unsupported shape has no instructions');
}

function checkComparison() {
  const current = bench('qwen2.5-1.5b-instruct-q4_k_m', SCRAP_MODEL_PIN.bytes, true, 1200, null);
  const smaller = bench('qwen2.5-0.5b-instruct-q4_k_m', 397808192, true, 800, null);
  const incomplete = compareScrapModelLogs([current], [smaller]);
  equal(incomplete.winner, null, 'missing peak memory does not name a winner');
  assert(incomplete.reason.includes('does not name a faster or better model'), 'missing measurements stay unclaimed');
  const measured = compareScrapModelLogs(
    [{ ...current, peakMemoryBytes: 900_000_000, valid: false, violations: 2 }],
    [{ ...smaller, peakMemoryBytes: 400_000_000 }],
  );
  equal(measured.winner, smaller.modelId, 'a complete log can rank the supplied runs');
  assert(measured.reason.includes('supplied device logs'), 'a ranking stays tied to the supplied logs');
}

function checkNativeConfig() {
  const config = fs.readFileSync(path.join(process.cwd(), 'app.config.js'), 'utf8');
  assert(!config.includes('enableMetal:'), 'enableMetal is not passed to the llama.rn plugin');
  assert(!config.includes('enableVulkan:'), 'enableVulkan is not passed to the llama.rn plugin');
  assert(!config.includes("'libvulkan.so'"), 'libvulkan.so is not added to the manifest');
  assert(config.includes('RNLLAMA_DISABLE_METAL'), 'iOS Metal stays enabled through the Pod env');
  assert(config.includes('enableOpenCLAndHexagon: true'), 'OpenCL and optional Hexagon stay in the plugin');
  assert(SCRAP_MODEL_PIN.url.includes(SCRAP_MODEL_PIN.revision), 'the download URL is pinned to a revision');
  assert(!SCRAP_MODEL_PIN.url.includes('/resolve/main/'), 'the download URL does not track main');
  equal(SCRAP_MODEL_PIN.bytes, 986048768, 'pinned model size');
}

function bench(
  modelId: string,
  downloadBytes: number,
  valid: boolean,
  latencyMs: number | null,
  peakMemoryBytes: number | null,
): ScrapBenchEntry {
  return {
    modelId,
    downloadBytes,
    inputId: 'worsted:75:Cream',
    valid,
    violations: valid ? 0 : 1,
    latencyMs,
    peakMemoryBytes,
    gpu: false,
    devices: [],
    reasonNoGPU: 'not measured',
  };
}

function contextFrom(
  text: string,
  onRelease: () => void,
  onComplete: () => void,
  completion?: ScrapLlamaContext['completion'],
): ScrapLlamaContext {
  return {
    gpu: false,
    devices: [],
    reasonNoGPU: 'cpu',
    completion:
      completion ??
      (async () => {
        onComplete();
        return { text };
      }),
    stopCompletion: async () => undefined,
    release: async () => onRelease(),
  };
}

async function expectReject(pending: Promise<unknown>, type: new (...args: never[]) => Error, message: string) {
  try {
    await pending;
  } catch (error) {
    assert(error instanceof type, `${message} threw ${error instanceof Error ? error.name : 'unknown'}`);
    return;
  }
  throw new Error(`${message} did not throw`);
}

void main().catch((error) => {
  console.error(error);
  process.exit(1);
});
