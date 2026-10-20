/** Bounded, streaming text chat with one short-lived native context. No image projector. */
import { registerScrapIdleCleanup, ScrapEngineBusyError, withScrapEngineLock } from '../scrapModelTransfer';
import { cleanHelperAnswer } from './replies';
export type HelperChatMessage = { role: string; content: string };
export type HelperToken = { token: string; accumulated_text?: string; content?: string };
export type HelperNativeContext = {
  gpu: boolean;
  completion(params: Record<string, unknown>, onToken?: (data: HelperToken) => void): Promise<{ text?: string; content?: string }>;
  stopCompletion(): void | Promise<void>;
  release(): void | Promise<void>;
  getFormattedChat(messages: HelperChatMessage[], template?: string | null, params?: object): Promise<{ prompt: string }>;
  tokenize(text: string): Promise<{ tokens: number[] }>;
};
export type HelperRuntime = { initLlama(params: { model: string; n_ctx: number; n_gpu_layers: number; ctx_shift: false; n_batch: number; n_parallel: number }): Promise<HelperNativeContext> };
export class HelperInferenceError extends Error {
  constructor(public code: 'busy' | 'cancelled' | 'timeout' | 'context' | 'failed') { super(code); this.name = 'HelperInferenceError'; }
}
const check = (signal: AbortSignal) => { if (signal.aborted) throw new HelperInferenceError('cancelled'); };
const stop = async (ctx: HelperNativeContext) => { try { await ctx.stopCompletion(); } catch { /* best effort; lock stays held until completion settles */ } };
type Input = {
  runtime: HelperRuntime; modelPath: string; platform: string; messages: HelperChatMessage[];
  signal: AbortSignal; onPhase?: (phase: string) => void; onText?: (text: string) => void; timeoutMs?: number;
};
type CachedContext = { context: HelperNativeContext; modelPath: string; runtime: HelperRuntime; platform: string };

export class HelperInferenceEngine {
  private cached: CachedContext | null = null;
  private running = false;
  private revision = 0;
  private idleTimer: ReturnType<typeof setTimeout> | null = null;
  private unregister: (() => void) | null = null;
  private releasing: Promise<void> | null = null;
  constructor(private idleMs = 180_000) {}

  /** Active requests finish cleanup under their lock; idle contexts release immediately. */
  dispose = async (): Promise<void> => {
    this.revision++;
    this.clearIdleTimer();
    if (!this.running) await this.releaseIdle();
  };
  private clearIdleTimer(): void {
    if (this.idleTimer) clearTimeout(this.idleTimer);
    this.idleTimer = null;
  }
  private async releaseIdle(): Promise<void> {
    this.clearIdleTimer();
    const cached = this.cached; this.cached = null;
    if (cached) {
      // Publish the pending release before another operation can reuse the engine.
      this.releasing = Promise.resolve().then(() => cached.context.release()).then(() => undefined);
    }
    const pending = this.releasing;
    if (pending) { await pending; if (this.releasing === pending) this.releasing = null; }
    this.unregister?.(); this.unregister = null;
  }

