/**
 * One on-device vision pass. The photo is a local file URI in the user message.
 * A failed or unsupported device does not receive preset findings.
 */
import { withScrapEngineLock, ScrapEngineBusyError, resetScrapEngineLockForTests } from '@/utils/scrapModelTransfer';
import {
  checkPatternDraft,
  patternDraftPrompt,
  PATTERN_DRAFT_SCHEMA,
  type PatternDraftCheck,
  type PatternDraftRequest,
} from '@/utils/scrapPatternDraft';
import { visionModelPair, type VisionModelPair } from '@/utils/scrapModelPin';
import { VISION_SCAN_PROFILES, type VisionScanDetail } from '@/utils/scrapVisionConfig';
import {
  parseVisionFindings,
  VISION_FINDINGS_SCHEMA,
  VISION_SYSTEM_PROMPT,
  VISION_USER_PROMPT,
  type YarnVisionFindings,
} from '@/utils/scrapVisionOutput';

export const VISION_TIMEOUT_MS = 300_000;
export const VISION_TIMEOUT_ANDROID_MS = 720_000;
export const VISION_CONTEXT_TOKENS = 2048;
/** JSON findings rarely need more than ~120 tokens; a lower cap speeds decode. */
export const VISION_QUICK_N_PREDICT = 160;

const VISION_POOL_TTL_MS = 10 * 60 * 1000;

type VisionPoolEntry = {
  cacheKey: string;
  context: VisionLlamaContext;
  touchedAt: number;
};

let visionPool: VisionPoolEntry | null = null;
let visionWarmInFlight: Promise<void> | null = null;

const visionDevLog = (label: string, detail: string): void => {
  if (typeof __DEV__ !== 'undefined' && __DEV__) {
    console.warn(label, detail);
  }
};

class VisionMultimodalError extends Error {
  constructor() {
    super('vision-multimodal-unavailable');
    this.name = 'VisionMultimodalError';
  }
}

export type VisionSessionPlatform = 'ios' | 'android' | 'web' | 'macos' | 'windows';

type VisionCompletionTimings = {
  prompt_n?: number;
  prompt_ms?: number;
  predicted_n?: number;
  predicted_ms?: number;
};

type VisionCompletionResult = {
  text?: string;
  timings?: VisionCompletionTimings;
};

export type VisionLlamaContext = {
  gpu: boolean;
  devices?: string[];
  reasonNoGPU?: string;
  androidLib?: string;
  initMultimodal: (params: { path: string; use_gpu?: boolean; image_max_tokens?: number }) => Promise<boolean>;
  isMultimodalEnabled: () => Promise<boolean>;
  getMultimodalSupport: () => Promise<{ vision: boolean; audio: boolean }>;
  releaseMultimodal: () => Promise<void>;
  completion: (params: Record<string, unknown>) => Promise<VisionCompletionResult>;
  stopCompletion: () => void | Promise<void>;
  release: () => Promise<void>;
};

export type VisionLlamaRuntime = {
  initLlama: (params: {
    model: string;
    n_ctx: number;
    n_gpu_layers: number;
    ctx_shift: false;
  }) => Promise<VisionLlamaContext>;
};

export type VisionAnalysisResult =
  | { status: 'findings'; findings: YarnVisionFindings; photoGeneration: number }
  | { status: 'discarded' }
  | { status: 'cancelled' }
  | { status: 'unsupported'; message: string }
  | { status: 'failed'; message: string };

export type VisionAnalysisArgs = {
  runtime: VisionLlamaRuntime | null;
  supported: boolean;
  platform: VisionSessionPlatform;
  modelPath: string;
  projectorPath: string;
  imageUri: string;
  scanDetail?: VisionScanDetail;
  photoGeneration: number;
  isCurrent: () => boolean;
  timeoutMs?: number;
  scheduleTimeout?: (ms: number, fn: () => void) => { cancel: () => void };
  onPhase?: (phase: 'load' | 'read') => void;
};

type SessionControl = {
  cancelled: boolean;
  context: VisionLlamaContext | null;
  cancel: () => void;
};

let activeControl: SessionControl | null = null;
let inFlight: Promise<VisionAnalysisResult> | null = null;
let inFlightKey: string | null = null;

