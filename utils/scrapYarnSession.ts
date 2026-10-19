/**
 * One llama.rn session for scrap personalization.
 * Init cannot be interrupted; the engine lock stays until the context is released.
 */
import type { YarnWeight } from '@/store/machine';
import type { ScrapBenchEntry } from '@/utils/scrapBench';
import { SCRAP_MODEL_PIN } from '@/utils/scrapModelPin';
import { scrapChoiceMessages, scrapChoiceSchema, validateScrapChoices } from '@/utils/scrapModelOutput';
import { ScrapEngineBusyError, resetScrapEngineLockForTests, withScrapEngineLock } from '@/utils/scrapModelTransfer';
import {
  ideasFromPlans,
  rankScrapPlans,
  type ScrapColorRef,
  type ScrapProjectIdea,
} from '@/utils/scrapPlans';

export const INFERENCE_TIMEOUT_MS = 45_000;

/** Hexagon HTP is experimental. Leave this off unless a device run opts in. */
export const SCRAP_HEXAGON_OPT_IN = false;

export type ScrapSessionPlatform = 'ios' | 'android' | 'web' | 'macos' | 'windows';

export type ScrapLlamaContext = {
  gpu: boolean;
  devices?: string[];
  reasonNoGPU?: string;
  completion: (params: Record<string, unknown>) => Promise<{ text?: string }>;
  stopCompletion: () => Promise<void>;
  release: () => Promise<void>;
};

export type ScrapLlamaRuntime = {
  initLlama: (params: {
    model: string;
    n_ctx: number;
    n_gpu_layers: number;
    devices?: string[];
  }) => Promise<ScrapLlamaContext>;
};

export type PersonalizedScrapResult = {
  source: 'local-ai' | 'offline-rules';
  ideas: ScrapProjectIdea[];
  note?: string;
  discarded?: boolean;
  diagnostics?: ScrapBenchEntry;
};

export type PersonalizedScrapArgs = {
  runtime: ScrapLlamaRuntime | null;
  supported: boolean;
  modelReady: boolean;
  modelPath: string;
  platform: ScrapSessionPlatform;
  colors: readonly ScrapColorRef[];
  weight: YarnWeight;
  availableYards: number;
  timeoutMs?: number;
  peakMemoryBytes?: number | null;
  now?: () => number;
  scheduleTimeout?: (ms: number, fn: () => void) => { cancel: () => void };
};

type SessionControl = {
  cancelled: boolean;
  context: ScrapLlamaContext | null;
  cancel: () => void;
};

let activeControl: SessionControl | null = null;
let inFlight: Promise<PersonalizedScrapResult> | null = null;

export function resetScrapSessionForTests(): void {
  activeControl?.cancel();
  activeControl = null;
  inFlight = null;
  resetScrapEngineLockForTests();
}

export function cancelActiveScrapSuggestion(): void {
  activeControl?.cancel();
}

export function scrapInputId(colors: readonly ScrapColorRef[], weight: string, yards: number): string {
  const tokens = colors.map((color) => `${color.name}:${color.hex}`).sort();
  return `${weight}:${yards}:${tokens.join('|')}`;
}

export function runPersonalizedScrapSuggestion(args: PersonalizedScrapArgs): Promise<PersonalizedScrapResult> {
  if (inFlight) return inFlight;
  const promise = executePersonalized(args);
  inFlight = promise;
  void promise.finally(() => {
    if (inFlight === promise) inFlight = null;
  });
  return promise;
}

