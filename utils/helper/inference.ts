/** Text-only use of the installed VL language file. Shares the existing native engine lock. */
import { ScrapEngineBusyError, withScrapEngineLock } from '../scrapModelTransfer';
import { HELPER_RESPONSE_SCHEMA } from './context';
export type HelperChatMessage = { role: string; content: string };
export type HelperNativeContext = {
  gpu: boolean;
  completion(params: Record<string, unknown>): Promise<{ text?: string }>;
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
const stop = async (ctx: HelperNativeContext) => { try { await ctx.stopCompletion(); } catch { /* best effort */ } };
export async function runHelperInference(input: {
  runtime: HelperRuntime; modelPath: string; platform: string; messages: HelperChatMessage[];
  signal: AbortSignal; onPhase?: (phase: string) => void; timeoutMs?: number;
}): Promise<string> {
  check(input.signal);
  const controller = new AbortController();
  let context: HelperNativeContext | null = null;
  let timedOut = false;
  const abort = () => controller.abort();
  input.signal.addEventListener('abort', abort, { once: true });
  let rejectAbort!: (error: Error) => void;
  const aborted = new Promise<never>((_, reject) => { rejectAbort = reject; });
  const onAbort = () => {
    if (context) void stop(context);
    rejectAbort(new HelperInferenceError(timedOut ? 'timeout' : 'cancelled'));
  };
  controller.signal.addEventListener('abort', onAbort, { once: true });
  const timer = setTimeout(() => { timedOut = true; controller.abort(); }, input.timeoutMs ?? 120_000);
  const job = withScrapEngineLock('helper-chat', async () => {
    try {
      input.onPhase?.('Loading local helper…');
      const params = { model: input.modelPath, n_ctx: 4096, n_gpu_layers: 99, n_batch: 128, n_parallel: 1, ctx_shift: false as const };
      try { context = await input.runtime.initLlama(params); }
      catch (error) {
        check(controller.signal);
        if (input.platform !== 'android') throw error;
        context = await input.runtime.initLlama({ ...params, n_gpu_layers: 0, n_batch: 64 });
      }
      check(controller.signal);
      if (input.platform === 'ios' && !context.gpu) throw new HelperInferenceError('failed');
      // No projector is loaded: ordinary chat uses only the installed language file.
      let messages = [...input.messages];
      for (;;) {
        const formatted = await context.getFormattedChat(messages, null, { enable_thinking: false, reasoning_format: 'none' });
        const { tokens } = await context.tokenize(formatted.prompt);
        check(controller.signal);
        if (tokens.length <= 3400) break;
        // Retain system/evidence and latest question; drop oldest conversation turns first.
        if (messages.length <= 3) throw new HelperInferenceError('context');
        messages = [...messages.slice(0, 2), ...messages.slice(3)];
      }
      input.onPhase?.('Thinking on this device…');
      const result = await context.completion({
        messages, n_predict: 384, temperature: 0.2, enable_thinking: false, reasoning_format: 'none',
        stop: ['<|im_end|>', '<|endoftext|>'],
        response_format: { type: 'json_schema', json_schema: { schema: HELPER_RESPONSE_SCHEMA } },
      });
      check(controller.signal);
      return result.text ?? '';
    } finally {
      // Keep the shared lock until init/completion settles and native resources are released.
      if (context) { await stop(context); try { await context.release(); } catch { /* native cleanup already attempted */ } }
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