export function resetVisionSessionForTests(): void {
  activeControl?.cancel();
  activeControl = null;
  inFlight = null;
  inFlightKey = null;
  void disposeVisionPool();
  resetScrapEngineLockForTests();
}

function buildVisionCacheKey(modelPath: string, projectorPath: string, imageTokens: number): string {
  return `${modelPath}\n${projectorPath}\n${imageTokens}`;
}

function visionPoolExpired(entry: VisionPoolEntry): boolean {
  return Date.now() - entry.touchedAt > VISION_POOL_TTL_MS;
}

async function disposeVisionPool(): Promise<void> {
  const entry = visionPool;
  visionPool = null;
  if (entry) await releaseContext(entry.context);
}

async function ensureVisionPoolEntry(args: {
  runtime: VisionLlamaRuntime;
  modelPath: string;
  projectorPath: string;
  platform: VisionSessionPlatform;
  imageTokens: number;
}): Promise<VisionLlamaContext> {
  const cacheKey = buildVisionCacheKey(args.modelPath, args.projectorPath, args.imageTokens);
  const existing = visionPool;
  if (existing?.cacheKey === cacheKey && !visionPoolExpired(existing)) {
    existing.touchedAt = Date.now();
    return existing.context;
  }
  if (existing) await disposeVisionPool();
  const context = await initVisionContext(args.runtime, args.modelPath, args.platform, VISION_CONTEXT_TOKENS);
  const enabled = await context.initMultimodal({
    path: args.projectorPath,
    use_gpu: args.platform === 'ios',
    image_max_tokens: args.imageTokens,
  });
  const support = enabled ? await context.getMultimodalSupport() : { vision: false, audio: false };
  if (!enabled || !support.vision) {
    await releaseContext(context);
    throw new VisionMultimodalError();
  }
  visionPool = { cacheKey, context, touchedAt: Date.now() };
  return context;
}

/** Load the vision model while the user is still picking a photo (best-effort). */
export function warmVisionAnalysisPool(args: {
  runtime: VisionLlamaRuntime;
  platform: VisionSessionPlatform;
  modelPath: string;
  projectorPath: string;
  scanDetail?: VisionScanDetail;
}): Promise<void> {
  const imageTokens = VISION_SCAN_PROFILES[args.scanDetail ?? 'quick'].imageTokens;
  const cacheKey = buildVisionCacheKey(args.modelPath, args.projectorPath, imageTokens);
  if (visionPool?.cacheKey === cacheKey && !visionPoolExpired(visionPool)) {
    return Promise.resolve();
  }
  if (visionWarmInFlight) return visionWarmInFlight;
  visionWarmInFlight = withScrapEngineLock('load', async () => {
    try {
      await ensureVisionPoolEntry({ ...args, imageTokens });
    } catch {
      // Warming is optional; the scan path loads on demand.
    }
  }).finally(() => {
    visionWarmInFlight = null;
  });
  return visionWarmInFlight;
}

export function cancelActiveVisionAnalysis(): void {
  activeControl?.cancel();
}

export function visionInitPlan(platform: VisionSessionPlatform): VisionModelPair | null {
  return visionModelPair(platform);
}

export function runVisionAnalysis(args: VisionAnalysisArgs): Promise<VisionAnalysisResult> {
  const key = JSON.stringify([args.modelPath, args.projectorPath, args.imageUri, args.photoGeneration, args.scanDetail ?? 'quick']);
  if (inFlight) {
    if (inFlightKey === key) return inFlight;
    return Promise.resolve({ status: 'failed', message: 'On-device analysis is busy stopping the previous scan. Try again in a moment.' });
  }
  inFlightKey = key;
  const promise = executeVision(args);
  inFlight = promise;
  void promise.finally(() => {
    if (inFlight === promise) {
      inFlight = null;
      inFlightKey = null;
    }
  });
  return promise;
}