  async run(input: Input): Promise<string> {
    check(input.signal);
    const controller = new AbortController();
    let context: HelperNativeContext | null = null;
    let timedOut = false;
    let rejectAbort!: (error: Error) => void;
    const aborted = new Promise<never>((_, reject) => { rejectAbort = reject; });
    const onAbort = () => {
      if (context) void stop(context);
      rejectAbort(new HelperInferenceError(timedOut ? 'timeout' : 'cancelled'));
    };
    controller.signal.addEventListener('abort', onAbort, { once: true });
    const abort = () => controller.abort();
    input.signal.addEventListener('abort', abort, { once: true });
    const timer = setTimeout(() => { timedOut = true; controller.abort(); }, input.timeoutMs ?? 45_000);
    const job = withScrapEngineLock('helper-chat', async () => {
      this.running = true;
      this.clearIdleTimer();
      const revision = this.revision;
      let successful = false;
      try {
        check(controller.signal);
        if (this.releasing) await this.releasing;
        if (this.cached && (this.cached.modelPath !== input.modelPath || this.cached.platform !== input.platform || this.cached.runtime !== input.runtime)) await this.releaseIdle();
        context = this.cached?.context ?? null;
        if (!context) {
          input.onPhase?.('Loading local helper… First question can take a moment.');
          // Android OpenCL init aborts the process for this text model, so stay on CPU.
          const params = {
            model: input.modelPath,
            n_ctx: 2048,
            n_gpu_layers: input.platform === 'android' ? 0 : 99,
            n_batch: input.platform === 'android' ? 64 : 128,
            n_parallel: 1,
            ctx_shift: false as const,
          };
          context = await input.runtime.initLlama(params);
          this.cached = { context, modelPath: input.modelPath, platform: input.platform, runtime: input.runtime };
        }
        check(controller.signal);
        if (input.platform === 'ios' && !context.gpu) throw new HelperInferenceError('failed');
        let messages = [...input.messages];
        let prompt: string;
        for (;;) {
          // Keep the plain chat template. Thinking flags abort Qwen text models that have no reasoning parser.
          const formatted = await context.getFormattedChat(messages, null, { jinja: false });
          if (typeof formatted?.prompt !== 'string' || !formatted.prompt) throw new HelperInferenceError('failed');
          const tokenized = await context.tokenize(formatted.prompt);
          const tokens = tokenized?.tokens;
          check(controller.signal);
          if (!Array.isArray(tokens)) throw new HelperInferenceError('failed');
          if (tokens.length <= 1600) { prompt = formatted.prompt; break; }
          if (messages.length <= 3) throw new HelperInferenceError('context');
          messages = [...messages.slice(0, 2), ...messages.slice(3)];
        }
        input.onPhase?.('Writing on this device…');
        let raw = ''; let lastText = ''; let lastEmit = 0; let stopped = false;
        const requestStop = () => { if (!stopped) { stopped = true; void stop(context!); } };
        const result = await context.completion({
          prompt, n_predict: 160, temperature: 0.25, top_k: 40, top_p: 0.9,
          penalty_last_n: 128, penalty_repeat: 1.15, penalty_freq: 0.1,
          ignore_eos: false,
          stop: ['<|im_end|>', '<|endoftext|>', '<|im_start|>', '\nUser:', '\nHuman:', ' #'],
        }, (token) => {
          if (controller.signal.aborted || stopped) return;
          try {
          raw = token.accumulated_text ?? (raw + token.token);
          const text = cleanHelperAnswer(raw);
          // Stop runaway output rather than waiting for the token/deadline limit.
          if (raw.length > 1200 || /\s+#[a-z]/i.test(raw) || /(.{12,90}?)\1\1/i.test(raw)) requestStop();
          if (text !== lastText && (lastEmit === 0 || Date.now() - lastEmit >= 80)) {
            lastText = text; lastEmit = Date.now(); input.onText?.(text);
          }
          } catch { /* a bad token must not escape into the native callback */ }
        });
        check(controller.signal);
        const answer = cleanHelperAnswer(result.content || result.text || raw, true);
        if (!answer) throw new HelperInferenceError('failed');
        input.onText?.(answer);
        successful = true;
        return answer;
      } finally {
        // Cancellation returns control immediately, but native completion/init must settle before unlocking.
        if (context) await stop(context);
        this.running = false;
        if (!successful || controller.signal.aborted || this.revision !== revision) await this.releaseIdle();
        else {
          this.unregister?.();
          this.unregister = registerScrapIdleCleanup('helper-chat', this.dispose);
          this.idleTimer = setTimeout(() => { void this.dispose().catch(() => undefined); }, this.idleMs);
        }
        context = null;
      }
    });
    const cleanup = () => {
      clearTimeout(timer);
      input.signal.removeEventListener('abort', abort);
      controller.signal.removeEventListener('abort', onAbort);
    };
    void job.then(cleanup, cleanup);
    try { return await Promise.race([job, aborted]); }
    catch (error) {
      if (error instanceof HelperInferenceError) throw error;
      if (error instanceof ScrapEngineBusyError) throw new HelperInferenceError('busy');
      throw new HelperInferenceError('failed');
    } finally { clearTimeout(timer); }
  }
}
export const helperInference = new HelperInferenceEngine();
export const runHelperInference = (input: Input): Promise<string> => helperInference.run(input);