async function executePersonalized(args: PersonalizedScrapArgs): Promise<PersonalizedScrapResult> {
  const plans = rankScrapPlans(args.availableYards);
  const offlineIdeas = ideasFromPlans(plans, args.colors, args.weight);
  const offline = (note: string, discarded = false): PersonalizedScrapResult => ({
    source: 'offline-rules',
    ideas: offlineIdeas,
    note,
    ...(discarded ? { discarded: true } : {}),
  });

  if (!args.supported || !args.runtime) {
    return offline('On-device AI is unavailable in Expo Go and on the web, so these ideas use the offline scrap plans.');
  }
  if (!args.modelReady) {
    return offline('Download the local AI engine to personalize color placement. These ideas already fit the yards you entered.');
  }
  if (plans.length === 0 || args.colors.length === 0) {
    return offline('None of the planning estimates fit this yard total.');
  }

  const control = createControl();
  activeControl = control;
  const started = (args.now ?? Date.now)();
  try {
    return await withScrapEngineLock('load', async () => {
      let context: ScrapLlamaContext | null = null;
      try {
        context = await initScrapContext(args.runtime!, args.modelPath, args.platform, control);
        control.context = context;
        if (control.cancelled) return offline('Suggestion cancelled.', true);
        const schema = scrapChoiceSchema(
          plans.map((plan) => plan.id),
          args.colors.map((color) => `${color.name.trim()} (${color.hex.trim()})`),
        );
        const completion = context.completion({
          messages: scrapChoiceMessages({
            plans,
            colors: args.colors,
            weight: args.weight,
            availableYards: args.availableYards,
          }),
          n_predict: 320,
          temperature: 0.2,
          stop: ['<|im_end|>', '<|endoftext|>'],
          response_format: {
            type: 'json_schema',
            json_schema: { schema },
          },
        });
        const outcome = await raceCompletion(
          completion,
          context,
          control,
          args.timeoutMs ?? INFERENCE_TIMEOUT_MS,
          args.scheduleTimeout,
        );
        if (outcome.kind === 'cancelled') return offline('Suggestion cancelled.', true);
        if (outcome.kind === 'timeout') {
          return offline('The local model took too long, so these ideas use the offline scrap plans.');
        }
        const validated = validateScrapChoices(outcome.text, plans, args.colors, args.weight, args.availableYards);
        const latencyMs = Math.max(0, (args.now ?? Date.now)() - started);
        const diagnostics = benchEntry(context, args, latencyMs, validated.ideas != null, validated.violations);
        if (!validated.ideas) {
          return {
            ...offline('The local model did not stay within these plans and colors, so the offline planning list is shown.'),
            diagnostics,
          };
        }
        return {
          source: 'local-ai',
          ideas: validated.ideas,
          note: 'Color placement was personalized on this device. Yardage and hook size stay with the app plans.',
          diagnostics,
        };
      } finally {
        control.context = null;
        if (context) await releaseContext(context);
      }
    });
  } catch (error) {
    if (control.cancelled) return offline('Suggestion cancelled.', true);
    if (error instanceof ScrapEngineBusyError) {
      return offline('The local engine is busy. Wait for the current download or suggestion to finish.');
    }
    return offline('The local model could not finish, so these ideas use the offline scrap plans.');
  } finally {
    if (activeControl === control) activeControl = null;
  }
}

async function initScrapContext(
  runtime: ScrapLlamaRuntime,
  model: string,
  platform: ScrapSessionPlatform,
  control: SessionControl,
): Promise<ScrapLlamaContext> {
  try {
    return await runtime.initLlama({
      model,
      n_ctx: 2048,
      n_gpu_layers: 99,
      ...(platform === 'android' && SCRAP_HEXAGON_OPT_IN ? { devices: ['HTP0'] } : {}),
    });
  } catch (error) {
    if (control.cancelled || platform !== 'android') throw error;
    return runtime.initLlama({
      model,
      n_ctx: 2048,
      n_gpu_layers: 0,
    });
  }
}

async function raceCompletion(
  completion: Promise<{ text?: string }>,
  context: ScrapLlamaContext,
  control: SessionControl,
  timeoutMs: number,
  scheduleTimeout?: PersonalizedScrapArgs['scheduleTimeout'],
): Promise<{ kind: 'ok'; text: string } | { kind: 'timeout' } | { kind: 'cancelled' }> {
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
      void context.stopCompletion().catch(() => undefined);
      resolve('timeout');
    });
  });
  try {
    const winner = await Promise.race([
      completion.then((result) => ({ kind: 'ok' as const, text: result.text ?? '' })),
      timeout.then(() => ({ kind: 'timeout' as const })),
    ]);
    if (control.cancelled) return { kind: 'cancelled' };
    if (winner.kind === 'timeout' || timedOut) return { kind: 'timeout' };
    return winner;
  } catch {
    if (control.cancelled) return { kind: 'cancelled' };
    if (timedOut) return { kind: 'timeout' };
    throw new Error('completion-failed');
  } finally {
    timer.current?.cancel();
  }
}

function benchEntry(
  context: ScrapLlamaContext,
  args: PersonalizedScrapArgs,
  latencyMs: number,
  valid: boolean,
  violations: number,
): ScrapBenchEntry {
  return {
    modelId: SCRAP_MODEL_PIN.id,
    downloadBytes: SCRAP_MODEL_PIN.bytes,
    inputId: scrapInputId(args.colors, args.weight, args.availableYards),
    valid,
    violations,
    latencyMs,
    peakMemoryBytes: args.peakMemoryBytes ?? null,
    gpu: context.gpu,
    devices: context.devices ?? [],
    reasonNoGPU: context.reasonNoGPU ?? '',
  };
}

async function releaseContext(context: ScrapLlamaContext): Promise<void> {
  try {
    await context.stopCompletion();
  } catch {
    // Stopping a context that already finished is fine.
  }
  try {
    await context.release();
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
      if (current) void current.stopCompletion().catch(() => undefined);
    },
  };
  return control;
}