async function executeVision(args: VisionAnalysisArgs): Promise<VisionAnalysisResult> {
  const pair = visionModelPair(args.platform);
  if (!args.supported || !args.runtime || !pair) {
    return {
      status: 'unsupported',
      message: 'Image analysis needs the installed iPhone or Android app. This device cannot inspect the photo.',
    };
  }
  if (!args.modelPath || !args.projectorPath || !args.imageUri.startsWith('file://')) {
    return { status: 'failed', message: 'The photo could not be prepared for on-device analysis.' };
  }
  const control = createControl();
  activeControl = control;
  try {
    return await withScrapEngineLock('load', async () => {
      let context: VisionLlamaContext | null = null;
      let loaded = false;
      const startedAt = Date.now();
      const imageTokens = VISION_SCAN_PROFILES[args.scanDetail ?? 'quick'].imageTokens;
      try {
        args.onPhase?.('load');
        context = await ensureVisionPoolEntry({
          runtime: args.runtime!,
          modelPath: args.modelPath,
          projectorPath: args.projectorPath,
          platform: args.platform,
          imageTokens,
        });
        loaded = true;
        control.context = context;
        if (control.cancelled) return { status: 'cancelled' };
        if (!args.isCurrent()) return { status: 'discarded' };
        args.onPhase?.('read');
        const readAt = Date.now();
        const completion = context.completion(visionCompletionParams(args.imageUri, args.scanDetail ?? 'quick'));
        const outcome = await raceCompletion(
          completion,
          context,
          control,
          args.timeoutMs ?? visionInferenceTimeoutMs(args.platform),
          args.scheduleTimeout,
        );
        if (outcome.kind === 'ok') {
          const detail = args.scanDetail ?? 'quick';
          visionDevLog('[vision-measure]', JSON.stringify({
            detail,
            longEdge: VISION_SCAN_PROFILES[detail].longEdge,
            imageTokens: VISION_SCAN_PROFILES[detail].imageTokens,
            contextTokens: VISION_CONTEXT_TOKENS,
            loadMs: readAt - startedAt,
            nativeMs: Date.now() - readAt,
            totalMs: Date.now() - startedAt,
            promptN: outcome.timings?.prompt_n ?? null,
            promptMs: outcome.timings?.prompt_ms ?? null,
            predictedN: outcome.timings?.predicted_n ?? null,
            predictedMs: outcome.timings?.predicted_ms ?? null,
            gpu: context.gpu,
            devices: context.devices ?? [],
            reasonNoGPU: context.reasonNoGPU ?? '',
            androidLib: context.androidLib ?? '',
          }));
        }
        if (outcome.kind === 'cancelled') return { status: 'cancelled' };
        if (!args.isCurrent()) return { status: 'discarded' };
        if (outcome.kind === 'failed') {
          return { status: 'failed', message: outcome.message };
        }
        if (outcome.kind === 'timeout') {
          return { status: 'failed', message: 'Image analysis took too long and was stopped. The photo was not analyzed.' };
        }
        const findings = parseVisionFindings(outcome.text);
        if (!findings) {
          visionDevLog('[vision] unusable reply', outcome.text.slice(0, 400));
          return { status: 'failed', message: 'Image analysis did not return findings this app can use. The photo was not analyzed.' };
        }
        return { status: 'findings', findings, photoGeneration: args.photoGeneration };
      } catch (error) {
        if (control.cancelled) return { status: 'cancelled' };
        if (error instanceof Error) {
          visionDevLog('[vision] analysis failed', error.message);
        }
        if (error instanceof ScrapEngineBusyError) {
          return { status: 'failed', message: 'On-device analysis is busy. Wait for the current download or photo to finish.' };
        }
        if (error instanceof VisionMultimodalError) {
          return {
            status: 'failed',
            message: 'The vision model did not load on this device, so the photo was not analyzed.',
          };
        }
        if (!loaded && args.platform === 'ios') {
          return {
            status: 'unsupported',
            message: 'Image analysis needs a Metal GPU on this iPhone. This device cannot inspect the photo.',
          };
        }
        if (!loaded) {
          return { status: 'failed', message: 'Image analysis could not start on this Android device. The photo was not analyzed.' };
        }
        return { status: 'failed', message: 'Image analysis could not finish. The photo was not analyzed.' };
      } finally {
        control.context = null;
        if (context && visionPool?.context !== context) {
          await releaseContext(context);
        }
      }
    });
  } catch (error) {
    if (control.cancelled) return { status: 'cancelled' };
    if (error instanceof ScrapEngineBusyError) {
      return { status: 'failed', message: 'On-device analysis is busy. Wait for the current download or photo to finish.' };
    }
    return { status: 'failed', message: 'Image analysis could not start. The photo was not analyzed.' };
  } finally {
    if (activeControl === control) activeControl = null;
  }
}

export function visionCompletionParams(imageUri: string, scanDetail: VisionScanDetail = 'quick'): Record<string, unknown> {
  const params: Record<string, unknown> = {
    messages: [
      { role: 'system', content: VISION_SYSTEM_PROMPT },
      {
        role: 'user',
        content: [
          { type: 'text', text: VISION_USER_PROMPT },
          { type: 'image_url', image_url: { url: imageUri } },
        ],
      },
    ],
    n_predict: scanDetail === 'detailed' ? 320 : VISION_QUICK_N_PREDICT,
    temperature: 0.1,
    enable_thinking: false,
    reasoning_format: 'none',
    stop: ['<|im_end|>', '<|endoftext|>', '<end_of_utterance>'],
    response_format: {
      type: 'json_schema',
      json_schema: { schema: VISION_FINDINGS_SCHEMA },
    },
  };
  return params;
}

export function visionInferenceTimeoutMs(platform: VisionSessionPlatform): number {
  return platform === 'android' ? VISION_TIMEOUT_ANDROID_MS : VISION_TIMEOUT_MS;
}

async function initVisionContext(
  runtime: VisionLlamaRuntime,
  model: string,
  platform: VisionSessionPlatform,
  contextTokens = 4096,
): Promise<VisionLlamaContext> {
  const params = {
    model,
    n_ctx: contextTokens,
    n_gpu_layers: 99,
    ctx_shift: false as const,
  };
  if (platform !== 'android') return runtime.initLlama(params);
  let context: VisionLlamaContext;
  try {
    context = await runtime.initLlama(params);
  } catch {
    return runtime.initLlama({ ...params, n_gpu_layers: 0 });
  }
  if (context.gpu) return context;
  await releaseContext(context);
  return runtime.initLlama({ ...params, n_gpu_layers: 0 });
}

export async function runPatternDraft(args: {
  runtime: VisionLlamaRuntime | null;
  supported: boolean;
  platform: VisionSessionPlatform;
  modelPath: string;
  request: PatternDraftRequest;
  isCurrent: () => boolean;
  timeoutMs?: number;
  scheduleTimeout?: VisionAnalysisArgs['scheduleTimeout'];
}): Promise<PatternDraftCheck | { kind: 'failed'; message: string } | { kind: 'cancelled' } | { kind: 'discarded' }> {
  if (!args.supported || !args.runtime || !visionModelPair(args.platform) || !args.modelPath) {
    return { kind: 'failed', message: 'Pattern drafts need the on-device model, and this device does not have it.' };
  }
  const control = createControl();
  activeControl = control;
  try {
    return await withScrapEngineLock('load', async () => {
      let context: VisionLlamaContext | null = null;
      try {
        context = await initVisionContext(args.runtime!, args.modelPath, args.platform);
        control.context = context;
        if (control.cancelled) return { kind: 'cancelled' };
        if (!args.isCurrent()) return { kind: 'discarded' };
        const completion = context.completion({
          messages: [
            {
              role: 'system',
              content: 'You write one checked crochet draft as JSON. It is not a tested tutorial.',
            },
            { role: 'user', content: patternDraftPrompt(args.request) },
          ],
          n_predict: 700,
          temperature: 0.2,
          enable_thinking: false,
          reasoning_format: 'none',
          stop: ['<|im_end|>', '<|endoftext|>'],
          response_format: {
            type: 'json_schema',
            json_schema: { schema: PATTERN_DRAFT_SCHEMA },
          },
        });
        const outcome = await raceCompletion(
          completion,
          context,
          control,
          args.timeoutMs ?? VISION_TIMEOUT_MS,
          args.scheduleTimeout,
        );
        if (outcome.kind === 'cancelled') return { kind: 'cancelled' };
        if (!args.isCurrent()) return { kind: 'discarded' };
        if (outcome.kind === 'failed') {
          return { kind: 'failed', message: outcome.message };
        }
        if (outcome.kind === 'timeout') {
          return { kind: 'failed', message: 'The draft took too long and was stopped.' };
        }
        return checkPatternDraft(outcome.text, args.request);
      } catch {
        if (control.cancelled) return { kind: 'cancelled' };
        return { kind: 'failed', message: 'The draft could not be created on this device.' };
      } finally {
        control.context = null;
        if (context) await releaseContext(context);
      }
    });
  } catch (error) {
    if (error instanceof ScrapEngineBusyError) {
      return { kind: 'failed', message: 'On-device analysis is busy. Wait for it to finish, then try the draft again.' };
    }
    return { kind: 'failed', message: 'The draft could not be created on this device.' };
  } finally {
    if (activeControl === control) activeControl = null;
  }
}

async function raceCompletion(
  completion: Promise<VisionCompletionResult> | VisionCompletionResult,
  context: VisionLlamaContext,
  control: SessionControl,
  timeoutMs: number,
  scheduleTimeout?: VisionAnalysisArgs['scheduleTimeout'],
): Promise<
  { kind: 'ok'; text: string; timings?: VisionCompletionTimings } | { kind: 'timeout' } | { kind: 'cancelled' } | { kind: 'failed'; message: string }
> {
  let timedOut = false;
  const timer: { current: { cancel: () => void } | null } = { current: null };
  const timeout = new Promise<'timeout'>((resolve) => {
    const start =
      scheduleTimeout ??
      ((ms, fn) => {
        const id = setTimeout(fn, ms);
        return { cancel: () => clearTimeout(id) };
      });
    timer.current = start(timeoutMs, () => {
      timedOut = true;
      fireStopCompletion(context);
      resolve('timeout');
    });
  });
  try {
    const winner = await Promise.race([
      asCompletionPromise(completion).then((result) => ({ kind: 'ok' as const, text: result.text ?? '', timings: result.timings })),
      timeout.then(() => ({ kind: 'timeout' as const })),
    ]);
    if (control.cancelled) return { kind: 'cancelled' };
    if (winner.kind === 'timeout' || timedOut) return { kind: 'timeout' };
    return winner;
  } catch (error) {
    if (control.cancelled) return { kind: 'cancelled' };
    if (timedOut) return { kind: 'timeout' };
    const detail = error instanceof Error ? error.message : 'completion-failed';
    visionDevLog('[vision] completion failed', detail);
    return { kind: 'failed', message: 'Image analysis could not finish. The photo was not analyzed.' };
  } finally {
    timer.current?.cancel();
  }
}

async function releaseContext(context: VisionLlamaContext): Promise<void> {
  try {
    await awaitStopCompletion(context);
  } catch {
    // Stopping a context that already finished is fine.
  }
  try {
    await Promise.resolve(context.releaseMultimodal());
  } catch {
    // The projector may never have loaded.
  }
  try {
    await Promise.resolve(context.release());
  } catch {
    // The context still has to drop if release throws.
  }
}

function createControl(): SessionControl {
  const control: SessionControl = {
    cancelled: false,
    context: null,
    cancel() {
      control.cancelled = true;
      const current = control.context;
      if (current) fireStopCompletion(current);
    },
  };
  return control;
}

function asCompletionPromise(
  completion: Promise<VisionCompletionResult> | VisionCompletionResult,
): Promise<VisionCompletionResult> {
  if (completion != null && typeof (completion as Promise<VisionCompletionResult>).then === 'function') {
    return completion as Promise<VisionCompletionResult>;
  }
  if (completion == null) {
    return Promise.reject(new Error('completion-missing'));
  }
  return Promise.resolve(completion);
}

/** llama.rn may return void from stopCompletion on some native builds. */
function fireStopCompletion(context: { stopCompletion?: () => void | Promise<void> }): void {
  void (async () => {
    try {
      const stop = context.stopCompletion;
      if (typeof stop !== 'function') return;
      await stop();
    } catch {
      // Stopping mid-flight is best-effort.
    }
  })();
}

async function awaitStopCompletion(context: { stopCompletion?: () => void | Promise<void> }): Promise<void> {
  const stop = context.stopCompletion;
  if (typeof stop !== 'function') return;
  await stop();
}
